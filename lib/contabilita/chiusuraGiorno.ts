// Aggregazione contabile su un intervallo di date. Legge i dati operativi già presenti
// (Ordine/RigaOrdine, Turno, CostoFisso, ContabilitaConfig) e li trasforma nel conto
// economico gestionale. È il motore dietro /api/contabilita/summary e il cron serale.

import { prisma } from '@/lib/prisma'
import { scorpora, risolviAliquotaVendita } from './iva'
import { costoOrarioReale, costoTurno } from './labor'
import { quotaPeriodo, ivaCreditoMensile } from './costiFissi'
import { calcolaContoEconomico, statoSemaforo, type ContoEconomico, type StatoSemaforo } from './spendibile'

export interface RiepilogoContabile {
  conto: ContoEconomico
  semaforo: StatoSemaforo
  giorni: number
  perReparto: { reparto: string; netto: number }[]
  perCanale: { canale: string; netto: number }[]
  perCategoriaCosto: { categoria: string; importo: number }[]
  coperti: number
  ordini: number
}

// Numero di giorni "trascorsi" dell'intervallo (per spalmare i costi fissi in modo equo):
// da inizio fino a min(fine, adesso), minimo 1.
function giorniTrascorsi(inizio: Date, fine: Date): number {
  const now = new Date()
  const limite = fine < now ? fine : now
  const ms = limite.getTime() - inizio.getTime()
  return Math.max(1, Math.ceil(ms / 86_400_000))
}

export async function riepilogoContabile(
  userId: string,
  inizio: Date,
  fine: Date,
): Promise<RiepilogoContabile> {
  const [config, ordini, turni, costiFissi] = await Promise.all([
    prisma.contabilitaConfig.findUnique({ where: { userId } }),
    prisma.ordine.findMany({
      where: { userId, createdAt: { gte: inizio, lt: fine } },
      select: {
        tipo: true,
        coperti: true,
        righe: {
          select: {
            prezzo: true,
            quantita: true,
            foodCost: true,
            aliquotaVendita: true,
            piatto: {
              select: {
                aliquotaVendita: true,
                categoria: { select: { aliquotaVendita: true, reparto: true } },
              },
            },
          },
        },
      },
    }),
    prisma.turno.findMany({
      where: { userId, data: { gte: inizio, lt: fine } },
      select: {
        oraInizio: true,
        oraFine: true,
        tipoTariffa: true,
        maggiorazione: true,
        forfaitImporto: true,
        dipendente: { select: { pagaOrariaBaseNetta: true, moltiplicatoreCostoAzienda: true } },
      },
    }),
    prisma.costoFisso.findMany({ where: { userId, attivo: true } }),
  ])

  const defaultLocale = config?.aliquotaVenditaDefault ?? 0.1
  const percAccantonamento = config?.percentualeAccantonamentoImposte ?? 0.15
  // In regime forfettario non c'è IVA: non si applica in rivalsa sulle vendite e non si
  // detrae sugli acquisti. Quindi niente scorporo (l'incasso è tutto imponibile) e niente
  // IVA a credito sui costi fissi. Nel regime ordinario tutto resta come prima.
  const forfettario = config?.regimeFiscale === 'forfettario'

  // ── Vendite: scorporo IVA riga per riga + split reparto/canale ──────────────
  let fatturatoLordo = 0
  let ivaDebito = 0
  let foodCostVenduto = 0
  let coperti = 0
  const perRepartoMap = new Map<string, number>()
  const perCanaleMap = new Map<string, number>()

  for (const o of ordini) {
    coperti += o.coperti ?? 0
    const canale = o.tipo || 'tavolo'
    for (const r of o.righe) {
      const lordoRiga = r.prezzo * r.quantita
      const aliquota = risolviAliquotaVendita({
        rigaAliquota: r.aliquotaVendita,
        piattoAliquota: r.piatto?.aliquotaVendita,
        categoriaAliquota: r.piatto?.categoria?.aliquotaVendita,
        defaultLocale,
      })
      const { imponibile, iva } = forfettario ? { imponibile: lordoRiga, iva: 0 } : scorpora(lordoRiga, aliquota)
      fatturatoLordo += lordoRiga
      ivaDebito += iva
      foodCostVenduto += (r.foodCost ?? 0) * r.quantita

      const reparto = r.piatto?.categoria?.reparto || 'Cucina'
      perRepartoMap.set(reparto, (perRepartoMap.get(reparto) ?? 0) + imponibile)
      perCanaleMap.set(canale, (perCanaleMap.get(canale) ?? 0) + imponibile)
    }
  }

  // ── Labor cost dai turni (ciascuno porta la sua tariffa) ────────────────────
  let laborCost = 0
  for (const t of turni) {
    const oraria = costoOrarioReale(t.dipendente.pagaOrariaBaseNetta, t.dipendente.moltiplicatoreCostoAzienda)
    laborCost += costoTurno(t, oraria)
  }

  // ── Costi fissi: quota del periodo + IVA a credito proporzionale ────────────
  const giorni = giorniTrascorsi(inizio, fine)
  const quotaCostiFissi = quotaPeriodo(costiFissi, giorni)
  const ivaCreditoFissi = forfettario ? 0 : (ivaCreditoMensile(costiFissi) / 30) * giorni

  const perCategoriaCostoMap = new Map<string, number>()
  for (const c of costiFissi) {
    // normalizzato al periodo mostrato
    const mensile = c.periodicita === 'annuale' ? c.importoNetto / 12 : c.periodicita === 'trimestrale' ? c.importoNetto / 3 : c.importoNetto
    perCategoriaCostoMap.set(c.categoria, (perCategoriaCostoMap.get(c.categoria) ?? 0) + (mensile / 30) * giorni)
  }

  const conto = calcolaContoEconomico({
    fatturatoLordo,
    ivaDebito,
    ivaCredito: ivaCreditoFissi,
    foodCostVenduto,
    laborCost,
    quotaCostiFissi,
    percentualeAccantonamentoImposte: percAccantonamento,
  })

  return {
    conto,
    semaforo: statoSemaforo(conto.marginePct),
    giorni,
    coperti,
    ordini: ordini.length,
    perReparto: [...perRepartoMap.entries()].map(([reparto, netto]) => ({ reparto, netto })).sort((a, b) => b.netto - a.netto),
    perCanale: [...perCanaleMap.entries()].map(([canale, netto]) => ({ canale, netto })).sort((a, b) => b.netto - a.netto),
    perCategoriaCosto: [...perCategoriaCostoMap.entries()].map(([categoria, importo]) => ({ categoria, importo })).sort((a, b) => b.importo - a.importo),
  }
}

// Chiude un singolo giorno (fuso Europe/Rome) e salva lo snapshot in ChiusuraGiorno.
// Idempotente: upsert su (userId, data). Chiamata dal cron serale.
export async function chiudiGiorno(userId: string, giornoInizio: Date): Promise<void> {
  const giornoFine = new Date(giornoInizio.getTime() + 86_400_000)
  const r = await riepilogoContabile(userId, giornoInizio, giornoFine)
  const c = r.conto
  await prisma.chiusuraGiorno.upsert({
    where: { userId_data: { userId, data: giornoInizio } },
    update: {
      fatturatoLordo: c.fatturatoLordo, ivaDebito: c.ivaDebito, fatturatoNetto: c.fatturatoNetto,
      foodCostVenduto: c.foodCostVenduto, laborCost: c.laborCost, quotaCostiFissi: c.quotaCostiFissi,
      ivaCredito: c.ivaCredito, ivaNetta: c.ivaNetta, accantonamentoImposte: c.accantonamentoImposte,
      utileStimato: c.utileStimato, spendibile: c.spendibile.livello4,
    },
    create: {
      userId, data: giornoInizio,
      fatturatoLordo: c.fatturatoLordo, ivaDebito: c.ivaDebito, fatturatoNetto: c.fatturatoNetto,
      foodCostVenduto: c.foodCostVenduto, laborCost: c.laborCost, quotaCostiFissi: c.quotaCostiFissi,
      ivaCredito: c.ivaCredito, ivaNetta: c.ivaNetta, accantonamentoImposte: c.accantonamentoImposte,
      utileStimato: c.utileStimato, spendibile: c.spendibile.livello4,
    },
  })
}

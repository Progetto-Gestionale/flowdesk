// Aggregazione contabile su un intervallo di date. Legge i dati operativi già presenti
// (Ordine/RigaOrdine, Turno, CostoFisso, ContabilitaConfig) e li trasforma nel conto
// economico gestionale. È il motore dietro /api/contabilita/summary e il cron serale.

import { prisma } from '@/lib/prisma'
import { scorpora, risolviAliquotaVendita } from './iva'
import { costoOrarioReale, costoTurno, oreTraOrari, oreDaTimbrature, tariffaAllaData, MOLTIPLICATORE_DEFAULT, type TariffaStorica } from './labor'
import { quotaPeriodo, ivaCreditoMensile } from './costiFissi'
import { calcolaContoEconomico, statoSemaforo, type ContoEconomico, type StatoSemaforo } from './spendibile'

export interface RigaIvaAliquota { aliquota: number; imponibile: number; iva: number }

export interface RiepilogoContabile {
  conto: ContoEconomico
  semaforo: StatoSemaforo
  giorni: number
  perReparto: { reparto: string; netto: number }[]
  perCanale: { canale: string; netto: number }[]
  perCategoriaCosto: { categoria: string; importo: number }[]
  coperti: number
  ordini: number
  // F3 · acquisti da bolle fornitori del periodo (netto). Alimentano l'IVA a credito reale
  // e il confronto "comprato vs consumato"; NON entrano nell'EBITDA (che usa il food cost venduto).
  acquisti: { nettoMerci: number; nettoTotale: number; ivaCredito: number; numero: number }
  // Castelletto IVA per aliquota (per l'export/registro del commercialista).
  ivaVenditePerAliquota: RigaIvaAliquota[]
  ivaAcquistiPerAliquota: RigaIvaAliquota[]
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
  const [config, ordini, turni, costiFissi, storicoPaga, fatture, timbrature] = await Promise.all([
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
        data: true,
        dipendenteId: true,
        oraInizio: true,
        oraFine: true,
        tipoTariffa: true,
        maggiorazione: true,
        forfaitImporto: true,
        dipendente: { select: { pagaOrariaBaseNetta: true, moltiplicatoreCostoAzienda: true } },
      },
    }),
    prisma.costoFisso.findMany({ where: { userId, attivo: true } }),
    prisma.dipendentePagaStorico.findMany({
      where: { userId },
      select: { dipendenteId: true, dataInizio: true, pagaOrariaBaseNetta: true, moltiplicatoreCostoAzienda: true },
    }),
    prisma.fattura.findMany({
      where: { userId, data: { gte: inizio, lt: fine } },
      select: { categoria: true, righe: { select: { imponibile: true, aliquota: true } } },
    }),
    // Timbrature del periodo: servono solo se la fonte ore è "timbrature" (usate sotto).
    prisma.timbratura.findMany({
      where: { userId, timestamp: { gte: inizio, lt: fine } },
      select: { dipendenteId: true, tipo: true, timestamp: true },
    }),
  ])

  // Storico tariffe indicizzato per dipendente (per risolvere la paga alla data del turno).
  const storicoPerDip = new Map<string, TariffaStorica[]>()
  for (const s of storicoPaga) {
    const arr = storicoPerDip.get(s.dipendenteId) ?? []
    arr.push(s)
    storicoPerDip.set(s.dipendenteId, arr)
  }

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
  // Castelletto IVA vendite per aliquota → { imponibile, iva } (registro/commercialista).
  const ivaVenditeMap = new Map<number, { imponibile: number; iva: number }>()

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

      const bucket = ivaVenditeMap.get(aliquota) ?? { imponibile: 0, iva: 0 }
      bucket.imponibile += imponibile
      bucket.iva += iva
      ivaVenditeMap.set(aliquota, bucket)
    }
  }

  // ── Acquisti da bolle fornitori: IVA a credito reale + castelletto + totale merci ──
  // In forfettario l'IVA sugli acquisti non si detrae → credito 0 (ma i totali netti restano
  // per il confronto "comprato vs consumato"). Gli acquisti NON entrano nell'EBITDA.
  let ivaCreditoAcquisti = 0
  let acquistiNettoTotale = 0
  let acquistiNettoMerci = 0
  const ivaAcquistiMap = new Map<number, { imponibile: number; iva: number }>()
  for (const f of fatture) {
    const merce = f.categoria === 'merci' || f.categoria === 'bevande'
    for (const r of f.righe) {
      const ivaRiga = forfettario ? 0 : r.imponibile * r.aliquota
      ivaCreditoAcquisti += ivaRiga
      acquistiNettoTotale += r.imponibile
      if (merce) acquistiNettoMerci += r.imponibile
      const bucket = ivaAcquistiMap.get(r.aliquota) ?? { imponibile: 0, iva: 0 }
      bucket.imponibile += r.imponibile
      bucket.iva += ivaRiga
      ivaAcquistiMap.set(r.aliquota, bucket)
    }
  }

  // ── Labor cost dai turni ────────────────────────────────────────────────────
  // La paga è quella in vigore alla DATA del turno (storico con date di validità): un
  // aumento non riscrive la contabilità passata. Fallback alla paga corrente sul Dipendente
  // solo per chi non ha ancora storico (stato legacy pre-migrazione).
  //
  // FONTE ORE (config.fonteOreLabor): "turni" usa gli orari pianificati; "timbrature" usa
  // le ore reali entrata/uscita del giorno, RIDISTRIBUITE sui turni non-forfait di quel
  // dipendente/giorno in proporzione alle ore pianificate (così le maggiorazioni per turno
  // restano) — con fallback ai turni pianificati quando quel giorno non ci sono timbri.
  const usaTimbrature = config?.fonteOreLabor === 'timbrature'
  const giornoRoma = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })

  // Ore reali per (dipendente, giorno) dai timbri, e ore pianificate non-forfait per lo
  // stesso raggruppamento (denominatore della ridistribuzione). Calcolati solo se servono.
  const oreRealiPerDipGiorno = new Map<string, number>()
  const orePianNonForfaitPerDipGiorno = new Map<string, number>()
  if (usaTimbrature) {
    const timbriPerGruppo = new Map<string, { tipo: string; timestamp: Date }[]>()
    for (const tb of timbrature) {
      const k = `${tb.dipendenteId}|${giornoRoma(tb.timestamp)}`
      const arr = timbriPerGruppo.get(k) ?? []
      arr.push({ tipo: tb.tipo, timestamp: tb.timestamp })
      timbriPerGruppo.set(k, arr)
    }
    for (const [k, arr] of timbriPerGruppo) oreRealiPerDipGiorno.set(k, oreDaTimbrature(arr))
    for (const t of turni) {
      if (t.tipoTariffa === 'forfait') continue
      const k = `${t.dipendenteId}|${giornoRoma(t.data)}`
      orePianNonForfaitPerDipGiorno.set(k, (orePianNonForfaitPerDipGiorno.get(k) ?? 0) + oreTraOrari(t.oraInizio, t.oraFine))
    }
  }

  let laborCost = 0
  for (const t of turni) {
    const storico = storicoPerDip.get(t.dipendenteId)
    let paga: number | null = t.dipendente.pagaOrariaBaseNetta
    let molt: number | null = t.dipendente.moltiplicatoreCostoAzienda
    if (storico && storico.length > 0) {
      const tar = tariffaAllaData(storico, t.data)
      paga = tar?.pagaOrariaBaseNetta ?? null
      molt = tar?.moltiplicatoreCostoAzienda ?? null
    }
    const oraria = costoOrarioReale(paga, molt)
    const moltEff = molt ?? MOLTIPLICATORE_DEFAULT // usato per il gross-up del forfait (netto → azienda)

    // Ore reali (ridistribuite) se la fonte è timbrature e ci sono timbri per quel giorno.
    let oreReali: number | undefined
    if (usaTimbrature && t.tipoTariffa !== 'forfait') {
      const k = `${t.dipendenteId}|${giornoRoma(t.data)}`
      const reali = oreRealiPerDipGiorno.get(k)
      const pian = orePianNonForfaitPerDipGiorno.get(k) ?? 0
      if (reali != null && reali > 0 && pian > 0) {
        oreReali = reali * (oreTraOrari(t.oraInizio, t.oraFine) / pian)
      }
    }
    laborCost += costoTurno(t, oraria, oreReali, moltEff)
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
    ivaCredito: ivaCreditoFissi + ivaCreditoAcquisti, // fissi + bolle fornitori (F3)
    foodCostVenduto,
    laborCost,
    quotaCostiFissi,
    percentualeAccantonamentoImposte: percAccantonamento,
    // Regime: forfettario tassa i ricavi × coefficiente; ordinario stima sull'EBITDA.
    regimeFiscale: forfettario ? 'forfettario' : 'ordinario',
    coefficienteRedditivita: config?.coefficienteRedditivita ?? 0.40,
    aliquotaImpostaForfettario: config?.aliquotaImpostaForfettario ?? 0.15,
  })

  const perAliquota = (m: Map<number, { imponibile: number; iva: number }>): RigaIvaAliquota[] =>
    [...m.entries()].map(([aliquota, v]) => ({ aliquota, imponibile: v.imponibile, iva: v.iva })).sort((a, b) => a.aliquota - b.aliquota)

  return {
    conto,
    semaforo: statoSemaforo(conto.marginePct),
    giorni,
    coperti,
    ordini: ordini.length,
    perReparto: [...perRepartoMap.entries()].map(([reparto, netto]) => ({ reparto, netto })).sort((a, b) => b.netto - a.netto),
    perCanale: [...perCanaleMap.entries()].map(([canale, netto]) => ({ canale, netto })).sort((a, b) => b.netto - a.netto),
    perCategoriaCosto: [...perCategoriaCostoMap.entries()].map(([categoria, importo]) => ({ categoria, importo })).sort((a, b) => b.importo - a.importo),
    acquisti: { nettoMerci: acquistiNettoMerci, nettoTotale: acquistiNettoTotale, ivaCredito: ivaCreditoAcquisti, numero: fatture.length },
    ivaVenditePerAliquota: perAliquota(ivaVenditeMap),
    ivaAcquistiPerAliquota: perAliquota(ivaAcquistiMap),
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

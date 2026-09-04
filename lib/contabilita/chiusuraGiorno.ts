// Aggregazione contabile su un intervallo di date. Legge i dati operativi già presenti
// (Ordine/RigaOrdine, Turno, Timbratura, CostoFisso, CostoUnaTantum) e ne ricava i
// componenti grezzi della vista di CASSA: incassi lordi, food cost venduto, labor cost,
// quota lorda dei costi fissi. Niente IVA, niente margini: la vista di cassa (e il semaforo)
// vivono in lib/contabilita/cassa.ts. È il motore dietro /api/contabilita/summary, l'export
// e il Ponte AI.

import { prisma } from '@/lib/prisma'
import { costoOrarioReale, costoTurno, oreTraOrari, oreDaTimbrature, tariffaAllaData, MOLTIPLICATORE_DEFAULT, type TariffaStorica } from './labor'
import { quotaPeriodo, importoMensile, lordoCosto } from './costiFissi'
import type { ContoEconomico } from './cassa'
import { WHERE_CONTO_CHIUSO } from '@/lib/ordini/contoChiuso'

export interface RiepilogoContabile {
  conto: ContoEconomico
  giorni: number
  // Incassi LORDI del periodo per reparto/canale (il nome `netto` è storico: ora è lordo).
  perReparto: { reparto: string; netto: number }[]
  perCanale: { canale: string; netto: number }[]
  perCategoriaCosto: { categoria: string; importo: number }[]
  coperti: number
  ordini: number
  // Acquisti da bolle fornitori del periodo (netto): alimentano il confronto "comprato vs
  // consumato". NON entrano nella cassa (che usa il food cost venduto dei piatti).
  acquisti: { nettoMerci: number; nettoTotale: number; numero: number }
}

// Numero di giorni "trascorsi" dell'intervallo (per spalmare i costi fissi in modo equo):
// da inizio fino a min(fine, adesso), minimo 1.
function giorniTrascorsi(inizio: Date, fine: Date): number {
  const now = new Date()
  const limite = fine < now ? fine : now
  const ms = limite.getTime() - inizio.getTime()
  return Math.max(1, Math.ceil(ms / 86_400_000))
}

// Quota netta di un costo una tantum che cade nell'intervallo [inizio, fine).
// Il costo copre [dataInizio, dataFine+1giorno) (dataFine inclusa); l'importo totale si
// spalma equamente sui giorni coperti, e restituiamo la parte proporzionale ai giorni che
// intersecano il periodo richiesto. Così una spesa "cameriere extra 6-12 lug" contribuisce
// per intero al mese di luglio e per i soli giorni giusti a un report settimanale.
function quotaUnaTantum(
  c: { importoNetto: number; dataInizio: Date; dataFine: Date },
  inizio: Date,
  fine: Date,
): number {
  const DAY = 86_400_000
  const covStart = c.dataInizio.getTime()
  const covEnd = c.dataFine.getTime() + DAY // dataFine inclusa
  const giorniCoperti = Math.max(1, Math.round((covEnd - covStart) / DAY))
  const overlapStart = Math.max(covStart, inizio.getTime())
  const overlapEnd = Math.min(covEnd, fine.getTime())
  const giorniOverlap = Math.max(0, (overlapEnd - overlapStart) / DAY)
  return c.importoNetto * (giorniOverlap / giorniCoperti)
}

export async function riepilogoContabile(
  userId: string,
  inizio: Date,
  fine: Date,
): Promise<RiepilogoContabile> {
  const [config, ordini, turni, costiFissi, storicoPaga, fatture, timbrature, costiUnaTantum] = await Promise.all([
    prisma.contabilitaConfig.findUnique({ where: { userId }, select: { fonteOreLabor: true } }),
    prisma.ordine.findMany({
      // Solo conti CHIUSI: finché il conto non è chiuso i suoi dati non entrano in contabilità.
      where: { userId, createdAt: { gte: inizio, lt: fine }, ...WHERE_CONTO_CHIUSO },
      select: {
        tipo: true,
        coperti: true,
        righe: {
          select: {
            prezzo: true,
            quantita: true,
            foodCost: true,
            piatto: { select: { categoria: { select: { reparto: true } } } },
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
      select: { categoria: true, righe: { select: { imponibile: true } } },
    }),
    // Timbrature del periodo: servono solo se la fonte ore è "timbrature" (usate sotto).
    prisma.timbratura.findMany({
      where: { userId, timestamp: { gte: inizio, lt: fine } },
      select: { dipendenteId: true, tipo: true, timestamp: true },
    }),
    // Costi una tantum il cui intervallo interseca il periodo (spalmati per giorno sotto).
    prisma.costoUnaTantum.findMany({
      where: { userId, dataInizio: { lt: fine }, dataFine: { gte: inizio } },
      select: { importoNetto: true, aliquota: true, categoria: true, dataInizio: true, dataFine: true },
    }),
  ])

  // Storico tariffe indicizzato per dipendente (per risolvere la paga alla data del turno).
  const storicoPerDip = new Map<string, TariffaStorica[]>()
  for (const s of storicoPaga) {
    const arr = storicoPerDip.get(s.dipendenteId) ?? []
    arr.push(s)
    storicoPerDip.set(s.dipendenteId, arr)
  }

  // ── Vendite: incassi LORDI + food cost + split reparto/canale (tutto lordo) ──────
  let fatturatoLordo = 0
  let foodCostVenduto = 0
  let coperti = 0
  const perRepartoMap = new Map<string, number>()
  const perCanaleMap = new Map<string, number>()

  for (const o of ordini) {
    coperti += o.coperti ?? 0
    const canale = o.tipo || 'tavolo'
    for (const r of o.righe) {
      const lordoRiga = r.prezzo * r.quantita
      fatturatoLordo += lordoRiga
      foodCostVenduto += (r.foodCost ?? 0) * r.quantita
      const reparto = r.piatto?.categoria?.reparto || 'Cucina'
      perRepartoMap.set(reparto, (perRepartoMap.get(reparto) ?? 0) + lordoRiga)
      perCanaleMap.set(canale, (perCanaleMap.get(canale) ?? 0) + lordoRiga)
    }
  }

  // ── Acquisti da bolle fornitori: totale netto e totale merci (comprato vs consumato) ──
  let acquistiNettoTotale = 0
  let acquistiNettoMerci = 0
  for (const f of fatture) {
    const merce = f.categoria === 'merci' || f.categoria === 'bevande'
    for (const r of f.righe) {
      acquistiNettoTotale += r.imponibile
      if (merce) acquistiNettoMerci += r.imponibile
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

  // ── Costi fissi: quota LORDA del periodo (quello che esce davvero dal conto) ──
  const giorni = giorniTrascorsi(inizio, fine)
  const quotaCostiFissi = quotaPeriodo(costiFissi, giorni)

  const perCategoriaCostoMap = new Map<string, number>()
  for (const c of costiFissi) {
    const mensile = importoMensile(c) // LORDO normalizzato al mese
    perCategoriaCostoMap.set(c.categoria, (perCategoriaCostoMap.get(c.categoria) ?? 0) + (mensile / 30) * giorni)
  }

  // ── Costi una tantum: quota LORDA spalmata sui giorni del periodo ──
  let quotaUnaTantumTot = 0
  for (const c of costiUnaTantum) {
    const qLordo = lordoCosto(quotaUnaTantum(c, inizio, fine), c.aliquota)
    if (qLordo <= 0) continue
    quotaUnaTantumTot += qLordo
    perCategoriaCostoMap.set(c.categoria, (perCategoriaCostoMap.get(c.categoria) ?? 0) + qLordo)
  }

  const conto: ContoEconomico = {
    fatturatoLordo,
    foodCostVenduto,
    laborCost,
    quotaCostiFissi: quotaCostiFissi + quotaUnaTantumTot, // fissi (rateo) + una tantum (giorni coperti)
  }

  return {
    conto,
    giorni,
    coperti,
    ordini: ordini.length,
    perReparto: [...perRepartoMap.entries()].map(([reparto, netto]) => ({ reparto, netto })).sort((a, b) => b.netto - a.netto),
    perCanale: [...perCanaleMap.entries()].map(([canale, netto]) => ({ canale, netto })).sort((a, b) => b.netto - a.netto),
    perCategoriaCosto: [...perCategoriaCostoMap.entries()].map(([categoria, importo]) => ({ categoria, importo })).sort((a, b) => b.importo - a.importo),
    acquisti: { nettoMerci: acquistiNettoMerci, nettoTotale: acquistiNettoTotale, numero: fatture.length },
  }
}

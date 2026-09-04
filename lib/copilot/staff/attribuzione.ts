// ─────────────────────────────────────────────────────────────────────────────
// Attribuzione dei COPERTI serviti al personale presente.
//
// Collega due dati che il gestionale ha già ma non incrocia:
//   · quanti coperti ha fatto il locale e QUANDO (Ordine tavolo/chiuso, finestra
//     reale createdAt→closedAt, dedup per gruppoId = una sessione conta una volta);
//   · CHI c'era e per quanto (Timbratura entrata/uscita reali; fallback ai Turni
//     pianificati se non ci sono timbrature nel periodo).
//
// Per ogni sessione a tavola i coperti vengono divisi IN PARTI UGUALI tra tutti i
// dipendenti la cui presenza si sovrappone alla finestra della sessione (decisione
// del titolare: tutto il personale, non solo la sala). La somma dei coperti serviti
// ≈ coperti totali del periodo; l'unico scarto sono le sessioni servite quando non
// risulta nessuno presente (né timbro né turno).
//
// Nessun numero è "inventato": è tutta aritmetica su dati Prisma, scoped su userId.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'

export interface CopertiPerDipendente {
  id: string
  nome: string
  ruolo: string | null
  copertiServiti: number // coperti attribuiti (arrotondati)
  oreLavorate: number // ore di presenza nel periodo (1 decimale)
  copertiPerOra: number // copertiServiti / oreLavorate (1 decimale)
}

export interface AttribuzioneCoperti {
  perDipendente: CopertiPerDipendente[]
  totaleCoperti: number // coperti serviti nel periodo (sessioni dedotte per gruppo)
  copertiNonAttribuiti: number // coperti di sessioni senza nessuno presente
  totaleOreLavorate: number
  copertiPerOraLocale: number
  fonte: 'cartellino' | 'turni' // da dove viene la presenza usata
  sessioni: number
}

// Un intervallo di presenza di un dipendente, in millisecondi epoch (tempo assoluto:
// l'attribuzione confronta finestre di date reali, non minuti-del-giorno).
export interface Presenza {
  dipendenteId: string
  inizio: number
  fine: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

// Accoppia le timbrature (entrata→uscita) in intervalli di presenza assoluti.
// Un'entrata senza uscita (turno ancora aperto o timbro mancante) viene chiusa a
// `capFine` (fine finestra o adesso), così non conta ore all'infinito.
export function presenzeCartellino(
  timbrature: { dipendenteId: string; tipo: string; timestamp: Date }[],
  capFine: number,
): Presenza[] {
  const perDip = new Map<string, { tipo: string; t: number }[]>()
  for (const tb of timbrature) {
    const arr = perDip.get(tb.dipendenteId) ?? []
    arr.push({ tipo: tb.tipo, t: tb.timestamp.getTime() })
    perDip.set(tb.dipendenteId, arr)
  }
  const out: Presenza[] = []
  for (const [dipendenteId, arr] of perDip) {
    arr.sort((a, b) => a.t - b.t)
    let i = 0
    while (i < arr.length) {
      if (arr[i].tipo === 'entrata') {
        const inizio = arr[i].t
        const usc = arr[i + 1]?.tipo === 'uscita' ? arr[i + 1].t : null
        const fine = usc ?? capFine
        if (fine > inizio) out.push({ dipendenteId, inizio, fine })
        i += usc ? 2 : 1
      } else {
        i++
      }
    }
  }
  return out
}

// Presenza pianificata dai Turni: [data + oraInizio, data + oraFine], con i getter
// locali (coerente con /api/analytics/staff che usa t.data.getDay()/romeDate).
export function presenzeTurni(
  turni: { dipendenteId: string; data: Date; oraInizio: string; oraFine: string }[],
): Presenza[] {
  const out: Presenza[] = []
  for (const t of turni) {
    const [h1, m1] = t.oraInizio.split(':').map(Number)
    const [h2, m2] = t.oraFine.split(':').map(Number)
    if ([h1, m1, h2, m2].some(Number.isNaN)) continue
    const d = t.data
    const inizio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h1, m1).getTime()
    let fine = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h2, m2).getTime()
    if (fine <= inizio) fine += 86_400_000 // turno oltre la mezzanotte
    out.push({ dipendenteId: t.dipendenteId, inizio, fine })
  }
  return out
}

// Una sessione a tavola: finestra reale e coperti (dedotti per gruppo).
interface Sessione {
  inizio: number
  fine: number
  coperti: number
}

// Overlap in ms tra due intervalli.
export function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

export async function attribuzioneCoperti(
  userId: string,
  from: Date,
  to: Date,
): Promise<AttribuzioneCoperti> {
  const now = Date.now()
  const capFine = Math.min(to.getTime(), now)

  const [dipendenti, ordini] = await Promise.all([
    prisma.dipendente.findMany({
      where: { userId },
      select: { id: true, nome: true, ruolo: true },
    }),
    prisma.ordine.findMany({
      where: { userId, tipo: 'tavolo', status: 'chiuso', createdAt: { gte: from, lt: to } },
      select: { coperti: true, gruppoId: true, createdAt: true, closedAt: true },
    }),
  ])

  // ── Sessioni: dedup per gruppoId (finestra = min createdAt → max closedAt del
  //    gruppo; coperti contati una sola volta). Ordini singoli = una sessione ciascuno.
  const sessioni: Sessione[] = []
  const gruppi = new Map<string, { inizio: number; fine: number; coperti: number }>()
  const FALLBACK_DURATA = 90 * 60_000 // se manca closedAt: 90 min stimati
  for (const o of ordini) {
    const inizio = o.createdAt.getTime()
    const fine = (o.closedAt ?? new Date(inizio + FALLBACK_DURATA)).getTime()
    const cop = o.coperti ?? 0
    if (o.gruppoId) {
      const g = gruppi.get(o.gruppoId)
      if (g) {
        g.inizio = Math.min(g.inizio, inizio)
        g.fine = Math.max(g.fine, fine)
        // coperti del gruppo: teniamo il massimo dichiarato (di norma coincidono)
        g.coperti = Math.max(g.coperti, cop)
      } else {
        gruppi.set(o.gruppoId, { inizio, fine, coperti: cop })
      }
    } else {
      sessioni.push({ inizio, fine: Math.max(fine, inizio + 1), coperti: cop })
    }
  }
  for (const g of gruppi.values()) {
    sessioni.push({ inizio: g.inizio, fine: Math.max(g.fine, g.inizio + 1), coperti: g.coperti })
  }

  const totaleCoperti = sessioni.reduce((s, x) => s + x.coperti, 0)

  // ── Presenza: cartellino se ci sono timbrature nel periodo, altrimenti turni. ──
  const dipIds = dipendenti.map((d) => d.id)
  const [timbrature, turni] = await Promise.all([
    prisma.timbratura.findMany({
      // buffer di 8h dopo `to` per catturare l'uscita di un turno serale
      where: { dipendenteId: { in: dipIds }, timestamp: { gte: from, lt: new Date(to.getTime() + 8 * 3_600_000) } },
      select: { dipendenteId: true, tipo: true, timestamp: true },
    }),
    prisma.turno.findMany({
      where: { userId, data: { gte: from, lt: to } },
      select: { dipendenteId: true, data: true, oraInizio: true, oraFine: true },
    }),
  ])

  const fonte: 'cartellino' | 'turni' = timbrature.length > 0 ? 'cartellino' : 'turni'
  const presenze = fonte === 'cartellino' ? presenzeCartellino(timbrature, capFine) : presenzeTurni(turni)

  // ── Ore lavorate per dipendente (presenza clippata alla finestra del periodo). ──
  const oreMs = new Map<string, number>()
  for (const p of presenze) {
    const ms = overlap(p.inizio, p.fine, from.getTime(), capFine)
    if (ms > 0) oreMs.set(p.dipendenteId, (oreMs.get(p.dipendenteId) ?? 0) + ms)
  }

  // ── Attribuzione: ogni sessione si divide equamente tra i presenti sovrapposti. ──
  const copertiMap = new Map<string, number>()
  let copertiNonAttribuiti = 0
  for (const s of sessioni) {
    const presenti = presenze.filter((p) => overlap(p.inizio, p.fine, s.inizio, s.fine) > 0)
    // dipendenti unici presenti nella sessione (un dip con più intervalli conta 1)
    const idPresenti = [...new Set(presenti.map((p) => p.dipendenteId))]
    if (idPresenti.length === 0) {
      copertiNonAttribuiti += s.coperti
      continue
    }
    const quota = s.coperti / idPresenti.length
    for (const id of idPresenti) copertiMap.set(id, (copertiMap.get(id) ?? 0) + quota)
  }

  const perDipendente: CopertiPerDipendente[] = dipendenti
    .map((d) => {
      const copertiServiti = Math.round(copertiMap.get(d.id) ?? 0)
      const ore = round1((oreMs.get(d.id) ?? 0) / 3_600_000)
      return {
        id: d.id,
        nome: d.nome,
        ruolo: d.ruolo,
        copertiServiti,
        oreLavorate: ore,
        copertiPerOra: ore > 0 ? round1((copertiMap.get(d.id) ?? 0) / ore) : 0,
      }
    })
    .filter((d) => d.copertiServiti > 0 || d.oreLavorate > 0)
    .sort((a, b) => b.copertiServiti - a.copertiServiti)

  const totaleOreLavorate = round1([...oreMs.values()].reduce((s, x) => s + x, 0) / 3_600_000)

  return {
    perDipendente,
    totaleCoperti,
    copertiNonAttribuiti,
    totaleOreLavorate,
    copertiPerOraLocale: totaleOreLavorate > 0 ? round1(totaleCoperti / totaleOreLavorate) : 0,
    fonte,
    sessioni: sessioni.length,
  }
}

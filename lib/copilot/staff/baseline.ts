// ─────────────────────────────────────────────────────────────────────────────
// BASELINE ORGANICO — lo "storico" che rende utile il dato dei coperti serviti.
//
// Per ciascun giorno della settimana calcola, sulle ultime N settimane (giornate
// concluse), quanti coperti fa TIPICAMENTE il locale e con quante ore-uomo di
// personale, ricavandone il rapporto sano "coperti per ora-lavoro". Con questa base
// si può dire, per una certa giornata, se l'organico pianificato è sotto o sopra il
// solito — è ciò che alimenta il suggerimento sull'organico (insight + brief).
//
// Usa le MEDIANE (non le medie): una serata-evento fuori scala non falsa il tipico.
// Riusa gli stessi intervalli di presenza dell'attribuzione (cartellino con fallback
// turni). Una sola passata di query sull'intera finestra, poi bucket per giorno.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { presenzeCartellino, presenzeTurni, overlap, type Presenza } from './attribuzione'

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const round1 = (n: number) => Math.round(n * 10) / 10

// Data locale "YYYY-MM-DD" in fuso Rome (coerente con il resto del Copilota).
const dayRome = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })

function mediana(valori: number[]): number {
  if (valori.length === 0) return 0
  const s = [...valori].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface GiornoBaseline {
  dow: number // 0=Dom … 6=Sab
  label: string // "Lun"
  giorni: number // giornate osservate con attività
  copertiMediani: number
  oreStaffMediane: number
  copertiPerOra: number // rapporto sano tipico di quel giorno
}

export interface Baseline {
  perGiorno: GiornoBaseline[] // 7 elementi, dom→sab
  copertiPerOraGlobale: number // fallback quando un giorno non ha storico
  settimane: number
  fonte: 'cartellino' | 'turni'
}

// Costruisce la baseline sulle ultime `settimane` (default 8) giornate concluse.
export async function baselineOrganico(
  userId: string,
  opts: { settimane?: number } = {},
): Promise<Baseline> {
  const settimane = opts.settimane ?? 8
  // Finestra: [inizio, oggi 00:00) → solo giornate concluse (niente oggi parziale).
  const oggi = new Date()
  const to = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  const from = new Date(to.getTime() - settimane * 7 * 86_400_000)

  const dipendenti = await prisma.dipendente.findMany({ where: { userId }, select: { id: true } })
  const dipIds = dipendenti.map((d) => d.id)

  const [ordini, timbrature, turni] = await Promise.all([
    prisma.ordine.findMany({
      where: { userId, tipo: 'tavolo', status: 'chiuso', createdAt: { gte: from, lt: to } },
      select: { coperti: true, gruppoId: true, createdAt: true },
    }),
    prisma.timbratura.findMany({
      where: { dipendenteId: { in: dipIds }, timestamp: { gte: from, lt: new Date(to.getTime() + 8 * 3_600_000) } },
      select: { dipendenteId: true, tipo: true, timestamp: true },
    }),
    prisma.turno.findMany({
      where: { userId, data: { gte: from, lt: to } },
      select: { dipendenteId: true, data: true, oraInizio: true, oraFine: true },
    }),
  ])

  // ── Coperti per giorno (dedup per gruppoId; il gruppo va al giorno del suo primo ordine). ──
  const copertiPerData = new Map<string, number>()
  const gruppiVisti = new Map<string, string>() // gruppoId → dayKey del primo ordine
  for (const o of ordini) {
    const day = dayRome(o.createdAt)
    const cop = o.coperti ?? 0
    if (o.gruppoId) {
      if (gruppiVisti.has(o.gruppoId)) continue // conta il gruppo una sola volta
      gruppiVisti.set(o.gruppoId, day)
    }
    copertiPerData.set(day, (copertiPerData.get(day) ?? 0) + cop)
  }

  // ── Ore-uomo di presenza per giorno (cartellino se disponibile, altrimenti turni). ──
  const fonte: 'cartellino' | 'turni' = timbrature.length > 0 ? 'cartellino' : 'turni'
  const presenze: Presenza[] = fonte === 'cartellino'
    ? presenzeCartellino(timbrature, to.getTime())
    : presenzeTurni(turni)

  const orePerData = new Map<string, number>()
  // Itera i giorni della finestra e somma l'overlap delle presenze con ciascun giorno.
  for (let t = from.getTime(); t < to.getTime(); t += 86_400_000) {
    const giorno = new Date(t)
    const dayKey = dayRome(giorno)
    const g0 = giorno.getTime()
    const g1 = g0 + 86_400_000
    let ms = 0
    for (const p of presenze) ms += overlap(p.inizio, p.fine, g0, g1)
    if (ms > 0) orePerData.set(dayKey, (orePerData.get(dayKey) ?? 0) + ms / 3_600_000)
  }

  // ── Raggruppa le giornate per giorno della settimana. ──
  const perDow: { coperti: number[]; ore: number[]; ratio: number[] }[] = Array.from({ length: 7 }, () => ({ coperti: [], ore: [], ratio: [] }))
  const tuttiRatio: number[] = []
  // Insieme di tutte le date osservate (con coperti o con ore)
  const dateOsservate = new Set<string>([...copertiPerData.keys(), ...orePerData.keys()])
  for (const day of dateOsservate) {
    const coperti = copertiPerData.get(day) ?? 0
    const ore = orePerData.get(day) ?? 0
    if (coperti === 0 && ore === 0) continue
    const dow = new Date(day + 'T12:00:00').getDay()
    perDow[dow].coperti.push(coperti)
    perDow[dow].ore.push(ore)
    if (coperti > 0 && ore > 0) {
      const r = coperti / ore
      perDow[dow].ratio.push(r)
      tuttiRatio.push(r)
    }
  }

  const copertiPerOraGlobale = round1(mediana(tuttiRatio))

  const perGiorno: GiornoBaseline[] = perDow.map((d, dow) => ({
    dow,
    label: GIORNI[dow],
    giorni: d.coperti.length,
    copertiMediani: Math.round(mediana(d.coperti)),
    oreStaffMediane: round1(mediana(d.ore)),
    copertiPerOra: round1(d.ratio.length ? mediana(d.ratio) : copertiPerOraGlobale),
  }))

  return { perGiorno, copertiPerOraGlobale, settimane, fonte }
}

export type VerdettoOrganico = 'sotto' | 'ok' | 'sopra' | 'nd'

export interface ValutazioneGiornata {
  verdetto: VerdettoOrganico
  dow: number
  label: string
  copertiAttesi: number // coperti tipici di quel giorno (mediana storica)
  copertiPerOra: number // rapporto sano usato
  oreConsigliate: number // ore-uomo suggerite per i coperti attesi
  oreStaff: number // ore-uomo effettive/pianificate passate in input
  scarto: number // oreStaff − oreConsigliate (negativo = sotto organico)
}

// Valuta una giornata: dato il giorno della settimana e le ore-uomo di personale
// (pianificate o effettive), dice se sei sotto/sopra rispetto al tipico di quel giorno.
// `copertiAttesiOverride` permette di usare i coperti già prenotati invece della mediana.
export function valutaGiornata(
  baseline: Baseline,
  dow: number,
  oreStaff: number,
  copertiAttesiOverride?: number,
): ValutazioneGiornata {
  const g = baseline.perGiorno[dow]
  const copertiPerOra = g.copertiPerOra || baseline.copertiPerOraGlobale
  const copertiAttesi = copertiAttesiOverride != null ? copertiAttesiOverride : g.copertiMediani
  const base = {
    dow,
    label: g.label,
    copertiAttesi,
    copertiPerOra,
    oreStaff: round1(oreStaff),
  }

  // Storico insufficiente o rapporto non calcolabile → nessun verdetto affidabile.
  if (g.giorni < 2 || copertiPerOra <= 0 || copertiAttesi <= 0) {
    return { ...base, verdetto: 'nd', oreConsigliate: 0, scarto: 0 }
  }

  const oreConsigliate = round1(copertiAttesi / copertiPerOra)
  const scarto = round1(oreStaff - oreConsigliate)
  const ratio = oreConsigliate > 0 ? oreStaff / oreConsigliate : 1
  const verdetto: VerdettoOrganico = ratio < 0.8 ? 'sotto' : ratio > 1.25 ? 'sopra' : 'ok'
  return { ...base, verdetto, oreConsigliate, scarto }
}

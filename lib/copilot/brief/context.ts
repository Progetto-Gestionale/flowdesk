import { prisma } from '@/lib/prisma'
import type { AllowedAction, BriefContext, ContextSection, Metric, Timeframe } from '@/lib/copilot/ai'

// ─────────────────────────────────────────────────────────────────────────────
// STRATO DATI (deterministico) del motore dei brief — Fase A.
//
// Qui NON c'è AI: solo query Prisma e calcoli. Produce un BriefContext con numeri
// GIÀ calcolati (incassi, delta, menu engineering). Il narratore poi lo interpreta.
// Ogni query è scoped su userId → nessun dato di altri locali.
//
// Copre i dati che il locale HA davvero oggi: Vendite, Prenotazioni, Menu
// engineering (dal food cost snapshot in RigaOrdine). NON calcola labor cost
// (manca il costo del personale) né magazzino (non tracciato): verranno quando
// i dati esisteranno, aggiungendo qui una sezione — il narratore non cambia.
// ─────────────────────────────────────────────────────────────────────────────

// ── Helper date, coerenti con lib/copilot/tools.ts (giorni intesi in fuso Rome,
//    confini costruiti su UTC come nel resto del Copilota). ────────────────────
const dayRome = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) // YYYY-MM-DD

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

function intervallo(dal: string, al: string) {
  const [y1, m1, d1] = dal.split('-').map(Number)
  const from = new Date(Date.UTC(y1, (m1 ?? 1) - 1, d1 ?? 1))
  const [y2, m2, d2] = al.split('-').map(Number)
  const to = new Date(Date.UTC(y2, (m2 ?? 1) - 1, d2 ?? 1))
  to.setUTCDate(to.getUTCDate() + 1)
  return { from, to }
}

const round2 = (n: number) => Math.round(n * 100) / 100

function pctDelta(cur: number, prev: number): { delta: number; label: string } | null {
  if (!isFinite(prev) || prev === 0) return null
  const d = ((cur - prev) / prev) * 100
  return { delta: round2(d), label: `${d >= 0 ? '+' : ''}${Math.round(d)}%` }
}

// ── Aggregazioni ─────────────────────────────────────────────────────────────
interface Sales {
  incasso: number
  ordini: number
  coperti: number
  scontrino: number
  perTipo: Record<string, number>
}

async function salesAgg(userId: string, dal: string, al: string): Promise<Sales> {
  const { from, to } = intervallo(dal, al)
  const ordini = await prisma.ordine.findMany({
    where: { userId, createdAt: { gte: from, lt: to } },
    select: { tipo: true, totale: true, coperti: true },
  })
  let incasso = 0
  let coperti = 0
  const perTipo: Record<string, number> = {}
  for (const o of ordini) {
    incasso += o.totale ?? 0
    coperti += o.coperti ?? 0
    const t = o.tipo || 'tavolo'
    perTipo[t] = (perTipo[t] ?? 0) + (o.totale ?? 0)
  }
  return {
    incasso: round2(incasso),
    ordini: ordini.length,
    coperti,
    scontrino: ordini.length ? round2(incasso / ordini.length) : 0,
    perTipo,
  }
}

interface DishAgg {
  nome: string
  qty: number
  revenue: number
  cost: number
  withCost: boolean
}

async function menuAgg(userId: string, dal: string, al: string): Promise<DishAgg[]> {
  const { from, to } = intervallo(dal, al)
  const righe = await prisma.rigaOrdine.findMany({
    where: { ordine: { userId, createdAt: { gte: from, lt: to } } },
    select: { nome: true, prezzo: true, foodCost: true, quantita: true },
  })
  const map = new Map<string, DishAgg>()
  for (const r of righe) {
    const cur = map.get(r.nome) ?? { nome: r.nome, qty: 0, revenue: 0, cost: 0, withCost: false }
    cur.qty += r.quantita
    cur.revenue += r.prezzo * r.quantita
    if (r.foodCost != null) {
      cur.cost += r.foodCost * r.quantita
      cur.withCost = true
    }
    map.set(r.nome, cur)
  }
  return [...map.values()]
}

// Il "quadrante" del menu engineering lo calcola il codice (matematica), non l'AI:
// popolarità (quantità) incrociata col margine %. L'AI spiega la conseguenza e
// propone l'azione. Serve il food cost: se nessun piatto ce l'ha, niente sezione.
function buildMenuMetrics(dishes: DishAgg[]): Metric[] {
  const totalRevenue = dishes.reduce((s, d) => s + d.revenue, 0)
  const withCost = dishes
    .filter((d) => d.withCost && d.revenue > 0)
    .map((d) => ({ ...d, marginPct: ((d.revenue - d.cost) / d.revenue) * 100 }))
  if (!withCost.length) return []

  const qtys = withCost.map((d) => d.qty).sort((a, b) => a - b)
  const median = qtys[Math.floor(qtys.length / 2)]
  const benVenduti = withCost.filter((d) => d.qty >= median).sort((a, b) => a.marginPct - b.marginPct)
  const pocoVenduti = withCost.filter((d) => d.qty < median).sort((a, b) => b.marginPct - a.marginPct)

  const revWithCost = withCost.reduce((s, d) => s + d.revenue, 0)
  const costTot = withCost.reduce((s, d) => s + d.cost, 0)
  const fcPct = revWithCost > 0 ? round2((costTot / revWithCost) * 100) : null
  const coverage = totalRevenue > 0 ? Math.round((revWithCost / totalRevenue) * 100) : 0

  const metrics: Metric[] = []
  if (fcPct != null) {
    metrics.push({
      key: 'food_cost_incidenza',
      label: 'Incidenza food cost sul venduto',
      value: fcPct,
      unit: '%',
      deltaLabel: `calcolata sul ${coverage}% del venduto con food cost impostato`,
    })
  }
  const palla = benVenduti[0]
  if (palla) {
    metrics.push({
      key: 'menu_palla_al_piede',
      label: 'Molto venduto ma basso margine',
      value: palla.nome,
      deltaLabel: `${palla.qty} vendite, margine ${Math.round(palla.marginPct)}%`,
    })
  }
  const campione = pocoVenduti[0]
  if (campione) {
    metrics.push({
      key: 'menu_campione_nascosto',
      label: 'Alto margine ma poche vendite',
      value: campione.nome,
      deltaLabel: `${campione.qty} vendite, margine ${Math.round(campione.marginPct)}%`,
    })
  }
  return metrics
}

// Azioni consentite per questi brief. In Fase A (sola lettura) sono deep-link a
// sezioni REALI del gestionale: il frontend le trasforma in pulsanti che portano
// lì. In Fase 2 alcune diventeranno azioni di scrittura (con conferma).
const AZIONI: AllowedAction[] = [
  {
    id: 'apri_menu',
    description: 'Apri la sezione Menu per intervenire su un piatto (prezzo, disponibilità, ordine nel menu).',
    params: { piatto: 'nome del piatto interessato' },
  },
  { id: 'apri_analytics', description: 'Apri Analytics per approfondire i numeri (Analisi Menu / Ordini / Tavoli).' },
  { id: 'apri_prenotazioni', description: 'Apri Prenotazioni tavoli per gestire le prenotazioni.' },
]

// ── Costruzione del contesto ─────────────────────────────────────────────────
export async function buildBriefContext(userId: string, timeframe: Timeframe): Promise<BriefContext> {
  const oggi = dayRome(new Date())
  const ieri = addDays(oggi, -1)

  let curFrom: string
  let curTo: string
  let prev: Sales
  let compareLabel: string

  if (timeframe === 'daily') {
    // Oggi finora, confrontato con la MEDIA degli stessi giorni delle ultime 4 settimane.
    curFrom = oggi
    curTo = oggi
    const giorni = [addDays(oggi, -7), addDays(oggi, -14), addDays(oggi, -21), addDays(oggi, -28)]
    const past = await Promise.all(giorni.map((g) => salesAgg(userId, g, g)))
    const n = past.length || 1
    prev = {
      incasso: round2(past.reduce((s, p) => s + p.incasso, 0) / n),
      ordini: Math.round(past.reduce((s, p) => s + p.ordini, 0) / n),
      coperti: Math.round(past.reduce((s, p) => s + p.coperti, 0) / n),
      scontrino: round2(past.reduce((s, p) => s + p.scontrino, 0) / n),
      perTipo: {},
    }
    compareLabel = 'vs media stessi giorni'
  } else if (timeframe === 'weekly') {
    curTo = ieri
    curFrom = addDays(ieri, -6)
    prev = await salesAgg(userId, addDays(ieri, -13), addDays(ieri, -7))
    compareLabel = 'vs settimana prec.'
  } else {
    curTo = ieri
    curFrom = addDays(ieri, -29)
    prev = await salesAgg(userId, addDays(ieri, -59), addDays(ieri, -30))
    compareLabel = 'vs 30gg prec.'
  }

  const cur = await salesAgg(userId, curFrom, curTo)
  const sections: ContextSection[] = []

  // ── Vendite ──
  const dInc = pctDelta(cur.incasso, prev.incasso)
  const dSc = pctDelta(cur.scontrino, prev.scontrino)
  const venMetrics: Metric[] = [
    {
      key: 'incasso',
      label: 'Incasso',
      value: cur.incasso,
      unit: 'EUR',
      delta: dInc?.delta,
      deltaLabel: dInc ? `${dInc.label} ${compareLabel}` : undefined,
    },
    { key: 'coperti', label: 'Coperti', value: cur.coperti, unit: 'coperti' },
    {
      key: 'scontrino_medio',
      label: 'Scontrino medio',
      value: cur.scontrino,
      unit: 'EUR',
      delta: dSc?.delta,
      deltaLabel: dSc ? `${dSc.label} ${compareLabel}` : undefined,
    },
    { key: 'numero_ordini', label: 'Ordini', value: cur.ordini },
  ]
  // Split per tipo solo se c'è più di un canale (evita rumore nel prompt).
  const tipi = Object.keys(cur.perTipo)
  if (tipi.length > 1) {
    for (const t of tipi) {
      venMetrics.push({ key: `incasso_${t}`, label: `Incasso ${t}`, value: round2(cur.perTipo[t]), unit: 'EUR' })
    }
  }
  sections.push({ key: 'vendite', title: 'Vendite', metrics: venMetrics })

  // ── Prenotazioni ──
  if (timeframe === 'daily') {
    const { from, to } = intervallo(oggi, oggi)
    const pren = await prisma.appuntamento.findMany({
      where: { userId, data: { gte: from, lt: to } },
      select: { coperti: true },
    })
    const copertiPren = pren.reduce((s, p) => s + (p.coperti ?? 0), 0)
    sections.push({
      key: 'prenotazioni',
      title: 'Prenotazioni di oggi',
      metrics: [
        { key: 'prenotazioni_oggi', label: 'Prenotazioni oggi', value: pren.length },
        { key: 'coperti_prenotati_oggi', label: 'Coperti prenotati oggi', value: copertiPren, unit: 'coperti' },
      ],
    })
  } else if (timeframe === 'weekly') {
    const { from, to } = intervallo(oggi, addDays(oggi, 6))
    const pren = await prisma.appuntamento.findMany({
      where: { userId, data: { gte: from, lt: to } },
      select: { coperti: true },
    })
    const copertiPren = pren.reduce((s, p) => s + (p.coperti ?? 0), 0)
    sections.push({
      key: 'prenotazioni',
      title: 'Prenotazioni prossimi 7 giorni',
      metrics: [
        { key: 'prenotazioni_7gg', label: 'Prenotazioni prossimi 7 giorni', value: pren.length },
        { key: 'coperti_prenotati_7gg', label: 'Coperti già prenotati', value: copertiPren, unit: 'coperti' },
      ],
    })
  }

  // ── Menu engineering (serve volume: solo settimanale/mensile) ──
  if (timeframe !== 'daily') {
    const dishes = await menuAgg(userId, curFrom, curTo)
    const menuMetrics = buildMenuMetrics(dishes)
    if (menuMetrics.length) sections.push({ key: 'menu', title: 'Menu engineering', metrics: menuMetrics })
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nomeLocale: true } })

  return {
    restaurantId: userId,
    timeframe,
    period: { start: curFrom, end: curTo },
    locale: 'it-IT',
    restaurantName: user?.nomeLocale ?? undefined,
    sections,
    allowedActions: AZIONI,
  }
}

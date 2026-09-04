import { prisma } from '@/lib/prisma'
import { riepilogoContabile } from '@/lib/contabilita/chiusuraGiorno'
import { vistaCassa, semaforoCassa, type StatoSemaforoCassa } from '@/lib/contabilita/cassa'
import type { AllowedAction, BriefContext, ContextSection, HealthStatus, Metric, Timeframe } from '@/lib/copilot/ai'

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
  piattoId?: string // id del MenuPiatto (per le azioni), se la riga ce l'ha
  qty: number
  revenue: number // incasso di TUTTE le righe (per la popolarità)
  cost: number // costo delle sole righe che hanno il food cost
  costedRevenue: number // incasso delle SOLE righe con food cost (per il margine %)
  withCost: boolean
}

async function menuAgg(userId: string, dal: string, al: string): Promise<DishAgg[]> {
  const { from, to } = intervallo(dal, al)
  const righe = await prisma.rigaOrdine.findMany({
    where: { ordine: { userId, createdAt: { gte: from, lt: to } } },
    select: { nome: true, prezzo: true, foodCost: true, quantita: true, piattoId: true },
  })
  const map = new Map<string, DishAgg>()
  for (const r of righe) {
    const cur = map.get(r.nome) ?? { nome: r.nome, qty: 0, revenue: 0, cost: 0, costedRevenue: 0, withCost: false }
    if (r.piattoId) cur.piattoId = r.piattoId // ultimo id non nullo visto per questo nome
    cur.qty += r.quantita
    cur.revenue += r.prezzo * r.quantita
    if (r.foodCost != null) {
      cur.cost += r.foodCost * r.quantita
      cur.costedRevenue += r.prezzo * r.quantita // stesso perimetro del costo → margine coerente
      cur.withCost = true
    }
    map.set(r.nome, cur)
  }
  return [...map.values()]
}

// Il "quadrante" del menu engineering lo calcola il codice (matematica), non l'AI:
// popolarità (quantità) incrociata col margine %. L'AI spiega la conseguenza e
// propone l'azione. Serve il food cost: se nessun piatto ce l'ha, niente sezione.
function buildMenuMetrics(dishes: DishAgg[]): { metrics: Metric[]; azioni: AllowedAction[] } {
  const totalRevenue = dishes.reduce((s, d) => s + d.revenue, 0)
  // Margine calcolato SOLO sulla parte di vendite che ha il food cost (stesso
  // perimetro numeratore/denominatore) → niente margini gonfiati dagli ordini
  // vecchi senza food cost.
  const withCost = dishes
    .filter((d) => d.withCost && d.costedRevenue > 0)
    .map((d) => ({ ...d, marginPct: ((d.costedRevenue - d.cost) / d.costedRevenue) * 100 }))
  if (!withCost.length) return { metrics: [], azioni: [] }

  const revWithCost = withCost.reduce((s, d) => s + d.costedRevenue, 0)
  const costTot = withCost.reduce((s, d) => s + d.cost, 0)
  const fcPct = revWithCost > 0 ? round2((costTot / revWithCost) * 100) : null
  // Margine medio del locale (pesato sul venduto): il benchmark onesto.
  const margineMedio = revWithCost > 0 ? ((revWithCost - costTot) / revWithCost) * 100 : 0
  // Quota di vendite che ha davvero il food cost impostato (trasparenza).
  const coverage = totalRevenue > 0 ? Math.round((revWithCost / totalRevenue) * 100) : 0

  const qtys = withCost.map((d) => d.qty).sort((a, b) => a - b)
  const median = qtys[Math.floor(qtys.length / 2)]
  // Scarto minimo dalla media per essere "notevole": evita di spacciare per
  // basso/alto un margine che è solo il minimo/massimo relativo.
  const GAP = 8

  const metrics: Metric[] = []
  if (fcPct != null) {
    metrics.push({
      key: 'food_cost_incidenza',
      label: 'Incidenza food cost sul venduto',
      value: fcPct,
      unit: '%',
      deltaLabel: `margine medio ${Math.round(margineMedio)}% · su ${coverage}% del venduto con food cost`,
    })
  }

  // Palla al piede: molto venduto E margine sotto la media di almeno GAP punti.
  const palla = withCost
    .filter((d) => d.qty >= median && d.marginPct <= margineMedio - GAP)
    .sort((a, b) => a.marginPct - b.marginPct)[0]
  if (palla) {
    metrics.push({
      key: 'menu_palla_al_piede',
      label: 'Molto venduto, margine sotto la media',
      value: palla.nome,
      deltaLabel: `${palla.qty} vendite, margine ${Math.round(palla.marginPct)}% (media ${Math.round(margineMedio)}%)`,
    })
  }

  const azioni: AllowedAction[] = []

  // AZIONE REALE (Fase 2): la "palla al piede" (vende molto, margine sotto la media) è la
  // candidata naturale a un ritocco di prezzo. Il CODICE calcola il prezzo suggerito per
  // riportarla al margine medio del locale; il titolare conferma/modifica prima di applicare
  // (l'AI sceglie solo se proporla, i numeri arrivano da qui → niente prezzi inventati).
  if (palla && palla.piattoId && palla.qty > 0) {
    const costoUnit = palla.cost / palla.qty
    const prezzoAttuale = palla.costedRevenue / palla.qty // prezzo medio venduto (lordo)
    const m = margineMedio / 100
    const grezzo = m < 0.95 ? costoUnit / (1 - m) : prezzoAttuale
    const prezzoSuggerito = Math.max(prezzoAttuale, Math.ceil(grezzo * 2) / 2) // arrotonda a 0,50
    if (prezzoSuggerito - prezzoAttuale >= 0.2) {
      azioni.push({
        id: `cambia_prezzo_${palla.piattoId}`,
        kind: 'cambia_prezzo',
        target: { piattoId: palla.piattoId, piattoNome: palla.nome, prezzoAttuale: round2(prezzoAttuale), prezzoSuggerito: round2(prezzoSuggerito) },
        description: `Alza il prezzo di "${palla.nome}" da ${round2(prezzoAttuale)}€ verso ~${round2(prezzoSuggerito)}€: vende molto ma ha margine sotto la media del locale.`,
      })
    }
  }

  // Piatto in perdita: margine NEGATIVO (il food cost supera il prezzo → perdi soldi a
  // ogni vendita). Oltre al ritocco di prezzo, l'AI può proporre di toglierlo dal menu
  // (segnarlo esaurito) finché non se ne rivede prezzo o ricetta. È l'azione più forte,
  // per questo la limitiamo al caso davvero critico (margine sotto zero).
  const inPerdita = withCost
    .filter((d) => d.marginPct < 0 && d.piattoId && d.qty > 0)
    .sort((a, b) => a.marginPct - b.marginPct)[0]
  if (inPerdita) {
    metrics.push({
      key: 'menu_in_perdita',
      label: 'Venduto in perdita (food cost oltre il prezzo)',
      value: inPerdita.nome,
      deltaLabel: `${inPerdita.qty} vendite, margine ${Math.round(inPerdita.marginPct)}%`,
    })
    azioni.push({
      id: `imposta_disponibilita_${inPerdita.piattoId}`,
      kind: 'imposta_disponibilita',
      target: { piattoId: inPerdita.piattoId, piattoNome: inPerdita.nome, disponibile: false },
      description: `Segna "${inPerdita.nome}" come esaurito: ogni vendita è in perdita (il food cost supera il prezzo). Toglilo dal menu finché non ne rivedi prezzo o ricetta.`,
    })
  }

  // Campione nascosto: poco venduto E margine sopra la media di almeno GAP punti.
  const campione = withCost
    .filter((d) => d.qty < median && d.marginPct >= margineMedio + GAP)
    .sort((a, b) => b.marginPct - a.marginPct)[0]
  if (campione) {
    metrics.push({
      key: 'menu_campione_nascosto',
      label: 'Poco venduto, margine sopra la media',
      value: campione.nome,
      deltaLabel: `${campione.qty} vendite, margine ${Math.round(campione.marginPct)}% (media ${Math.round(margineMedio)}%)`,
    })
    // AZIONE REALE: se conosciamo l'id del piatto, offriamo di metterlo in cima al
    // menu (gli dà visibilità: rende bene ma vende poco). L'id lo mettiamo noi, non l'AI.
    if (campione.piattoId) {
      azioni.push({
        id: `sposta_in_cima_${campione.piattoId}`,
        kind: 'sposta_in_cima',
        target: { piattoId: campione.piattoId, piattoNome: campione.nome },
        description: `Metti "${campione.nome}" in cima al suo menu per dargli visibilità (rende bene ma vende poco).`,
      })
    }
  }
  return { metrics, azioni }
}

// ── Cassa del locale (il PONTE con la Contabilità) ───────────────────────────
// Riusa lo stesso motore della pagina Contabilità (riepilogoContabile), ma nella
// nuova vista di CASSA: quanto entra, i costi principali (personale, materie prime,
// costi fissi), quanto resta. Il semaforo è DETERMINISTICO (soglie sulla % di cassa
// che resta) → pilota lo status del brief, non l'AI. Così il brief non parla più solo
// di incasso, ma di quanto resta davvero in cassa. La "cassa che resta" è al lordo di
// tasse e saldo IVA: non è utile netto. Se non c'è incasso nel periodo, si omette.
const SEMAFORO_TO_STATUS: Record<StatoSemaforoCassa, HealthStatus> = {
  verde: 'green',
  giallo: 'yellow',
  rosso: 'red',
}
const SEMAFORO_LABEL: Record<StatoSemaforoCassa, string> = {
  verde: 'cassa in salute',
  giallo: 'cassa da tenere d’occhio',
  rosso: 'cassa in sofferenza',
}

async function buildEconomicSection(
  userId: string,
  from: Date,
  to: Date,
): Promise<{ section: ContextSection; statusHint: HealthStatus } | null> {
  const r = await riepilogoContabile(userId, from, to)
  const cassa = vistaCassa(r.conto)
  if (cassa.incassi <= 0) return null

  const semaforo = semaforoCassa(cassa.cassaPct)
  const foodPct = round2((cassa.materiePrime / cassa.incassi) * 100)
  const laborPct = round2((cassa.personale / cassa.incassi) * 100)

  const metrics: Metric[] = [
    {
      key: 'cassa_pct',
      label: 'Cassa che resta sugli incassi',
      value: round2(cassa.cassaPct * 100),
      unit: '%',
      deltaLabel: SEMAFORO_LABEL[semaforo],
    },
    {
      key: 'cassa_resta',
      label: 'Cassa che resta (stima)',
      value: round2(cassa.cassaResta),
      unit: 'EUR',
      deltaLabel: 'dopo personale, materie prime e costi fissi — al lordo di tasse e saldo IVA',
    },
    { key: 'food_cost_pct', label: 'Materie prime sugli incassi', value: foodPct, unit: '%' },
    { key: 'labor_pct', label: 'Personale sugli incassi', value: laborPct, unit: '%' },
  ]

  // ── Allerta PERSONALE (per l'azione "apri_staff") ──
  // Due lacune opposte, entrambe importanti per la salute reale:
  //  · labor non tracciato (laborPct = 0 con incasso) → la cassa è gonfiata, mancano le paghe.
  //  · labor troppo alto (oltre soglia) → il personale erode la cassa, turni da rivedere.
  if (laborPct <= 0) {
    metrics.push({
      key: 'labor_non_tracciato',
      label: 'Costo del personale non impostato',
      value: 'paghe/turni non conteggiati',
      deltaLabel: 'senza costo del personale la cassa che resta è sovrastimata',
    })
  } else if (laborPct >= 40) {
    metrics.push({
      key: 'labor_alto',
      label: 'Personale sopra soglia',
      value: laborPct,
      unit: '%',
      deltaLabel: 'oltre ~40% degli incassi: i turni pesano molto sulla cassa',
    })
  }

  // ── Allerta COSTI FISSI (per l'azione "apri_costi") ──
  // Nessun costo fisso imputato al periodo pur avendo incassato → affitto/utenze/servizi
  // probabilmente non registrati: la cassa che resta è gonfiata.
  if (cassa.costiFissi <= 0) {
    metrics.push({
      key: 'costi_fissi_mancanti',
      label: 'Costi fissi non registrati',
      value: 'affitto/utenze/servizi assenti',
      deltaLabel: 'senza costi fissi la cassa che resta è sovrastimata',
    })
  }

  // Acquisti (bolle F3): se ci sono, confronto comprato vs consumato; se mancano del tutto
  // ma c'è food cost, la spesa reale dai fornitori non è tracciata → suggerire di inserirle.
  if (r.acquisti.numero > 0) {
    metrics.push({
      key: 'merci_comprate_vs_consumate',
      label: 'Merci: comprate − consumate',
      value: round2(r.acquisti.nettoMerci - cassa.materiePrime),
      unit: 'EUR',
      deltaLabel: `acquisti ${round2(r.acquisti.nettoMerci)}€ vs materie prime consumate ${round2(cassa.materiePrime)}€`,
    })
  } else if (cassa.materiePrime > 0) {
    metrics.push({
      key: 'bolle_mancanti',
      label: 'Bolle fornitori non inserite',
      value: 'spesa reale fornitori non tracciata',
      deltaLabel: 'inserendo le bolle vedi se stai comprando più di quanto consumi',
    })
  }

  return {
    section: { key: 'economia', title: 'Cassa del locale', metrics },
    statusHint: SEMAFORO_TO_STATUS[semaforo],
  }
}

// Azioni consentite per questi brief. In Fase A (sola lettura) sono deep-link a
// sezioni REALI del gestionale: il frontend le trasforma in pulsanti che portano
// lì. In Fase 2 alcune diventeranno azioni di scrittura (con conferma).
const AZIONI: AllowedAction[] = [
  {
    id: 'apri_contabilita',
    kind: 'link',
    target: { href: '/food/dashboard/contabilita' },
    description: 'Apri la Contabilità per vedere la cassa del locale (incassi, costi principali, quanto resta).',
  },
  {
    id: 'apri_acquisti',
    kind: 'link',
    target: { href: '/food/dashboard/contabilita/acquisti' },
    description: 'Apri Acquisti/Bolle per registrare quanto spendi dai fornitori e confrontarlo col consumato.',
  },
  {
    id: 'apri_menu',
    kind: 'link',
    target: { href: '/food/dashboard/menu' },
    description: 'Apri la sezione Menu per intervenire su un piatto (prezzo, disponibilità, ordine nel menu).',
  },
  {
    id: 'apri_costi',
    kind: 'link',
    target: { href: '/food/dashboard/contabilita/costi' },
    description: 'Apri Costi & Personale per registrare costi fissi (affitto, utenze, servizi) o rivedere le paghe del personale.',
  },
  {
    id: 'apri_staff',
    kind: 'link',
    target: { href: '/food/dashboard/staff' },
    description: 'Apri Staff per rivedere i turni e il costo del personale (aggiungere/togliere una persona, rigenerare i turni).',
  },
  {
    id: 'apri_analytics',
    kind: 'link',
    target: { href: '/food/dashboard/analytics' },
    description: 'Apri Analytics per approfondire i numeri (Analisi Menu / Ordini / Tavoli).',
  },
  {
    id: 'apri_prenotazioni',
    kind: 'link',
    target: { href: '/food/dashboard/clienti/preventivi' },
    description: 'Apri Prenotazioni tavoli per gestire le prenotazioni.',
  },
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
    // Brief del mattino: recap di IERI (giornata chiusa, numeri definitivi),
    // confrontato con la MEDIA dello stesso giorno della settimana nelle 4
    // settimane precedenti. L'outlook di OGGI (prenotazioni) è nella sezione sotto.
    curFrom = ieri
    curTo = ieri
    const giorni = [addDays(ieri, -7), addDays(ieri, -14), addDays(ieri, -21), addDays(ieri, -28)]
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
  // Titolo: nel brief del mattino le vendite sono quelle di IERI (giornata chiusa).
  const venTitle = timeframe === 'daily' ? 'Ieri' : 'Vendite'
  sections.push({ key: 'vendite', title: venTitle, metrics: venMetrics })

  // ── Salute economica (ponte con la Contabilità) ──
  // Stesso periodo delle vendite. In try/catch: un problema della contabilità non
  // deve far saltare l'intero brief (che resta valido con vendite e prenotazioni).
  let statusHint: HealthStatus | undefined
  try {
    const { from, to } = intervallo(curFrom, curTo)
    const eco = await buildEconomicSection(userId, from, to)
    if (eco) {
      sections.push(eco.section)
      statusHint = eco.statusHint
    }
  } catch (e) {
    console.error('[BRIEF] sezione economica non disponibile:', e)
  }

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
  let azioniMenu: AllowedAction[] = []
  if (timeframe !== 'daily') {
    const dishes = await menuAgg(userId, curFrom, curTo)
    const { metrics, azioni } = buildMenuMetrics(dishes)
    if (metrics.length) sections.push({ key: 'menu', title: 'Menu engineering', metrics })
    azioniMenu = azioni
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nomeLocale: true } })

  return {
    restaurantId: userId,
    timeframe,
    period: { start: curFrom, end: curTo },
    locale: 'it-IT',
    restaurantName: user?.nomeLocale ?? undefined,
    sections,
    // Prima le azioni concrete (es. sposta in cima), poi quelle di navigazione.
    allowedActions: [...azioniMenu, ...AZIONI],
    // Semaforo deterministico dal margine netto: se c'è, pilota lo status del brief.
    statusHint,
  }
}

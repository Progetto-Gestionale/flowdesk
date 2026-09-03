// Contesto AI della CONTABILITÀ (Ponte AI / F4). Riusa lo stesso motore dati della
// pagina (riepilogoContabile) e lo stesso narratore dei brief: la "insight card" è un
// brief RISTRETTO a una schermata + periodo. Nessun numero lo calcola l'AI: qui produciamo
// un BriefContext con metriche già pronte + un HASH dei numeri (per la cache/costo).

import { createHash } from 'crypto'
import { calcolaPeriodo } from '@/lib/contabilita/periodo'
import { riepilogoContabile } from '@/lib/contabilita/chiusuraGiorno'
import type { AllowedAction, BriefContext, HealthStatus, Metric, Timeframe } from '@/lib/copilot/ai'

const round2 = (n: number) => Math.round(n * 100) / 100

const SEMAFORO_TO_STATUS: Record<'verde' | 'giallo' | 'rosso', HealthStatus> = {
  verde: 'green', giallo: 'yellow', rosso: 'red',
}
const SEMAFORO_LABEL: Record<'verde' | 'giallo' | 'rosso', string> = {
  verde: 'in salute', giallo: 'attenzione', rosso: 'criticità',
}

// I periodi della Contabilità (oggi/settimana/mese/anno) mappati sul Timeframe del brief.
function periodoToTimeframe(periodo: string): Timeframe {
  if (periodo === 'oggi') return 'daily'
  if (periodo === 'settimana') return 'weekly'
  return 'monthly'
}

// Ancora del periodo come "YYYY-MM-DD" in componenti locali (coerente con calcolaPeriodo,
// che costruisce le date in orario locale). Serve da chiave di cache stabile.
function chiavePeriodo(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Deep-link che l'AI può proporre come pulsanti (sola lettura / navigazione).
const AZIONI: AllowedAction[] = [
  { id: 'apri_menu', kind: 'link', target: { href: '/food/dashboard/menu' }, description: 'Apri il Menu per ritoccare prezzo/food cost di un piatto.' },
  { id: 'apri_acquisti', kind: 'link', target: { href: '/food/dashboard/contabilita/acquisti' }, description: 'Apri Acquisti/Bolle per registrare le fatture fornitori e recuperare l’IVA a credito.' },
  { id: 'apri_costi', kind: 'link', target: { href: '/food/dashboard/contabilita/costi' }, description: 'Apri Costi & Personale per registrare costi fissi (affitto, utenze) o rivedere le paghe.' },
  { id: 'apri_staff', kind: 'link', target: { href: '/food/dashboard/staff' }, description: 'Apri Staff per rivedere i turni e il costo del personale (aggiungere/togliere una persona, rigenerare i turni).' },
  { id: 'apri_impostazioni', kind: 'link', target: { href: '/food/dashboard/contabilita/impostazioni' }, description: 'Apri Impostazioni contabili (regime fiscale, accantonamento, aliquote).' },
]

export interface FinancialContext {
  context: BriefContext
  hash: string
  label: string // etichetta del periodo, es. "Set 2026"
  riferimentoKey: string // ancora del periodo per la cache
  vuoto: boolean // true se non c'è venduto: niente da interpretare
  corrente: boolean // true se il periodo mostrato è quello in corso (oggi/settimana/mese/anno correnti)
}

// Avanzamento di un periodo di calendario rispetto a ORA. Serve a dichiarare che i
// totali sono parziali quando il periodo non è ancora concluso (mese/settimana/anno
// correnti). `fine` è esclusiva (inizio del periodo successivo).
function calcolaAvanzamento(inizio: Date, fine: Date): BriefContext['periodProgress'] {
  const ora = new Date()
  const GIORNO = 86_400_000
  const totalDays = Math.max(1, Math.round((fine.getTime() - inizio.getTime()) / GIORNO))
  const inProgress = ora >= inizio && ora < fine
  if (!inProgress) return undefined
  const elapsedMs = ora.getTime() - inizio.getTime()
  const elapsedDays = Math.min(totalDays, Math.max(1, Math.ceil(elapsedMs / GIORNO)))
  const pct = Math.min(100, Math.max(1, Math.round((elapsedMs / (fine.getTime() - inizio.getTime())) * 100)))
  return { inProgress, elapsedDays, totalDays, pct }
}

// Costruisce il contesto della Contabilità per un periodo. `riferimento` è una data ISO
// qualsiasi dentro il periodo voluto (come la pagina Contabilità).
export async function buildFinancialContext(
  userId: string,
  periodo: string,
  riferimento?: string | null,
): Promise<FinancialContext> {
  const p = calcolaPeriodo(periodo, riferimento)
  const r = await riepilogoContabile(userId, p.inizio, p.fine)
  const c = r.conto
  const riferimentoKey = chiavePeriodo(p.inizio)

  const ivaCredito = c.ivaNetta < 0

  const metrics: Metric[] = [
    { key: 'margine_netto', label: 'Margine netto', value: round2(c.marginePct * 100), unit: '%', deltaLabel: SEMAFORO_LABEL[r.semaforo] },
    { key: 'utile_stimato', label: 'Soldi realmente tuoi', value: round2(c.utileStimato), unit: 'EUR', deltaLabel: 'utile netto dopo IVA, food, personale, fissi e tasse' },
    { key: 'fatturato_netto', label: 'Fatturato netto (imponibile)', value: round2(c.fatturatoNetto), unit: 'EUR' },
    { key: 'food_cost_pct', label: 'Food cost sul venduto', value: c.fatturatoNetto > 0 ? round2((c.foodCostVenduto / c.fatturatoNetto) * 100) : 0, unit: '%' },
    { key: 'labor_pct', label: 'Personale sul venduto', value: c.fatturatoNetto > 0 ? round2((c.laborCost / c.fatturatoNetto) * 100) : 0, unit: '%' },
    { key: 'quota_costi_fissi', label: 'Costi fissi del periodo', value: round2(c.quotaCostiFissi), unit: 'EUR' },
    {
      key: 'iva_netta',
      label: ivaCredito ? 'Credito IVA' : 'IVA da versare',
      value: round2(Math.abs(c.ivaNetta)),
      unit: 'EUR',
      deltaLabel: ivaCredito ? 'a tuo favore, compensa le imposte future' : "da mettere da parte per l'F24",
    },
  ]

  // Allerte "lacune di dati" che gonfiano il margine: personale non impostato o troppo
  // alto (→ apri_staff), costi fissi non registrati (→ apri_costi).
  const laborPct = c.fatturatoNetto > 0 ? (c.laborCost / c.fatturatoNetto) * 100 : 0
  if (c.fatturatoNetto > 0 && laborPct <= 0) {
    metrics.push({ key: 'labor_non_tracciato', label: 'Costo del personale non impostato', value: 'paghe/turni non conteggiati', deltaLabel: 'senza personale il margine netto è sovrastimato' })
  } else if (laborPct >= 40) {
    metrics.push({ key: 'labor_alto', label: 'Personale sopra soglia', value: round2(laborPct), unit: '%', deltaLabel: 'oltre ~40% del venduto: i turni pesano molto sul margine' })
  }
  if (c.fatturatoNetto > 0 && c.quotaCostiFissi <= 0) {
    metrics.push({ key: 'costi_fissi_mancanti', label: 'Costi fissi non registrati', value: 'affitto/utenze/servizi assenti', deltaLabel: 'senza costi fissi il margine netto è sovrastimato' })
  }

  // Acquisti: se ci sono bolle, confronto comprato vs consumato; se no, il credito IVA
  // sulle merci non è tracciato → l'AI può suggerire di inserirle.
  if (r.acquisti.numero > 0) {
    metrics.push({
      key: 'merci_comprate_vs_consumate',
      label: 'Merci comprate − consumate',
      value: round2(r.acquisti.nettoMerci - c.foodCostVenduto),
      unit: 'EUR',
      deltaLabel: `acquisti ${round2(r.acquisti.nettoMerci)}€ vs food cost venduto ${round2(c.foodCostVenduto)}€`,
    })
  } else if (c.foodCostVenduto > 0) {
    metrics.push({ key: 'bolle_mancanti', label: 'Bolle fornitori non inserite', value: 'credito IVA merci non conteggiato', deltaLabel: 'inserendo le bolle il credito IVA reale sarà più alto' })
  }

  const periodProgress = calcolaAvanzamento(p.inizio, p.fine)

  const context: BriefContext = {
    restaurantId: userId,
    timeframe: periodoToTimeframe(periodo),
    period: { start: p.inizio.toISOString().slice(0, 10), end: p.fine.toISOString().slice(0, 10) },
    locale: 'it-IT',
    sections: [{ key: 'contabilita', title: `Contabilità · ${p.label}`, metrics }],
    allowedActions: AZIONI,
    statusHint: SEMAFORO_TO_STATUS[r.semaforo],
    periodProgress,
  }

  // Hash dei numeri che l'AI interpreta: se non cambiano, serviamo la cache (no chiamata AI).
  // Includiamo l'avanzamento del periodo: se il periodo è in corso e passa un giorno,
  // il verdetto va rigenerato (i totali parziali sono cambiati di significato).
  const impronta = JSON.stringify({
    periodo, riferimentoKey,
    m: metrics.map((x) => [x.key, x.value]),
    status: context.statusHint,
    avanzamento: periodProgress ? periodProgress.elapsedDays : null,
  })
  const hash = createHash('sha1').update(impronta).digest('hex')

  return { context, hash, label: p.label, riferimentoKey, vuoto: c.fatturatoNetto <= 0, corrente: !!periodProgress?.inProgress }
}

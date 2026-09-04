// Contesto AI dell'ORGANICO (coperti serviti vs personale presente). Stesso pattern
// del contesto Contabilità (lib/copilot/financial/context.ts): il codice calcola i
// numeri e produce un BriefContext + un HASH (per cache/costo); il narratore AI li
// racconta soltanto. Così il suggerimento sull'organico entra nell'UNICO canale di
// suggerimenti del Copilota (insight card "Analisi AI" + brief), non come banner a sé.

import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { calcolaPeriodo, type Periodo } from '@/lib/contabilita/periodo'
import { attribuzioneCoperti, type AttribuzioneCoperti } from './attribuzione'
import { baselineOrganico, valutaGiornata, type Baseline } from './baseline'
import type { AllowedAction, BriefContext, HealthStatus, Metric } from '@/lib/copilot/ai'

const round1 = (n: number) => Math.round(n * 10) / 10

function periodoToTimeframe(periodo: string): 'daily' | 'weekly' | 'monthly' {
  if (periodo === 'oggi') return 'daily'
  if (periodo === 'settimana') return 'weekly'
  return 'monthly'
}

function chiavePeriodo(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Avanzamento del periodo rispetto a ORA (identico al financial context): se il
// periodo è in corso, i totali sono parziali e il verdetto va rigenerato ogni giorno.
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

const AZIONI: AllowedAction[] = [
  { id: 'apri_staff', kind: 'link', target: { href: '/food/dashboard/staff' }, description: 'Apri Staff per rivedere i turni e l’organico (aggiungere/togliere una persona su un certo giorno, rigenerare i turni).' },
  { id: 'apri_analitica_personale', kind: 'link', target: { href: '/food/dashboard/analytics' }, description: 'Apri Analytics · Personale per vedere i coperti serviti per dipendente e lo storico dell’organico per giorno della settimana.' },
]

export interface StaffContextResult {
  context: BriefContext
  hash: string
  label: string
  riferimentoKey: string
  vuoto: boolean // nessun coperto nel periodo: niente da interpretare
  corrente: boolean
}

export async function buildStaffContext(
  userId: string,
  periodo: string,
  riferimento?: string | null,
): Promise<StaffContextResult> {
  const p = calcolaPeriodo(periodo, riferimento)
  const [attr, baseline] = await Promise.all([
    attribuzioneCoperti(userId, p.inizio, p.fine),
    baselineOrganico(userId),
  ])
  const riferimentoKey = chiavePeriodo(p.inizio)

  // ── "oggi": advisor LUNGIMIRANTE (pre-servizio). Confronta il personale PIANIFICATO
  //    per oggi (turni) coi coperti attesi dallo storico per questo giorno, così
  //    risponde a "per oggi ho messo pochi dipendenti?" anche a coperti ancora zero.
  if (periodo === 'oggi') {
    return buildOggi(userId, p, riferimentoKey, attr, baseline)
  }

  const fonteLabel = attr.fonte === 'cartellino' ? 'presenze da timbro' : 'ore da turni pianificati'
  const rapportoSano = baseline.copertiPerOraGlobale

  // Verdetto deterministico: coperti/ora effettivi vs rapporto sano storico.
  //  · molto ALTO → ogni ora-uomo regge tanti coperti = personale tirato (sotto organico).
  //  · molto BASSO → personale in eccesso rispetto ai coperti (sopra organico).
  let statusHint: HealthStatus = 'green'
  let valutazioneLabel = 'organico in equilibrio coi coperti del periodo'
  if (rapportoSano > 0 && attr.copertiPerOraLocale > 0) {
    const ratio = attr.copertiPerOraLocale / rapportoSano
    if (ratio >= 1.35) { statusHint = 'red'; valutazioneLabel = 'personale tirato: pochi rispetto ai coperti serviti' }
    else if (ratio >= 1.15) { statusHint = 'yellow'; valutazioneLabel = 'personale un po’ sotto rispetto al solito' }
    else if (ratio <= 0.65) { statusHint = 'yellow'; valutazioneLabel = 'personale in eccesso rispetto ai coperti' }
  }

  const metrics: Metric[] = [
    { key: 'coperti_totali', label: 'Coperti serviti nel periodo', value: attr.totaleCoperti, unit: 'coperti' },
    { key: 'ore_uomo', label: 'Ore-uomo di personale', value: attr.totaleOreLavorate, unit: 'ore', deltaLabel: fonteLabel },
    // "Coperti per ora-lavoro" = coperti serviti diviso le ore di TUTTO il personale
    // presente (sala + cucina). È un ritmo di carico, non una performance individuale.
    { key: 'coperti_per_ora', label: 'Coperti serviti per ora di personale', value: attr.copertiPerOraLocale, deltaLabel: rapportoSano > 0 ? `${valutazioneLabel} · tipico del locale ~${rapportoSano}/ora` : valutazioneLabel },
  ]

  // NB: NON mettiamo "chi ha servito più coperti" nel brief: l'assoluto dipende dalle ore
  // lavorate (chi fa più ore ne serve di più) e i coperti sono divisi tra i presenti →
  // è carico attribuito, non merito. Il dato per dipendente (con le ore accanto) vive
  // nella tabella Analytics e nello strumento AI, dove è contestualizzato.

  // Coperti serviti senza nessun presente (buco di timbrature/turni): il dato è
  // incompleto, va segnalato onestamente così l'AI non lo ignora.
  if (attr.copertiNonAttribuiti > 0) {
    metrics.push({ key: 'coperti_scoperti', label: 'Coperti senza personale tracciato', value: attr.copertiNonAttribuiti, unit: 'coperti', deltaLabel: attr.fonte === 'cartellino' ? 'sessioni servite senza timbrature: timbri mancanti' : 'sessioni senza turni pianificati corrispondenti' })
  }

  // Pattern settimanale COMPLETO in un'unica metrica: dà all'AI il quadro RELATIVO del
  // locale (i suoi giorni tra loro), così ragiona sulle discrepanze del caso specifico e
  // non su una soglia assoluta. Sostituisce i vecchi "giorno più teso/scarico" (ridondanti).
  const conStorico = baseline.perGiorno.filter((g) => g.giorni >= 2 && g.copertiPerOra > 0)
  if (conStorico.length >= 2 && rapportoSano > 0) {
    const GIORNI_ORD = [1, 2, 3, 4, 5, 6, 0] // Lun→Dom
    const pattern = GIORNI_ORD
      .map((d) => baseline.perGiorno[d])
      .filter((g) => g.giorni >= 2 && g.copertiPerOra > 0)
      .map((g) => `${g.label} ${g.copertiPerOra}/h (~${g.copertiMediani} cop, ${g.oreStaffMediane}h)`)
      .join(' · ')
    if (pattern) {
      metrics.push({ key: 'pattern_settimanale', label: 'Coperti per ora per giorno (storico del locale)', value: pattern, deltaLabel: `media del locale ~${rapportoSano}/ora` })
    }
  }

  const periodProgress = calcolaAvanzamento(p.inizio, p.fine)

  const context: BriefContext = {
    restaurantId: userId,
    timeframe: periodoToTimeframe(periodo),
    period: { start: p.inizio.toISOString().slice(0, 10), end: p.fine.toISOString().slice(0, 10) },
    locale: 'it-IT',
    sections: [{ key: 'organico', title: `Organico e coperti · ${p.label}`, metrics }],
    allowedActions: AZIONI,
    statusHint,
    periodProgress,
  }

  const impronta = JSON.stringify({
    periodo, riferimentoKey,
    m: metrics.map((x) => [x.key, x.value]),
    status: statusHint,
    avanzamento: periodProgress ? periodProgress.elapsedDays : null,
  })
  const hash = createHash('sha1').update(impronta).digest('hex')

  return { context, hash, label: p.label, riferimentoKey, vuoto: attr.totaleCoperti <= 0, corrente: !!periodProgress?.inProgress }
}

// Durata di un turno in ore da "HH:MM"–"HH:MM" (gestisce l'oltre-mezzanotte).
function diffOre(oraInizio: string, oraFine: string): number {
  const [h1, m1] = oraInizio.split(':').map(Number)
  const [h2, m2] = oraFine.split(':').map(Number)
  if ([h1, m1, h2, m2].some(Number.isNaN)) return 0
  let min = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (min < 0) min += 1440
  return min / 60
}

// Advisor di OGGI (pre-servizio): personale pianificato/presente vs coperti attesi
// dallo storico del giorno. Genera un verdetto utile anche prima che arrivino i coperti.
async function buildOggi(
  userId: string,
  p: Periodo,
  riferimentoKey: string,
  attr: AttribuzioneCoperti,
  baseline: Baseline,
): Promise<StaffContextResult> {
  const dow = p.inizio.getDay()
  const gg = baseline.perGiorno[dow]

  const turni = await prisma.turno.findMany({
    where: { userId, data: { gte: p.inizio, lt: p.fine } },
    select: { oraInizio: true, oraFine: true },
  })
  const orePianificate = round1(turni.reduce((s, t) => s + diffOre(t.oraInizio, t.oraFine), 0))
  const oreFinora = attr.totaleOreLavorate
  // "Organico di oggi": il maggiore tra le ore pianificate e quelle già presenti.
  const oreStaff = Math.max(orePianificate, oreFinora)
  const v = valutaGiornata(baseline, dow, oreStaff)

  let statusHint: HealthStatus = 'green'
  if (v.verdetto === 'sotto') statusHint = 'red'
  else if (v.verdetto === 'sopra') statusHint = 'yellow'

  const metrics: Metric[] = []
  if (v.verdetto !== 'nd') {
    metrics.push({
      key: 'organico_oggi',
      label: 'Organico di oggi vs tipico',
      value: v.verdetto === 'sotto' ? 'sotto organico' : v.verdetto === 'sopra' ? 'sopra organico' : 'in linea',
      deltaLabel: `${oreStaff}h di personale · consigliate ~${v.oreConsigliate}h per ~${v.copertiAttesi} coperti tipici del ${v.label}`,
    })
  }
  metrics.push({ key: 'ore_pianificate_oggi', label: 'Ore-uomo pianificate oggi', value: orePianificate, unit: 'ore' })
  metrics.push({
    key: 'coperti_attesi_oggi',
    label: `Coperti tipici del ${gg.label}`,
    value: gg.copertiMediani,
    unit: 'coperti',
    deltaLabel: gg.giorni >= 2 ? `mediana ultime ${baseline.settimane} settimane` : 'storico ancora scarso: stima poco affidabile',
  })
  if (attr.totaleCoperti > 0) {
    metrics.push({ key: 'coperti_finora', label: 'Coperti serviti finora oggi', value: attr.totaleCoperti, unit: 'coperti', deltaLabel: `${oreFinora}h di presenza finora` })
  }

  const periodProgress = calcolaAvanzamento(p.inizio, p.fine)
  const context: BriefContext = {
    restaurantId: userId,
    timeframe: 'daily',
    period: { start: p.inizio.toISOString().slice(0, 10), end: p.fine.toISOString().slice(0, 10) },
    locale: 'it-IT',
    sections: [{ key: 'organico', title: `Organico di oggi · ${p.label}`, metrics }],
    allowedActions: AZIONI,
    statusHint,
    periodProgress,
  }
  const impronta = JSON.stringify({
    periodo: 'oggi', riferimentoKey,
    m: metrics.map((x) => [x.key, x.value]),
    status: statusHint,
    avanzamento: periodProgress ? periodProgress.elapsedDays : null,
  })
  const hash = createHash('sha1').update(impronta).digest('hex')
  // Vuoto solo se non c'è NULLA: né turni pianificati, né coperti, né storico del giorno.
  const vuoto = orePianificate <= 0 && attr.totaleCoperti <= 0 && gg.copertiMediani <= 0
  return { context, hash, label: p.label, riferimentoKey, vuoto, corrente: !!periodProgress?.inProgress }
}

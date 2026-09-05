// Helper CONDIVISI dei motori di contesto AI (Dup.2). financial/context.ts e
// staff/context.ts ripetevano identici: periodoToTimeframe, chiavePeriodo,
// calcolaAvanzamento e la costruzione dell'hash. Qui stanno in un posto solo, così
// una modifica alla logica di avanzamento o all'impronta cambia entrambi i contesti.
//
// NB: costruisciHash produce l'impronta BYTE-IDENTICA alla versione precedente
// (stesse chiavi, stesso ordine) → la cache delle insight NON si invalida.

import { createHash } from 'crypto'
import type { StatoSemaforoCassa } from '@/lib/contabilita/cassa'
import type { BriefContext, HealthStatus, Metric, Timeframe } from '@/lib/copilot/ai'

// Semaforo cassa → stato del brief + etichetta. Erano duplicati identici in
// brief/context.ts e financial/context.ts (Dup.1, parte verbatim).
export const SEMAFORO_TO_STATUS: Record<StatoSemaforoCassa, HealthStatus> = {
  verde: 'green',
  giallo: 'yellow',
  rosso: 'red',
}
export const SEMAFORO_LABEL: Record<StatoSemaforoCassa, string> = {
  verde: 'cassa in salute',
  giallo: 'cassa da tenere d’occhio',
  rosso: 'cassa in sofferenza',
}

// I periodi della Contabilità/Organico (oggi/settimana/mese/anno) → Timeframe del brief.
export function periodoToTimeframe(periodo: string): Timeframe {
  if (periodo === 'oggi') return 'daily'
  if (periodo === 'settimana') return 'weekly'
  return 'monthly'
}

// Ancora del periodo come "YYYY-MM-DD" in componenti locali (coerente con calcolaPeriodo,
// che costruisce le date in orario locale). Serve da chiave di cache stabile.
export function chiavePeriodo(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Avanzamento di un periodo di calendario rispetto a ORA. Serve a dichiarare che i
// totali sono parziali quando il periodo non è ancora concluso (mese/settimana/anno
// correnti). `fine` è esclusiva (inizio del periodo successivo).
export function calcolaAvanzamento(inizio: Date, fine: Date): BriefContext['periodProgress'] {
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

// Hash dei numeri che l'AI interpreta: se non cambiano, si serve la cache (no chiamata
// AI). Include l'avanzamento del periodo: se il periodo è in corso e passa un giorno, il
// verdetto va rigenerato (i totali parziali cambiano significato).
export function costruisciHash(
  periodo: string,
  riferimentoKey: string,
  metrics: Metric[],
  status: HealthStatus | undefined,
  periodProgress: BriefContext['periodProgress'],
): string {
  const impronta = JSON.stringify({
    periodo,
    riferimentoKey,
    m: metrics.map((x) => [x.key, x.value]),
    status: status ?? null,
    avanzamento: periodProgress ? periodProgress.elapsedDays : null,
  })
  return createHash('sha1').update(impronta).digest('hex')
}

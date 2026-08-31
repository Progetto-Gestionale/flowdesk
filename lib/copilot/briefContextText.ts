// Serializza un BriefContext (i numeri GIÀ calcolati dal motore deterministico dei
// brief) in un blocco di testo compatto, da iniettare nel prompt della chat.
//
// Perché: quando il titolare ha appena visto un brief e fa domande di chiarimento,
// non ha senso che la chat rifaccia i giri di tool-use per ripescare gli stessi
// numeri. Iniettiamo qui i dati del brief → la chat risponde da questi senza
// chiamare strumenti (meno token, e coerenza col brief che l'utente sta guardando).

import type { BriefContext, Metric } from '@/lib/copilot/ai'

const TF_LABEL: Record<string, string> = {
  daily: 'oggi',
  weekly: 'ultima settimana',
  monthly: 'ultimo mese',
}

function valore(m: Metric): string {
  const v = m.value
  if (typeof v === 'string') return v
  if (m.unit === 'EUR') return `${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} euro`
  if (m.unit === '%') return `${v}%`
  if (m.unit) return `${v} ${m.unit}`
  return String(v)
}

export function formatBriefContext(ctx: BriefContext): string {
  const righe: string[] = []
  righe.push(`Periodo del brief: ${TF_LABEL[ctx.timeframe] ?? ctx.timeframe} (dal ${ctx.period.start} al ${ctx.period.end}).`)
  for (const s of ctx.sections) {
    righe.push(`\n${s.title}:`)
    for (const m of s.metrics) {
      const delta = m.deltaLabel ? ` (${m.deltaLabel})` : ''
      righe.push(`- ${m.label}: ${valore(m)}${delta}`)
    }
  }
  return righe.join('\n')
}

// Blocco completo da appendere al system prompt, con le istruzioni d'uso.
export function briefSystemBlock(ctx: BriefContext): string {
  return `DATI DEL BRIEF CHE IL TITOLARE STA GUARDANDO (già calcolati sui suoi dati reali).
Usa QUESTI numeri per rispondere a domande di chiarimento sul brief: sono affidabili e riferiti al periodo indicato. Se la domanda riguarda un numero già presente qui, rispondi da qui SENZA chiamare strumenti (è più veloce ed è lo stesso dato che l'utente vede a schermo). Chiama gli strumenti solo per dati NON presenti qui (es. un periodo o una tabella diversi).

${formatBriefContext(ctx)}`
}

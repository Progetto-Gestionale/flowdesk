// Utility condivise per la spesa dell'Assistente AI.

import { prisma } from '@/lib/prisma'
import type { AIUsage } from '@/lib/copilot/ai'

// Cambio approssimativo USD→EUR per mostrare la stima in euro (la fatturazione
// Anthropic è in dollari). Aggiornabile all'occorrenza.
export const USD_TO_EUR = 0.92

// Mese corrente "YYYY-MM" in fuso Europe/Rome (così il taglio del mese è locale).
export function meseCorrente(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 7)
}

// ── Spesa dei BRIEF ──────────────────────────────────────────────────────────
// I brief usano un modello proprio (di default Haiku, economico), diverso dalla
// chat. Prezzi in $ per 1M token; cr = cache-read. Se cambi COPILOT_BRIEF_MODEL
// (o passi a Gemini) aggiorna la voce corrispondente.
const PRICING_BRIEF: Record<string, { in: number; out: number; cr: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5, cr: 0.1 },
  'claude-sonnet-5': { in: 3, out: 15, cr: 0.3 },
  'claude-opus-4-8': { in: 5, out: 25, cr: 0.5 },
  'gemini-2.0-flash': { in: 0.075, out: 0.3, cr: 0.075 },
}

export function stimaCostoBriefUsd(usage: AIUsage): number {
  const model = process.env.COPILOT_BRIEF_MODEL ?? 'claude-haiku-4-5'
  const p = PRICING_BRIEF[model] ?? PRICING_BRIEF['claude-haiku-4-5']
  const inTok = usage.inputTokens ?? 0 // input non-cached (Anthropic li dà già al netto)
  const outTok = usage.outputTokens ?? 0
  const crTok = usage.cachedInputTokens ?? 0 // input serviti dalla cache (~10%)
  return (inTok * p.in + outTok * p.out + crTok * p.cr) / 1_000_000
}

// Somma la spesa di questo brief al totale del mese del locale (stessa tabella
// CopilotUsage della chat → il contatore mostra la spesa AI complessiva). In
// try/catch: se il DB fallisce, il brief funziona comunque.
export async function registraSpesaBrief(
  userId: string,
  usage: AIUsage,
): Promise<{ costoEur: number } | null> {
  const costoUsd = stimaCostoBriefUsd(usage)
  try {
    const mese = meseCorrente()
    const row = await prisma.copilotUsage.upsert({
      where: { userId_mese: { userId, mese } },
      create: { userId, mese, costoUsd, tokenInput: usage.inputTokens ?? 0, tokenOutput: usage.outputTokens ?? 0 },
      update: {
        costoUsd: { increment: costoUsd },
        tokenInput: { increment: usage.inputTokens ?? 0 },
        tokenOutput: { increment: usage.outputTokens ?? 0 },
      },
    })
    return { costoEur: row.costoUsd * USD_TO_EUR }
  } catch (e) {
    console.error('[COPILOT] registrazione spesa brief fallita:', e)
    return null
  }
}

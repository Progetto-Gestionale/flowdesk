// Spesa dei BRIEF — sottile strato sopra lib/copilot/pricing.ts (Dup.3).
// I brief usano un modello proprio (di default Haiku) e un formato usage diverso
// dalla chat (AIUsage, senza cache-write). Qui converto e delego al pricing unico.
// Ri-esporto USD_TO_EUR e meseCorrente per non rompere gli import esistenti.

import { registraSpesa, stimaCostoUsd, USD_TO_EUR, meseCorrente } from '@/lib/copilot/pricing'
import type { AIUsage } from '@/lib/copilot/ai'

export { USD_TO_EUR, meseCorrente }

// Modello dei brief (economico). Se lo cambi via env, aggiorna la voce in pricing.ts.
function modelloBrief(): string {
  return process.env.COPILOT_BRIEF_MODEL ?? 'claude-haiku-4-5'
}

export function stimaCostoBriefUsd(usage: AIUsage): number {
  return stimaCostoUsd(
    {
      input: usage.inputTokens ?? 0,
      output: usage.outputTokens ?? 0,
      cacheRead: usage.cachedInputTokens ?? 0,
      cacheCreation: 0, // i brief non pagano cache-write
    },
    modelloBrief(),
  )
}

// Somma la spesa di questo brief al totale del mese del locale (stessa tabella
// CopilotUsage della chat → il contatore mostra la spesa AI complessiva).
export async function registraSpesaBrief(
  userId: string,
  usage: AIUsage,
): Promise<{ costoEur: number } | null> {
  const costoUsd = stimaCostoBriefUsd(usage)
  return registraSpesa(userId, costoUsd, usage.inputTokens ?? 0, usage.outputTokens ?? 0)
}

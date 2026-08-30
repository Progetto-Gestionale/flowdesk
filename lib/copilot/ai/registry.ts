import type { AIProvider } from './provider'
import { ClaudeProvider } from './providers/claude'
import { GeminiProvider } from './providers/gemini'

// ─────────────────────────────────────────────────────────────────────────────
// Selettore del provider. UNA riga di config (env COPILOT_AI_PROVIDER) decide chi
// genera i brief. GeminiProvider non importa l'SDK Google a livello di modulo (lo
// carica in modo lazy solo dentro complete()), quindi importarlo qui è innocuo:
// se non usi Gemini, il suo pacchetto non serve nemmeno installato.
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderName = 'claude' | 'gemini'

const cache = new Map<ProviderName, AIProvider>()

export function getProvider(name?: ProviderName): AIProvider {
  const scelto = (name ?? process.env.COPILOT_AI_PROVIDER ?? 'claude') as ProviderName

  const esistente = cache.get(scelto)
  if (esistente) return esistente

  const provider: AIProvider = scelto === 'gemini' ? new GeminiProvider() : new ClaudeProvider()
  cache.set(scelto, provider)
  return provider
}

// ─────────────────────────────────────────────────────────────────────────────
// API pubblica dello strato AI agnostico del Copilota.
// Il resto dell'app importa SOLO da qui: import { generateBrief } from '@/lib/copilot/ai'
// ─────────────────────────────────────────────────────────────────────────────

export * from './types'
export { getProvider } from './registry'
export type { ProviderName } from './registry'
export { generateBrief } from './narrator'
export type { GenerateBriefOptions, GenerateBriefResult } from './narrator'
export type { AIProvider, AICompletionRequest, AICompletionResponse, AIUsage } from './provider'

// ─────────────────────────────────────────────────────────────────────────────
// La giuntura. Ogni provider di modello implementa questa interfaccia. Scambiare
// Claude con Gemini è un cambio di configurazione, mai una riscrittura, perché il
// narratore parla SOLO questo linguaggio.
// ─────────────────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AICompletionRequest {
  // Blocco di istruzioni fisso. Tenuto stabile così i provider possono metterlo in cache.
  system: string
  // Il payload della singola richiesta (JSON del contesto + compito).
  messages: AIMessage[]
  // JSON Schema a cui la risposta DEVE conformarsi (output strutturato).
  schema: Record<string, unknown>
  maxTokens: number
}

export interface AIUsage {
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
}

export interface AICompletionResponse {
  // Oggetto JSON già parsato, conforme a `schema`.
  data: unknown
  usage: AIUsage
  model: string
}

export interface AIProvider {
  readonly name: string
  complete(req: AICompletionRequest): Promise<AICompletionResponse>
}

// Estrae il primo oggetto JSON da un testo, tollerando eventuali recinti markdown
// (```json ... ```) o testo attorno. Rete di sicurezza condivisa dai provider:
// l'output strutturato dovrebbe già dare JSON puro, ma non ci fidiamo alla cieca.
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // rimuovi recinti ```json / ``` e riprova
    const senzaRecinti = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    try {
      return JSON.parse(senzaRecinti)
    } catch {
      // ultimo tentativo: dalla prima { all'ultima }
      const start = senzaRecinti.indexOf('{')
      const end = senzaRecinti.lastIndexOf('}')
      if (start >= 0 && end > start) {
        return JSON.parse(senzaRecinti.slice(start, end + 1))
      }
      throw new Error('Risposta AI non è JSON valido: ' + trimmed.slice(0, 200))
    }
  }
}

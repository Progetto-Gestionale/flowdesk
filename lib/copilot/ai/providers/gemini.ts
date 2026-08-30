import {
  parseJsonLoose,
  type AICompletionRequest,
  type AICompletionResponse,
  type AIProvider,
} from '../provider'

// Provider Gemini. È qui per dimostrare che lo scambio è un flag di config, non
// una riscrittura. NOTA IMPORTANTE:
//  1) Il pacchetto '@google/generative-ai' NON è installato di default: lo
//     importiamo in modo lazy (dynamic import) così il build resta verde finché
//     non scegli davvero Gemini. Per usarlo: npm i @google/generative-ai
//  2) Lo schema JSON di Gemini (responseSchema) è un sottoinsieme OpenAPI, non
//     identico a JSON Schema: campi come additionalProperties/maxItems vengono
//     ignorati. La nostra validazione lato codice (narrator.enforceGrounding)
//     copre comunque il grounding, quindi va bene.
//  3) Verifica i nomi dei campi contro l'SDK Google corrente prima del rilascio:
//     la loro superficie API cambia spesso.
const DEFAULT_MODEL = process.env.COPILOT_GEMINI_MODEL ?? 'gemini-2.0-flash'

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini'
  private apiKey: string
  private model: string

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY ?? ''
    this.model = opts?.model ?? DEFAULT_MODEL
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    // Dipendenza opzionale: presente solo se scegli Gemini (npm i @google/generative-ai).
    // I magic comment dicono a webpack/Turbopack di NON risolverlo a build-time (così
    // il build Vercel non fallisce con "Module not found" finché il pacchetto non c'è);
    // a runtime, se manca, l'import nativo lancia e lo catturiamo con un messaggio chiaro.
    // @ts-ignore
    const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@google/generative-ai').catch(
      () => {
        throw new Error(
          "Provider 'gemini' selezionato ma '@google/generative-ai' non è installato. Esegui: npm i @google/generative-ai",
        )
      },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { GoogleGenerativeAI } = mod as any

    const genAI = new GoogleGenerativeAI(this.apiKey)
    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: req.system,
      generationConfig: {
        maxOutputTokens: req.maxTokens,
        responseMimeType: 'application/json',
        responseSchema: req.schema,
      },
    })

    const prompt = req.messages.map((m) => m.content).join('\n\n')
    const res = await model.generateContent(prompt)
    const text = res.response.text()
    const um = res.response.usageMetadata ?? {}

    return {
      data: parseJsonLoose(text),
      model: this.model,
      usage: {
        inputTokens: um.promptTokenCount,
        outputTokens: um.candidatesTokenCount,
      },
    }
  }
}

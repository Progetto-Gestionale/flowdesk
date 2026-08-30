import Anthropic from '@anthropic-ai/sdk'
import {
  parseJsonLoose,
  type AICompletionRequest,
  type AICompletionResponse,
  type AIProvider,
} from '../provider'

// Modello del narratore dei brief. Il brief riceve numeri GIÀ calcolati e deve
// solo interpretarli: Haiku basta e costa poco. Per più qualità bastano queste
// due righe (o la env COPILOT_BRIEF_MODEL). Il caching del system prompt vale
// SOLO dentro lo stesso provider: è la ragione per cui non frammentiamo su 4.
const DEFAULT_MODEL = process.env.COPILOT_BRIEF_MODEL ?? 'claude-haiku-4-5'

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude'
  private client: Anthropic
  private model: string

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.client = new Anthropic({ apiKey: opts?.apiKey ?? process.env.ANTHROPIC_API_KEY })
    this.model = opts?.model ?? DEFAULT_MODEL
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens,
      // System frozen + in cache (TTL 1h): la parte stabile si paga al ~10% nei
      // brief successivi. Stessa strategia della chat del Copilota.
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      // Output strutturato. Cast perché versioni più vecchie dell'SDK potrebbero
      // non tipare ancora output_config; l'API lo accetta lo stesso.
      ...({ output_config: { format: { type: 'json_schema', schema: req.schema } } } as Record<
        string,
        unknown
      >),
    })

    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()

    return {
      data: parseJsonLoose(text),
      model: res.model,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cachedInputTokens: res.usage.cache_read_input_tokens ?? undefined,
      },
    }
  }
}

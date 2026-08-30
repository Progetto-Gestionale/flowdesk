import { getProvider, type ProviderName } from './registry'
import { buildBriefSchema } from './schema'
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts'
import type { AIUsage } from './provider'
import type { Brief, BriefContext, HealthStatus, Insight, ProposedAction } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Il narratore: BriefContext -> Brief. UNICO motore, due ingressi (cron e chat lo
// chiamano entrambi). È provider-agnostico: chiede solo JSON strutturato.
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateBriefOptions {
  provider?: ProviderName
  maxTokens?: number
}

export interface GenerateBriefResult {
  brief: Brief
  usage: AIUsage
}

export async function generateBrief(
  context: BriefContext,
  opts: GenerateBriefOptions = {},
): Promise<GenerateBriefResult> {
  const provider = getProvider(opts.provider)
  const schema = buildBriefSchema(context)

  const res = await provider.complete({
    system: SYSTEM_PROMPT,
    schema,
    maxTokens: opts.maxTokens ?? 1024,
    messages: [{ role: 'user', content: buildUserPrompt(context) }],
  })

  const raw = (res.data ?? {}) as Partial<Brief>
  const { why, actions } = enforceGrounding(raw, context)

  const brief: Brief = {
    status: (['green', 'yellow', 'red'] as HealthStatus[]).includes(raw.status as HealthStatus)
      ? (raw.status as HealthStatus)
      : 'yellow',
    headline: typeof raw.headline === 'string' ? raw.headline : '',
    why,
    actions,
    meta: {
      timeframe: context.timeframe,
      period: context.period,
      provider: provider.name,
      generatedAt: new Date().toISOString(),
    },
  }

  return { brief, usage: res.usage }
}

// Anti-allucinazione a livello di codice: butta via le chiavi-evidenza e gli id
// azione che il contesto NON contiene davvero. Il prompt lo chiede; qui lo
// GARANTIAMO, a prescindere da cosa produce il modello.
function enforceGrounding(raw: Partial<Brief>, context: BriefContext) {
  const metricKeys = new Set(context.sections.flatMap((s) => s.metrics.map((m) => m.key)))
  const actionIds = new Set(context.allowedActions.map((a) => a.id))

  const why: Insight[] = (raw.why ?? []).slice(0, 2).map((i) => ({
    title: typeof i.title === 'string' ? i.title : '',
    detail: typeof i.detail === 'string' ? i.detail : '',
    evidence: (i.evidence ?? []).filter((k) => metricKeys.has(k)),
  }))

  const actions: ProposedAction[] = (raw.actions ?? [])
    .filter((a) => a && actionIds.has(a.id))
    .map((a) => ({
      id: a.id,
      label: typeof a.label === 'string' ? a.label : a.id,
      urgency: (['low', 'medium', 'high'] as const).includes(a.urgency) ? a.urgency : 'medium',
      params: a.params,
    }))

  return { why, actions }
}

import { generateBrief, type Brief, type BriefContext, type Timeframe } from '@/lib/copilot/ai'
import type { AIUsage, ProviderName } from '@/lib/copilot/ai'
import { buildBriefContext } from './context'

// ─────────────────────────────────────────────────────────────────────────────
// UN motore, due ingressi. Sia il cron (brief automatici a orario) sia la chat
// (brief on-demand) chiamano QUESTA funzione. buildBriefContext produce i numeri,
// generateBrief li fa interpretare. Restituisce anche il context, perché il
// frontend renderizza i NUMERI dal context (non dal testo dell'AI).
// ─────────────────────────────────────────────────────────────────────────────

export interface RestaurantBrief {
  brief: Brief
  context: BriefContext
  usage: AIUsage
}

export async function generateRestaurantBrief(
  userId: string,
  timeframe: Timeframe,
  opts: { provider?: ProviderName } = {},
): Promise<RestaurantBrief> {
  const context = await buildBriefContext(userId, timeframe)
  const { brief, usage } = await generateBrief(context, { provider: opts.provider })
  return { brief, context, usage }
}

export { buildBriefContext } from './context'

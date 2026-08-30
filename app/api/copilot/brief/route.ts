import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { generateRestaurantBrief } from '@/lib/copilot/brief'
import { registraSpesaBrief } from '@/lib/copilot/spesa'
import type { Timeframe } from '@/lib/copilot/ai'

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint dei BRIEF (on-demand). Stesso ingresso che userà anche il cron: chiama
// generateRestaurantBrief (buildContext + narratore) e registra la spesa nel
// totale del mese. Restituisce { brief, context, spesaMese }: il frontend
// disegna i 3 blocchi e rende i NUMERI dal context.
// ─────────────────────────────────────────────────────────────────────────────

const TIMEFRAMES: Timeframe[] = ['daily', 'weekly', 'monthly']

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  // timeframe dal body; default 'daily' se assente o non valido.
  let timeframe: Timeframe = 'daily'
  try {
    const body = (await req.json()) as { timeframe?: string }
    if (body?.timeframe && TIMEFRAMES.includes(body.timeframe as Timeframe)) {
      timeframe = body.timeframe as Timeframe
    }
  } catch {
    // nessun body / non-JSON → resta 'daily'
  }

  try {
    const { brief, context, usage } = await generateRestaurantBrief(user.id, timeframe)
    const spesaMese = await registraSpesaBrief(user.id, usage)
    return NextResponse.json({ brief, context, spesaMese })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[COPILOT] brief errore:', msg)
    return NextResponse.json({ error: 'Errore nella generazione del brief: ' + msg }, { status: 500 })
  }
}

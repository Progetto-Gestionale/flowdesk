import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { generateRestaurantBrief } from '@/lib/copilot/brief'
import { caricaBrief, salvaBrief } from '@/lib/copilot/brief/persist'
import { registraSpesaBrief } from '@/lib/copilot/spesa'
import type { Timeframe } from '@/lib/copilot/ai'

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint dei BRIEF.
//   GET  → restituisce il brief GIÀ PRONTO (persistito dal cron del mattino o
//          dall'ultima generazione). Nessun costo AI: è una lettura. Se non c'è
//          ancora nulla salvato, ritorna { brief: null } e il frontend lo genera.
//   POST → RIGENERA on-demand (buildContext + narratore), lo salva e registra la
//          spesa. Restituisce { brief, context, generatedAt, spesaMese }: il
//          frontend disegna i 3 blocchi e rende i NUMERI dal context.
// ─────────────────────────────────────────────────────────────────────────────

const TIMEFRAMES: Timeframe[] = ['daily', 'weekly', 'monthly']

function parseTimeframe(v: string | null | undefined): Timeframe {
  return v && TIMEFRAMES.includes(v as Timeframe) ? (v as Timeframe) : 'daily'
}

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const timeframe = parseTimeframe(searchParams.get('timeframe'))

  const salvato = await caricaBrief(user.id, timeframe)
  if (!salvato) return NextResponse.json({ brief: null })
  return NextResponse.json({
    brief: salvato.brief,
    context: salvato.context,
    generatedAt: salvato.generatedAt,
  })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  let timeframe: Timeframe = 'daily'
  try {
    const body = (await req.json()) as { timeframe?: string }
    timeframe = parseTimeframe(body?.timeframe)
  } catch {
    // nessun body / non-JSON → resta 'daily'
  }

  try {
    const { brief, context, usage } = await generateRestaurantBrief(user.id, timeframe)
    // Persistiamo la generazione manuale: così il brief mostrato resta lo stesso
    // su tutti i dispositivi e sopravvive al refresh, come quello del cron.
    await salvaBrief(user.id, timeframe, { brief, context })
    const spesaMese = await registraSpesaBrief(user.id, usage)
    return NextResponse.json({ brief, context, generatedAt: new Date().toISOString(), spesaMese })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[COPILOT] brief errore:', msg)
    return NextResponse.json({ error: 'Errore nella generazione del brief: ' + msg }, { status: 500 })
  }
}

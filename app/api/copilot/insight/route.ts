import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { prisma } from '@/lib/prisma'
import { buildFinancialContext } from '@/lib/copilot/financial/context'
import { generateBrief } from '@/lib/copilot/ai'
import { registraSpesaBrief, meseCorrente, USD_TO_EUR } from '@/lib/copilot/spesa'
import type { Brief, BriefContext } from '@/lib/copilot/ai'

// ─────────────────────────────────────────────────────────────────────────────
// Insight card AI (Ponte AI / F4). Verdetto di 3 righe su una schermata + periodo.
// Owner-only. CONTROLLO COSTI a tre livelli:
//   1. cache per HASH dei numeri: se non sono cambiati dall'ultima volta → 0 chiamate AI.
//   2. budget cap mensile per locale: superato → verdetto deterministico (niente AI).
//   3. niente venduto nel periodo → verdetto deterministico (niente da interpretare).
// I numeri li calcola sempre il codice (riepilogoContabile); l'AI solo li racconta.
// ─────────────────────────────────────────────────────────────────────────────

// Tetto di spesa AI mensile per locale (EUR). Oltre, le card servono testo deterministico.
const BUDGET_EUR = Number(process.env.COPILOT_BUDGET_EUR ?? '15')

const SCOPES = ['contabilita']
const PERIODI = ['oggi', 'settimana', 'mese', 'anno']

// Verdetto deterministico (senza AI): per il caso vuoto e per il budget esaurito. Onesto
// e utile lo stesso — usa il semaforo e le metriche già calcolate.
function briefDeterministico(context: BriefContext, label: string): Brief {
  const status = context.statusHint ?? 'yellow'
  const metrics = context.sections[0]?.metrics ?? []
  const m = (k: string) => metrics.find((x) => x.key === k)
  const margine = m('margine_netto')?.value
  const utile = m('utile_stimato')?.value
  const statoLabel = status === 'green' ? 'in salute' : status === 'red' ? 'in criticità' : 'da tenere d’occhio'
  const headline = margine != null
    ? `${label}: locale ${statoLabel}, margine netto ${margine}%.`
    : `${label}: nessun venduto in questo periodo.`
  const why = utile != null
    ? [{ title: 'Soldi realmente tuoi', detail: `Utile netto stimato di ${utile}€ dopo IVA, food cost, personale, costi fissi e tasse.`, evidence: ['utile_stimato'] }]
    : []
  return {
    status,
    headline,
    why,
    actions: [],
    meta: { timeframe: context.timeframe, period: context.period, provider: 'deterministic', generatedAt: new Date().toISOString() },
  }
}

async function spesaMeseEur(userId: string): Promise<number> {
  try {
    const row = await prisma.copilotUsage.findUnique({ where: { userId_mese: { userId, mese: meseCorrente() } } })
    return row ? row.costoUsd * USD_TO_EUR : 0
  } catch { return 0 }
}

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') ?? 'contabilita'
  const periodo = searchParams.get('periodo') ?? 'mese'
  const riferimento = searchParams.get('riferimento')
  if (!SCOPES.includes(scope) || !PERIODI.includes(periodo)) {
    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 })
  }

  // Numeri (sempre dal codice) + hash per la cache.
  const { context, hash, label, riferimentoKey, vuoto } = await buildFinancialContext(user.id, periodo, riferimento)

  // 1. Cache per hash: stessi numeri dell'ultima volta → nessuna chiamata AI.
  const cached = await prisma.copilotInsight.findUnique({
    where: { userId_scope_periodo_riferimento: { userId: user.id, scope, periodo, riferimento: riferimentoKey } },
  }).catch(() => null)
  if (cached && cached.hash === hash) {
    return NextResponse.json({ brief: JSON.parse(cached.brief) as Brief, label, cached: true, generatedAt: cached.generatedAt })
  }

  // 2/3. Niente venduto o budget esaurito → verdetto deterministico (niente AI).
  if (vuoto || (await spesaMeseEur(user.id)) >= BUDGET_EUR) {
    const brief = briefDeterministico(context, label)
    await salvaInsight(user.id, scope, periodo, riferimentoKey, hash, brief)
    return NextResponse.json({ brief, label, cached: false, budget: !vuoto })
  }

  // Miss di cache e sotto budget → genera con l'AI (Haiku), salva, registra la spesa.
  try {
    const { brief, usage } = await generateBrief(context, { maxTokens: 400 })
    await salvaInsight(user.id, scope, periodo, riferimentoKey, hash, brief)
    const spesaMese = await registraSpesaBrief(user.id, usage)
    return NextResponse.json({ brief, label, cached: false, spesaMese })
  } catch (e: unknown) {
    // Se l'AI fallisce, non lasciamo la pagina senza verdetto: fallback deterministico.
    console.error('[COPILOT] insight AI fallita:', e instanceof Error ? e.message : String(e))
    const brief = briefDeterministico(context, label)
    return NextResponse.json({ brief, label, cached: false, fallback: true })
  }
}

async function salvaInsight(userId: string, scope: string, periodo: string, riferimento: string, hash: string, brief: Brief) {
  try {
    const payload = { hash, brief: JSON.stringify(brief), generatedAt: new Date() }
    await prisma.copilotInsight.upsert({
      where: { userId_scope_periodo_riferimento: { userId, scope, periodo, riferimento } },
      create: { userId, scope, periodo, riferimento, ...payload },
      update: payload,
    })
  } catch (e) {
    console.error('[COPILOT] salvataggio insight fallito:', e)
  }
}

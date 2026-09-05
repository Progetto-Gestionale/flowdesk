import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { prisma } from '@/lib/prisma'
import { buildFinancialContext } from '@/lib/copilot/financial/context'
import { buildStaffContext } from '@/lib/copilot/staff/context'
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

const SCOPES = ['contabilita', 'personale']
const PERIODI = ['oggi', 'settimana', 'mese', 'anno']

// Verdetto deterministico (senza AI): per il caso vuoto e per il budget esaurito. Onesto
// e utile lo stesso — usa il semaforo e le metriche già calcolate.
function briefDeterministico(context: BriefContext, label: string, scope: string): Brief {
  const status = context.statusHint ?? 'yellow'
  const metrics = context.sections[0]?.metrics ?? []
  const m = (k: string) => metrics.find((x) => x.key === k)

  let headline: string
  let why: Brief['why'] = []

  if (scope === 'personale') {
    const oggi = m('organico_oggi')
    if (oggi) {
      // Advisor di oggi (pre-servizio): il verdetto è già pronto nella metrica.
      headline = `${label}: ${oggi.value}${oggi.deltaLabel ? ` — ${oggi.deltaLabel}` : ''}.`
      why = oggi.deltaLabel ? [{ title: 'Organico di oggi', detail: String(oggi.deltaLabel), evidence: ['organico_oggi'] }] : []
    } else {
      const coperti = m('coperti_totali')?.value
      const cpo = m('coperti_per_ora')
      const statoLabel = status === 'green' ? 'in equilibrio coi coperti' : status === 'red' ? 'tirato: pochi rispetto ai coperti' : 'da tenere d’occhio'
      headline = coperti != null && Number(coperti) > 0
        ? `${label}: organico ${statoLabel} (${coperti} coperti serviti).`
        : `${label}: nessun coperto servito in questo periodo.`
      if (cpo?.value != null && Number(coperti) > 0) {
        why = [{ title: 'Coperti per ora-lavoro', detail: `${cpo.value} coperti per ora di personale${cpo.deltaLabel ? ` — ${cpo.deltaLabel}` : ''}.`, evidence: ['coperti_per_ora'] }]
      }
    }
  } else {
    const cassaPct = m('cassa_pct')?.value
    const cassaResta = m('cassa_resta')?.value
    const statoLabel = status === 'green' ? 'in salute' : status === 'red' ? 'in sofferenza' : 'da tenere d’occhio'
    headline = cassaPct != null
      ? `${label}: cassa ${statoLabel}, ti resta il ${cassaPct}% degli incassi.`
      : `${label}: nessun incasso in questo periodo.`
    why = cassaResta != null
      ? [{ title: 'Cassa che resta', detail: `Restano circa ${cassaResta}€ dopo personale, materie prime e costi fissi. È al lordo di tasse e saldo IVA: non è utile netto.`, evidence: ['cassa_resta'] }]
      : []
  }

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

  // Richiesta esplicita del titolare (tasto "Genera analisi" / "Aggiorna").
  const genera = searchParams.get('genera') === '1'

  // Auto-generazione automatica SOLO per "oggi". settimana/mese/anno — anche se in
  // corso — si generano solo su richiesta esplicita: il verdetto su orizzonti lunghi
  // cambia poco giorno per giorno, e rigenerarlo ogni notte moltiplicava i costi
  // (fino a 8 generazioni/locale/giorno). Una volta generato resta mostrato finché
  // il titolare non preme "Aggiorna". (P0.2)
  const autoGenera = periodo === 'oggi'

  // Numeri (sempre dal codice) + hash per la cache. Lo scope sceglie il motore dati;
  // il resto del flusso (cache, budget, narratore, fallback) è identico.
  const { context, hash, label, riferimentoKey, vuoto, corrente } = scope === 'personale'
    ? await buildStaffContext(user.id, periodo, riferimento)
    : await buildFinancialContext(user.id, periodo, riferimento)

  // 1. Cache per hash: stessi numeri dell'ultima volta → nessuna chiamata AI.
  const cached = await prisma.copilotInsight.findUnique({
    where: { userId_scope_periodo_riferimento: { userId: user.id, scope, periodo, riferimento: riferimentoKey } },
  }).catch(() => null)
  if (cached && cached.hash === hash) {
    return NextResponse.json({ brief: JSON.parse(cached.brief) as Brief, label, cached: true, generatedAt: cached.generatedAt, corrente })
  }

  // 2. RISPARMIO TOKEN: fuori da "oggi" e senza richiesta esplicita, non chiamiamo
  //    l'AI. Se esiste già un verdetto salvato (anche con numeri un filo cambiati) lo
  //    mostriamo ancora — così, una volta generato, mese/anno restano visibili senza
  //    rigenerarsi ogni notte. Se non c'è nulla di salvato, la card mostra il tasto
  //    "Genera analisi". In entrambi i casi: zero chiamate AI.
  if (!autoGenera && !genera) {
    if (cached) {
      return NextResponse.json({
        brief: JSON.parse(cached.brief) as Brief,
        label, cached: true, generatedAt: cached.generatedAt, corrente,
        rigenerabile: true, // il frontend può offrire "Aggiorna"
      })
    }
    return NextResponse.json({ brief: null, label, generabile: true, corrente })
  }

  // 3. Niente venduto o budget esaurito → verdetto deterministico (niente AI).
  if (vuoto || (await spesaMeseEur(user.id)) >= BUDGET_EUR) {
    const brief = briefDeterministico(context, label, scope)
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
    const brief = briefDeterministico(context, label, scope)
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

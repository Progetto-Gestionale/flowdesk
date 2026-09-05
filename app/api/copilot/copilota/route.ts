import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { prisma } from '@/lib/prisma'
import { buildCopilotaContext } from '@/lib/copilot/brief/context'
import { generateBrief } from '@/lib/copilot/ai'
import { registraSpesaBrief, meseCorrente, USD_TO_EUR } from '@/lib/copilot/spesa'
import type { Brief } from '@/lib/copilot/ai'

// ─────────────────────────────────────────────────────────────────────────────
// Superficie UNICA del Copilota: verdetto + TUTTE le sezioni per un periodo di
// calendario (oggi/settimana/mese/anno + navigazione passato). Disciplina costi:
//   · i NUMERI si restituiscono SEMPRE (li calcola il codice: nessun costo AI);
//   · il VERDETTO (narratore) si genera in automatico SOLO su "oggi"; per gli altri
//     periodi serve una richiesta esplicita (genera=1) — se un verdetto è già in
//     cache lo si continua a mostrare (rigenerabile), altrimenti tasto "Genera";
//   · cache per hash dei numeri; tetto di spesa mensile per locale; vuoto = niente AI.
// ─────────────────────────────────────────────────────────────────────────────

const BUDGET_EUR = Number(process.env.COPILOT_BUDGET_EUR ?? '15')
const SCOPE = 'copilota'
const PERIODI = ['oggi', 'settimana', 'mese', 'anno']

async function spesaMeseEur(userId: string): Promise<number> {
  try {
    const row = await prisma.copilotUsage.findUnique({ where: { userId_mese: { userId, mese: meseCorrente() } } })
    return row ? row.costoUsd * USD_TO_EUR : 0
  } catch { return 0 }
}

async function salvaVerdetto(userId: string, periodo: string, riferimento: string, hash: string, brief: Brief) {
  try {
    const payload = { hash, brief: JSON.stringify(brief), generatedAt: new Date() }
    await prisma.copilotInsight.upsert({
      where: { userId_scope_periodo_riferimento: { userId, scope: SCOPE, periodo, riferimento } },
      create: { userId, scope: SCOPE, periodo, riferimento, ...payload },
      update: payload,
    })
  } catch (e) {
    console.error('[COPILOTA] salvataggio verdetto fallito:', e)
  }
}

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const periodo = searchParams.get('periodo') ?? 'oggi'
  const riferimento = searchParams.get('riferimento')
  if (!PERIODI.includes(periodo)) {
    return NextResponse.json({ error: 'Periodo non valido' }, { status: 400 })
  }
  const genera = searchParams.get('genera') === '1'
  const autoGenera = periodo === 'oggi' // solo "oggi" si auto-genera; il resto on-demand

  // Numeri (sempre dal codice) + hash per la cache.
  const { context, hash, label, riferimentoKey, vuoto, corrente } = await buildCopilotaContext(user.id, periodo, riferimento)
  // I NUMERI vengono restituiti sempre: la pagina li mostra a prescindere dal verdetto.
  const numeri = { sections: context.sections, statusHint: context.statusHint ?? null, period: context.period, allowedActions: context.allowedActions }
  const base = { numeri, label, corrente }

  // 1. Cache per hash: stessi numeri → nessuna chiamata AI.
  const cached = await prisma.copilotInsight.findUnique({
    where: { userId_scope_periodo_riferimento: { userId: user.id, scope: SCOPE, periodo, riferimento: riferimentoKey } },
  }).catch(() => null)
  if (cached && cached.hash === hash) {
    return NextResponse.json({ ...base, brief: JSON.parse(cached.brief) as Brief, cached: true, generatedAt: cached.generatedAt })
  }

  // 2. Fuori da "oggi" e senza richiesta esplicita: niente AI. Se c'è un verdetto salvato
  //    (anche con numeri un filo diversi) lo mostriamo ancora (rigenerabile); altrimenti
  //    il frontend mostra i numeri + il tasto "Genera analisi".
  if (!autoGenera && !genera) {
    if (cached) return NextResponse.json({ ...base, brief: JSON.parse(cached.brief) as Brief, cached: true, generatedAt: cached.generatedAt, rigenerabile: true })
    return NextResponse.json({ ...base, brief: null, generabile: true })
  }

  // 3. Niente venduto o budget esaurito → nessuna AI (i numeri ci sono comunque).
  if (vuoto) return NextResponse.json({ ...base, brief: null, vuoto: true })
  if ((await spesaMeseEur(user.id)) >= BUDGET_EUR) return NextResponse.json({ ...base, brief: null, budget: true })

  // 4. Genera il verdetto (Haiku), salva, registra la spesa.
  try {
    const { brief, usage } = await generateBrief(context, { maxTokens: 500 })
    await salvaVerdetto(user.id, periodo, riferimentoKey, hash, brief)
    const spesaMese = await registraSpesaBrief(user.id, usage)
    return NextResponse.json({ ...base, brief, cached: false, spesaMese })
  } catch (e: unknown) {
    console.error('[COPILOTA] verdetto AI fallito:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ ...base, brief: null, fallback: true })
  }
}

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { prisma } from '@/lib/prisma'
import { buildCopilotPrompt } from '@/lib/copilot/prompt'
import { copilotTools, eseguiCopilotTool } from '@/lib/copilot/tools'
import { USD_TO_EUR, meseCorrente } from '@/lib/copilot/spesa'
import { buildBriefContext } from '@/lib/copilot/brief'
import { buildFinancialContext } from '@/lib/copilot/financial/context'
import { briefSystemBlock } from '@/lib/copilot/briefContextText'
import type { Timeframe } from '@/lib/copilot/ai'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Modelli: la chat parte su HAIKU (economico, ottimo per i lookup del tipo "quanto
// ho incassato ieri") e SALE a SONNET solo se serve davvero — o perché la domanda è
// palesemente complessa (euristica sotto), o perché Haiku esaurisce i giri di
// tool-use senza concludere (segnale che sta faticando su un'analisi multi-tabella).
// Così la maggior parte dei messaggi costa ~1/3, senza perdere qualità sulle domande
// difficili. Per la massima qualità sempre, mettere MODEL_BASE = MODEL_SMART.
const MODEL_BASE = 'claude-haiku-4-5'   // default economico
const MODEL_SMART = 'claude-sonnet-5'   // escalation qualità
const MAX_GIRI_BASE = 6      // giri di tool-use su Haiku prima di arrendersi/salire
const MAX_GIRI_SMART = 4     // giri extra concessi a Sonnet dopo l'escalation

// Prezzi in $ per 1 milione di token (fonte: reference Anthropic — verificare su
// fattura). Servono solo a stimare la spesa: input, output, cache-read (0,1x),
// cache-write (1,25x). Costo calcolato col modello EFFETTIVAMENTE usato a ogni giro.
const PRICING: Record<string, { in: number; out: number; cr: number; cw: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5, cr: 0.1, cw: 1.25 },
  'claude-sonnet-5': { in: 2, out: 10, cr: 0.2, cw: 2.5 },
  'claude-opus-4-8': { in: 5, out: 25, cr: 0.5, cw: 6.25 },
}
type Uso = { input: number; output: number; cacheRead: number; cacheCreation: number }
function stimaCostoUsd(u: Uso, model: string): number {
  const p = PRICING[model] ?? PRICING['claude-sonnet-5']
  return (u.input * p.in + u.output * p.out + u.cacheRead * p.cr + u.cacheCreation * p.cw) / 1_000_000
}

// Euristica leggera "domanda complessa" → parte subito su Sonnet (salta il giro Haiku
// che quasi certamente non basterebbe). Conservativa: nel dubbio resta Haiku e in caso
// l'escalation a fine giri fa da rete. Tunabile.
function domandaComplessa(testo: string): boolean {
  const t = testo.toLowerCase()
  if (t.length > 220) return true
  if ((t.match(/\?/g)?.length ?? 0) >= 2) return true
  // verbi/parole da analisi che incrociano più dimensioni
  if (/incroc|correl|confront|rispetto a|in base a|trend|andament|previs|proietta|margin|redditiv|per ciascun|per ogni|raggrupp|scorpor|in relazione/.test(t)) return true
  // due o più domini economici/operativi nella stessa domanda
  const domini = ['incass', 'coperti', 'personale', 'turni', 'timbrat', 'piatt', 'menu', 'prenotaz', 'clienti', 'ritard', 'costi']
  if (domini.filter((d) => t.includes(d)).length >= 2) return true
  return false
}

// Registra la spesa di questo messaggio nel totale del mese del locale (somma di
// tutti i dispositivi dell'account) e restituisce il totale aggiornato in euro.
// In try/catch: se la tabella non c'è ancora o il DB fallisce, la chat funziona
// comunque, semplicemente il contatore non si aggiorna.
async function registraSpesa(userId: string, uso: Uso, costoUsd: number): Promise<{ costoEur: number } | null> {
  try {
    const mese = meseCorrente()
    const row = await prisma.copilotUsage.upsert({
      where: { userId_mese: { userId, mese } },
      create: { userId, mese, costoUsd, tokenInput: uso.input, tokenOutput: uso.output },
      update: {
        costoUsd: { increment: costoUsd },
        tokenInput: { increment: uso.input },
        tokenOutput: { increment: uso.output },
      },
    })
    return { costoEur: row.costoUsd * USD_TO_EUR }
  } catch (e) {
    console.error('[COPILOT] registrazione spesa fallita:', e)
    return null
  }
}

type MsgIn = { role: 'user' | 'assistant'; content: string }
const TIMEFRAMES: Timeframe[] = ['daily', 'weekly', 'monthly']

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { messages, briefTimeframe, financial } = (await req.json()) as {
    messages: MsgIn[]
    briefTimeframe?: string
    financial?: { periodo?: string; riferimento?: string }
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages obbligatorio' }, { status: 400 })
  }

  const system = buildCopilotPrompt(user)

  // Contesto iniettato come SECONDO blocco system cacheable (nessun costo AI: sono query):
  //  · briefTimeframe → i numeri del brief che l'utente sta guardando (chat sul brief);
  //  · financial → i numeri della schermata Contabilità (chat aperta da "Approfondisci").
  // Così i chiarimenti si rispondono dai numeri già visti, senza giri di tool-use.
  let briefBlock: string | null = null
  if (financial?.periodo) {
    try {
      const { context } = await buildFinancialContext(user.id, financial.periodo, financial.riferimento)
      briefBlock = briefSystemBlock(context)
    } catch (e) {
      console.error('[COPILOT] context contabilità per chat non disponibile:', e)
    }
  } else if (briefTimeframe && TIMEFRAMES.includes(briefTimeframe as Timeframe)) {
    try {
      const ctx = await buildBriefContext(user.id, briefTimeframe as Timeframe)
      briefBlock = briefSystemBlock(ctx)
    } catch (e) {
      console.error('[COPILOT] context brief per chat non disponibile:', e)
    }
  }

  // Storia della conversazione in formato Anthropic (partiamo dai messaggi del client).
  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const uso: Uso = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
  let costoUsd = 0

  // Modello di partenza: Sonnet subito se la domanda è palesemente complessa,
  // altrimenti Haiku (con escalation a fine giri come rete di sicurezza).
  const ultimaDomanda = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  let model = domandaComplessa(ultimaDomanda) ? MODEL_SMART : MODEL_BASE
  let escalato = model === MODEL_SMART
  let giriFase = escalato ? MAX_GIRI_SMART : MAX_GIRI_BASE // giri rimasti nella fase corrente

  // Blocchi system: la guida+tools (stabile, pesante) sempre in cache; il context
  // del brief, se presente, come secondo blocco cacheable (stabile per timeframe).
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: '1h' } },
  ]
  if (briefBlock) {
    systemBlocks.push({ type: 'text', text: briefBlock, cache_control: { type: 'ephemeral', ttl: '1h' } })
  }

  try {
    for (;;) {
      // Fine dei giri della fase corrente: se eravamo su Haiku saliamo a Sonnet con
      // altri giri (una volta sola); se eravamo già su Sonnet, ci fermiamo.
      if (giriFase <= 0) {
        if (escalato) break
        escalato = true
        model = MODEL_SMART
        giriFase = MAX_GIRI_SMART
      }
      giriFase--

      const response = await client.messages.create({
        model,
        max_tokens: 1500,
        // La guida + gli strumenti (parte stabile e pesante) vanno in cache: il
        // breakpoint sull'ultimo blocco system copre anche i tools. Così, nei
        // giri di tool-use e nei messaggi successivi, quella parte si paga al
        // ~10% invece che piena. TTL 1 ora (finestra scorrevole, si rinnova a
        // ogni uso): adatta all'uso sporadico durante il servizio. Grosso risparmio.
        system: systemBlocks,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: copilotTools as any,
        messages: convo,
      })

      // Accumula i token di OGNI giro (il tool-use fa più chiamate per messaggio) e
      // il costo, calcolato col pricing del modello EFFETTIVAMENTE usato in questo giro
      // (Haiku o Sonnet): un messaggio può mescolare i due dopo un'escalation.
      const u = response.usage
      const giro: Uso = {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheCreation: u.cache_creation_input_tokens ?? 0,
      }
      uso.input += giro.input
      uso.output += giro.output
      uso.cacheRead += giro.cacheRead
      uso.cacheCreation += giro.cacheCreation
      costoUsd += stimaCostoUsd(giro, model)

      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((b) => b.type === 'text')
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('\n')
          .trim()
        const spesaMese = await registraSpesa(user.id, uso, costoUsd)
        return NextResponse.json({ text, spesaMese })
      }

      // Claude vuole usare uno o più strumenti: li eseguiamo e rimandiamo i risultati.
      convo.push({ role: 'assistant', content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const risultato = await eseguiCopilotTool(
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
            user.id,
          )
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(risultato),
          })
        }
      }
      convo.push({ role: 'user', content: toolResults })
    }

    // Esauriti i giri (anche dopo l'escalation a Sonnet) senza risposta testuale.
    const spesaMese = await registraSpesa(user.id, uso, costoUsd)
    return NextResponse.json({
      text: 'Ho fatto un po\' di analisi ma non sono riuscito a concludere. Prova a riformulare la domanda in modo più specifico.',
      spesaMese,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[COPILOT] errore:', msg)
    return NextResponse.json({ error: 'Errore nella chiamata AI: ' + msg }, { status: 500 })
  }
}

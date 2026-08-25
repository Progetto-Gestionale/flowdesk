import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { prisma } from '@/lib/prisma'
import { buildCopilotPrompt } from '@/lib/copilot/prompt'
import { copilotTools, eseguiCopilotTool } from '@/lib/copilot/tools'
import { USD_TO_EUR, meseCorrente } from '@/lib/copilot/spesa'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Modello: Sonnet 5 — ottimo per questo uso (tool-use + risposte dalla guida) e
// ~40% più economico di Opus. Per la massima qualità si può tornare a
// 'claude-opus-4-8' cambiando SOLO questa riga.
const MODEL = 'claude-sonnet-5'
const MAX_ITERAZIONI = 6 // quanti giri di tool use al massimo per messaggio

// Prezzi in $ per 1 milione di token (aggiorna se cambi MODEL). Servono a stimare
// la spesa: input, output, cache-read (0,1x), cache-write (1,25x).
const PRICING: Record<string, { in: number; out: number; cr: number; cw: number }> = {
  'claude-sonnet-5': { in: 3, out: 15, cr: 0.3, cw: 3.75 },
  'claude-opus-4-8': { in: 5, out: 25, cr: 0.5, cw: 6.25 },
}
type Uso = { input: number; output: number; cacheRead: number; cacheCreation: number }
function stimaCostoUsd(u: Uso): number {
  const p = PRICING[MODEL] ?? PRICING['claude-sonnet-5']
  return (u.input * p.in + u.output * p.out + u.cacheRead * p.cr + u.cacheCreation * p.cw) / 1_000_000
}

// Registra la spesa di questo messaggio nel totale del mese del locale (somma di
// tutti i dispositivi dell'account) e restituisce il totale aggiornato in euro.
// In try/catch: se la tabella non c'è ancora o il DB fallisce, la chat funziona
// comunque, semplicemente il contatore non si aggiorna.
async function registraSpesa(userId: string, uso: Uso): Promise<{ costoEur: number } | null> {
  const costoUsd = stimaCostoUsd(uso)
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

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { messages } = (await req.json()) as { messages: MsgIn[] }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages obbligatorio' }, { status: 400 })
  }

  const system = buildCopilotPrompt(user)

  // Storia della conversazione in formato Anthropic (partiamo dai messaggi del client).
  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const uso: Uso = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }

  try {
    for (let i = 0; i < MAX_ITERAZIONI; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        // La guida + gli strumenti (parte stabile e pesante) vanno in cache: il
        // breakpoint sull'ultimo blocco system copre anche i tools. Così, nei
        // giri di tool-use e nei messaggi successivi, quella parte si paga al
        // ~10% invece che piena. TTL 1 ora (finestra scorrevole, si rinnova a
        // ogni uso): adatta all'uso sporadico durante il servizio. Grosso risparmio.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: copilotTools as any,
        messages: convo,
      })

      // Accumula i token di OGNI giro (il tool-use fa più chiamate per messaggio).
      const u = response.usage
      uso.input += u.input_tokens ?? 0
      uso.output += u.output_tokens ?? 0
      uso.cacheRead += u.cache_read_input_tokens ?? 0
      uso.cacheCreation += u.cache_creation_input_tokens ?? 0

      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((b) => b.type === 'text')
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('\n')
          .trim()
        const spesaMese = await registraSpesa(user.id, uso)
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

    // Se abbiamo esaurito i giri senza una risposta testuale.
    const spesaMese = await registraSpesa(user.id, uso)
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

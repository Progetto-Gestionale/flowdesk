import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { buildCopilotPrompt } from '@/lib/copilot/prompt'
import { copilotTools, eseguiCopilotTool } from '@/lib/copilot/tools'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Modello: Sonnet 5 — ottimo per questo uso (tool-use + risposte dalla guida) e
// ~40% più economico di Opus. Per la massima qualità si può tornare a
// 'claude-opus-4-8' cambiando SOLO questa riga.
const MODEL = 'claude-sonnet-5'
const MAX_ITERAZIONI = 6 // quanti giri di tool use al massimo per messaggio

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

  try {
    for (let i = 0; i < MAX_ITERAZIONI; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: copilotTools as any,
        messages: convo,
      })

      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((b) => b.type === 'text')
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('\n')
          .trim()
        return NextResponse.json({ text })
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
    return NextResponse.json({
      text: 'Ho fatto un po\' di analisi ma non sono riuscito a concludere. Prova a riformulare la domanda in modo più specifico.',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[COPILOT] errore:', msg)
    return NextResponse.json({ error: 'Errore nella chiamata AI: ' + msg }, { status: 500 })
  }
}

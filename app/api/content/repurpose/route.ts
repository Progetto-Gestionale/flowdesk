import Anthropic from '@anthropic-ai/sdk'
import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const channelPrompts: Record<string, string> = {
  instagram: 'Riadatta questo testo come caption per Instagram: coinvolgente, con emoji appropriate e 3-5 hashtag rilevanti. Max 150 parole.',
  linkedin: 'Riadatta questo testo come post LinkedIn: professionale, autorevole, con una call to action finale. Max 200 parole.',
  whatsapp: 'Riadatta questo testo come messaggio WhatsApp: informale, diretto, breve e conversazionale. Max 80 parole.',
  email: 'Riadatta questo testo come newsletter email: con oggetto accattivante (scrivi "Oggetto: ..." nella prima riga), tono professionale ma caldo. Max 250 parole.',
  twitter: 'Riadatta questo testo come thread X/Twitter: massimo 280 caratteri per tweet, scrivi 3-4 tweet numerati (1/, 2/, ecc.).',
}

export async function POST(req: Request) {
  const userId = await getAuthUserId(req)
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { text, channel } = await req.json()
  if (!text || !channel) return NextResponse.json({ error: 'Testo e canale richiesti' }, { status: 400 })

  const prompt = channelPrompts[channel]
  if (!prompt) return NextResponse.json({ error: 'Canale non supportato' }, { status: 400 })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `${prompt}\n\nTesto originale:\n${text}`,
      },
    ],
  })

  const result = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ result })
}

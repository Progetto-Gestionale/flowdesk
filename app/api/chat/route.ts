import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildSystemPrompt as buildBotPrompt } from '@/lib/botPrompt'

function categorizzaRichiesta(servizio: string): string {
  const s = servizio.toLowerCase()
  if (/tavolo|cena|pranzo|ristorante|coperti|posto|sala|ristorazione|prenotazione/.test(s)) return 'tavolo'
  if (/appuntamento|visita|consulenza|incontro|colloquio|riunione|call|meeting/.test(s)) return 'appuntamento'
  if (/ordine|acquisto|prodotto|articolo|spedizione|consegna|shop/.test(s)) return 'ordine'
  if (/preventivo|offerta|quotazione|prezzo|costo|budget|stima/.test(s)) return 'preventivo'
  return 'servizio'
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BusinessSettings = any

export async function POST(req: Request) {
  const { messages, ownerId } = await req.json()

  let slots: { data: Date; oraInizio: string; oraFine: string; durata: number }[] = []
  let settings: BusinessSettings = {}

  if (ownerId) {
    try {
      const owner = await prisma.user.findUnique({ where: { id: ownerId } })
      if (owner) {
        settings = owner
        const now = new Date()
        slots = await prisma.slotDisponibile.findMany({
          where: { userId: owner.id, data: { gte: now } },
          orderBy: [{ data: 'asc' }, { oraInizio: 'asc' }],
        })
      }
    } catch (e) { console.error('[CHAT] errore settings/slot:', e) }
  }

  // Per widget pubblico: carica owner da publicId
  const publicId = req.headers.get('x-public-id')
  if (publicId && !ownerId) {
    try {
      const owner = await prisma.user.findUnique({ where: { publicId } })
      if (owner) settings = owner
    } catch (e) { console.error('[CHAT] errore publicId settings:', e) }
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: buildBotPrompt(settings),
    messages,
  })

  const fullText = response.content[0].type === 'text' ? response.content[0].text : ''
  const dataMatch = fullText.match(/DATI_RACCOLTI:(\{.*\})/)
  let contactCreated = false
  const visibleText = fullText.replace(/\nDATI_RACCOLTI:\{.*\}/, '').trim()

  const conversazioneId = (req.headers.get('x-conversazione-id') || '').trim()
  const allMessages = [...messages, { role: 'assistant', content: visibleText }]

  if (ownerId) {
    try {
      const owner = await prisma.user.findUnique({ where: { id: ownerId } })
      if (owner) {
        if (conversazioneId) {
          await prisma.conversazione.update({
            where: { id: conversazioneId },
            data: { messaggi: JSON.stringify(allMessages), letta: false },
          })
        } else {
          await prisma.conversazione.create({
            data: { userId: owner.id, canale: 'chat', messaggi: JSON.stringify(allMessages) },
          })
        }

        if (dataMatch) {
          const dati = JSON.parse(dataMatch[1])
          if (dati.nome && dati.email && dati.richiesta) {
            const leadEsistente = await prisma.lead.findFirst({
              where: { userId: owner.id, email: dati.email },
              orderBy: { createdAt: 'desc' },
            })

            // Se il lead era cancellato, lo ripristina come nuovo contatto
            if (leadEsistente?.cancellato) {
              await prisma.lead.update({
                where: { id: leadEsistente.id },
                data: { cancellato: false, status: 'nuovo' },
              })
            }

            const lead = leadEsistente ?? await prisma.lead.create({
              data: {
                userId: owner.id,
                name: dati.nome,
                email: dati.email,
                notes: dati.richiesta,
                status: 'nuovo',
              },
            })

            {
              const tipo = categorizzaRichiesta(dati.servizio || dati.richiesta)
              const count = await prisma.preventivo.count({ where: { userId: owner.id } })

              // Costruisci items arricchiti con campi food-specific
              const itemDesc = dati.servizio || dati.richiesta
              const itemArricchito: Record<string, unknown> = {
                descrizione: itemDesc,
                quantita: dati.coperti > 0 ? dati.coperti : 1,
                prezzo: 0,
              }
              if (dati.coperti > 0) itemArricchito.coperti = dati.coperti
              if (dati.allergie) itemArricchito.allergie = dati.allergie
              if (dati.occasione) itemArricchito.occasione = dati.occasione

              let noteAggiuntive = 'Generato automaticamente via chat.'
              if (dati.dataISO) noteAggiuntive += ` DATA_ISO:${dati.dataISO}`
              if (dati.oraISO) noteAggiuntive += ` ORA_ISO:${dati.oraISO}`
              if (dati.coperti > 0) noteAggiuntive += ` Coperti: ${dati.coperti}.`
              if (dati.allergie) noteAggiuntive += ` Allergie: ${dati.allergie}.`
              if (dati.occasione) noteAggiuntive += ` Occasione: ${dati.occasione}.`

              await prisma.preventivo.create({
                data: {
                  userId: owner.id,
                  leadId: lead.id,
                  numero: count + 1,
                  tipo,
                  clienteName: dati.nome,
                  clienteEmail: dati.email,
                  items: JSON.stringify([itemArricchito]),
                  totale: 0,
                  status: 'da_verificare',
                  note: noteAggiuntive,
                },
              })
            }

            if (conversazioneId) {
              await prisma.conversazione.update({
                where: { id: conversazioneId },
                data: { clienteNome: dati.nome, clienteEmail: dati.email },
              })
            }

            contactCreated = true
          }
        }
      }
    } catch (e) {
      console.error('[CHAT] Errore salvataggio dati:', e)
    }
  }

  return NextResponse.json({ text: visibleText, contactCreated })
}

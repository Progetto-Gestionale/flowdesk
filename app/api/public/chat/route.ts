import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildSystemPrompt } from '@/lib/botPrompt'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: Request) {
  const { messages, publicId } = await req.json()
  if (!publicId) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  const owner = await prisma.user.findUnique({ where: { publicId } })
  if (!owner) return NextResponse.json({ error: 'Attività non trovata' }, { status: 404 })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: buildSystemPrompt(owner),
    messages,
  })

  const fullText = response.content[0].type === 'text' ? response.content[0].text : ''
  const dataMatch = fullText.match(/DATI_RACCOLTI:(\{.*\})/)
  const visibleText = fullText.replace(/\nDATI_RACCOLTI:\{.*\}/, '').trim()

  // Salva lead e richiesta se i dati sono completi
  if (dataMatch) {
    try {
      const dati = JSON.parse(dataMatch[1])
      if (dati.nome && dati.email && dati.richiesta) {
        // Controlla capienza per quella data se maxCoperti è configurato
        let dataOccupata = false
        if (dati.dataISO && owner.maxCoperti) {
          const inizioGiorno = new Date(`${dati.dataISO}T00:00:00`)
          const fineGiorno = new Date(`${dati.dataISO}T23:59:59`)
          const appDelGiorno = await prisma.appuntamento.findMany({
            where: { userId: owner.id, data: { gte: inizioGiorno, lte: fineGiorno }, status: { not: 'cancellato' } },
            select: { coperti: true },
          })
          const copertiOccupati = appDelGiorno.reduce((s, a) => s + (a.coperti ?? 1), 0)
          if (copertiOccupati + (dati.coperti || 1) > owner.maxCoperti) {
            dataOccupata = true
          }
        }

        if (dataOccupata) {
          // Data piena → crea lead + preventivo lista_attesa + record lista attesa
          const leadEsistente = await prisma.lead.findFirst({ where: { userId: owner.id, email: dati.email }, orderBy: { createdAt: 'desc' } })
          const lead = leadEsistente ?? await prisma.lead.create({
            data: { userId: owner.id, name: dati.nome, email: dati.email, notes: dati.richiesta, status: 'nuovo' },
          })
          const count = await prisma.preventivo.count({ where: { userId: owner.id } })
          let note = 'Lista d\'attesa — data al completo.'
          if (dati.dataISO) note += ` DATA_ISO:${dati.dataISO}`
          if (dati.oraISO) note += ` ORA_ISO:${dati.oraISO}`
          if (dati.coperti > 0) note += ` Coperti: ${dati.coperti}.`
          const preventivo = await prisma.preventivo.create({
            data: {
              userId: owner.id, leadId: lead.id, numero: count + 1, tipo: 'tavolo',
              clienteName: dati.nome, clienteEmail: dati.email,
              items: JSON.stringify([{ descrizione: dati.servizio || dati.richiesta, coperti: dati.coperti || 1, prezzo: 0 }]),
              totale: 0, status: 'lista_attesa', note,
            },
          })
          await prisma.listaAttesa.create({
            data: {
              userId: owner.id, clienteNome: dati.nome, clienteEmail: dati.email,
              data: new Date(dati.dataISO), ora: dati.oraISO || '00:00',
              coperti: dati.coperti || 1, note: dati.richiesta,
              status: 'in_attesa', preventivoId: preventivo.id, leadId: lead.id,
            },
          })
          const rispostaAttesa = `Ho registrato la tua richiesta per il ${new Date(dati.dataISO).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}. Purtroppo quella data risulta già al completo, ma ti abbiamo aggiunto in **lista d'attesa**: ti contatteremo appena si libera un posto. Riceverai una conferma via email. Grazie!`
          const allMsgs = [...messages, { role: 'assistant', content: rispostaAttesa }]
          await prisma.conversazione.create({
            data: { userId: owner.id, canale: 'widget', messaggi: JSON.stringify(allMsgs), clienteNome: dati.nome, clienteEmail: dati.email },
          })
          return NextResponse.json({ text: rispostaAttesa, raccoltoDati: true, inListaAttesa: true })
        }

        const leadEsistente = await prisma.lead.findFirst({
          where: { userId: owner.id, email: dati.email },
          orderBy: { createdAt: 'desc' },
        })

        if (leadEsistente?.cancellato) {
          await prisma.lead.update({
            where: { id: leadEsistente.id },
            data: { cancellato: false, status: 'nuovo' },
          })
        }

        const lead = leadEsistente ?? await prisma.lead.create({
          data: { userId: owner.id, name: dati.nome, email: dati.email, notes: dati.richiesta, status: 'nuovo' },
        })
        {
          const tipo = (() => {
            const s = (dati.servizio || dati.richiesta).toLowerCase()
            if (/tavolo|cena|pranzo|coperti|posto/.test(s)) return 'tavolo'
            if (/appuntamento|visita|consulenza/.test(s)) return 'appuntamento'
            if (/ordine|acquisto|prodotto/.test(s)) return 'ordine'
            if (/preventivo|offerta|quotazione/.test(s)) return 'preventivo'
            return 'servizio'
          })()
          const count = await prisma.preventivo.count({ where: { userId: owner.id } })
          const itemArricchito: Record<string, unknown> = {
            descrizione: dati.servizio || dati.richiesta,
            quantita: dati.coperti > 0 ? dati.coperti : 1,
            prezzo: 0,
          }
          if (dati.coperti > 0) itemArricchito.coperti = dati.coperti
          if (dati.allergie) itemArricchito.allergie = dati.allergie
          if (dati.occasione) itemArricchito.occasione = dati.occasione

          let note = 'Da widget pubblico.'
          if (dati.dataISO) note += ` DATA_ISO:${dati.dataISO}`
          if (dati.oraISO) note += ` ORA_ISO:${dati.oraISO}`
          if (dati.coperti > 0) note += ` Coperti: ${dati.coperti}.`
          if (dati.allergie) note += ` Allergie: ${dati.allergie}.`
          if (dati.occasione) note += ` Occasione: ${dati.occasione}.`

          await prisma.preventivo.create({
            data: {
              userId: owner.id, leadId: lead.id, numero: count + 1, tipo,
              clienteName: dati.nome, clienteEmail: dati.email,
              items: JSON.stringify([itemArricchito]), totale: 0,
              status: 'da_verificare', note,
            },
          })

          // Ogni nuova richiesta riporta il lead a "nuovo" così appare in pipeline
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: 'nuovo', cancellato: false },
          })
        }
        // Salva conversazione
        const allMessages = [...messages, { role: 'assistant', content: visibleText }]
        await prisma.conversazione.create({
          data: { userId: owner.id, canale: 'widget', messaggi: JSON.stringify(allMessages), clienteNome: dati.nome, clienteEmail: dati.email },
        })
      }
    } catch (e) { console.error('[PUBLIC CHAT] errore salvataggio:', e) }
  }

  return NextResponse.json({ text: visibleText, raccoltoDati: !!dataMatch })
}

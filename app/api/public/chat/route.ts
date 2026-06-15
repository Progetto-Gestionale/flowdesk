import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  fetchOptions: { agent: new (require('https').Agent)({ rejectUnauthorized: false }) },
})

function buildPublicSystemPrompt(settings: {
  nomeLocale?: string | null
  descrizioneBot?: string | null
  orariApertura?: string | null
}) {
  const nomeLocale = settings.nomeLocale || 'questa attività'
  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  let descLocale = settings.descrizioneBot ? `\n\nDESCRIZIONE:\n${settings.descrizioneBot}` : ''

  let orariInfo = ''
  if (settings.orariApertura) {
    try {
      const orari = JSON.parse(settings.orariApertura) as Record<string, string>
      const righe = Object.entries(orari).filter(([, v]) => v).map(([g, v]) => `- ${g}: ${v}`)
      if (righe.length > 0) orariInfo = `\n\nORARI DI APERTURA:\n${righe.join('\n')}`
    } catch { /* ignora */ }
  }

  return `Sei l'assistente virtuale di ${nomeLocale}. Aiuta i clienti a fare prenotazioni e richieste in modo naturale e cordiale.

DATA DI OGGI: ${oggi}${descLocale}${orariInfo}

## COSA FARE

Accogli il cliente e raccogli le informazioni necessarie per gestire la sua richiesta:
- Nome e cognome
- Email di contatto
- Cosa vuole (prenotazione tavolo, appuntamento, ordine, informazioni...)
- Per tavoli: data, ora, numero persone, allergie, occasione speciale
- Per appuntamenti: tipo di servizio, data e ora preferita

Quando hai tutto, conferma con un riepilogo e digli che sarà ricontattato a breve.

Poi aggiungi alla fine su una riga separata (invisibile al cliente):
DATI_RACCOLTI:{"nome":"...","email":"...","richiesta":"...","servizio":"...","dataISO":"YYYY-MM-DD","oraISO":"HH:MM","coperti":0,"allergie":"...","occasione":"..."}

## REGOLE
- Scrivi sempre in italiano
- Sii caldo e professionale
- Non inventare informazioni sul locale`
}

export async function POST(req: Request) {
  const { messages, publicId } = await req.json()
  if (!publicId) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  const owner = await prisma.user.findUnique({ where: { publicId } })
  if (!owner) return NextResponse.json({ error: 'Attività non trovata' }, { status: 404 })

  const settings = {
    nomeLocale: owner.nomeLocale,
    descrizioneBot: owner.descrizioneBot,
    orariApertura: owner.orariApertura,
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: buildPublicSystemPrompt(settings),
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
        const leadEsistente = await prisma.lead.findFirst({
          where: { userId: owner.id, email: dati.email },
          orderBy: { createdAt: 'desc' },
        })
        const lead = leadEsistente ?? await prisma.lead.create({
          data: { userId: owner.id, name: dati.nome, email: dati.email, notes: dati.richiesta, status: 'nuovo' },
        })
        const richiestaEsistente = await prisma.preventivo.findFirst({
          where: { userId: owner.id, leadId: lead.id },
        })
        if (!richiestaEsistente) {
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
        }
        // Salva conversazione
        const allMessages = [...messages, { role: 'assistant', content: visibleText }]
        await prisma.conversazione.create({
          data: { userId: owner.id, canale: 'widget', messaggi: JSON.stringify(allMessages), clienteNome: dati.nome, clienteEmail: dati.email },
        })
      }
    } catch (e) { console.error('[PUBLIC CHAT] errore salvataggio:', e) }
  }

  return NextResponse.json({ text: visibleText })
}

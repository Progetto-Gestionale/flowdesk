import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
  fetchOptions: { agent: new (require('https').Agent)({ rejectUnauthorized: false }) },
})

interface BusinessSettings {
  nomeLocale?: string | null
  descrizioneBot?: string | null
  maxCoperti?: number | null
  orariApertura?: string | null
}

function buildSystemPrompt(
  slots: { data: Date | string; oraInizio: string; oraFine: string; durata: number }[],
  settings: BusinessSettings
) {
  const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const nomeLocale = settings.nomeLocale || 'questa attività'

  let descLocale = ''
  if (settings.descrizioneBot) {
    descLocale = `\n\nDESCRIZIONE DEL LOCALE:\n${settings.descrizioneBot}`
  }

  let orariInfo = ''
  if (settings.orariApertura) {
    try {
      const orari = JSON.parse(settings.orariApertura) as Record<string, string>
      const righeOrari = Object.entries(orari)
        .filter(([, v]) => v)
        .map(([g, v]) => `- ${g}: ${v}`)
      if (righeOrari.length > 0) {
        orariInfo = `\n\nORARI DI APERTURA:\n${righeOrari.join('\n')}`
      }
    } catch { /* ignora */ }
  }

  let slotInfo = ''
  if (slots.length > 0) {
    const righe = slots.map(s => {
      const d = new Date(s.data)
      const giorno = GIORNI[d.getDay()]
      const dataStr = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
      return `- ${giorno} ${dataStr}: ${s.oraInizio}–${s.oraFine} (${s.durata} min)`
    })
    slotInfo = `\n\nSLOT AGENDA DISPONIBILI:\n${righe.join('\n')}\nProponi questi slot solo per appuntamenti con orario fisso.`
  }

  return `Sei l'assistente virtuale di ${nomeLocale}. Il tuo obiettivo è raccogliere le informazioni necessarie per gestire la richiesta del cliente in modo naturale e conversazionale.

DATA DI OGGI: ${oggi}${descLocale}${orariInfo}${slotInfo}

## COME COMPORTARTI

Accogli il cliente calorosamente e inizia a raccogliere le informazioni. Fallo in modo naturale — non come un form, ma come una conversazione. Puoi raccogliere più info in un singolo messaggio, ma non essere robotico.

## INFORMAZIONI DA RACCOGLIERE SEMPRE
- Nome e cognome
- Email di contatto

## INFORMAZIONI AGGIUNTIVE PER TIPO DI RICHIESTA

**Se il cliente vuole prenotare un TAVOLO:**
- Data e ora desiderata
- Numero di persone (coperti)
- Allergie o intolleranze alimentari (chiedi sempre)
- Occasione speciale (compleanno, anniversario, lavoro — solo se non è chiaro)

**Se il cliente vuole un APPUNTAMENTO:**
- Tipo di servizio/motivo
- Data e ora preferita (proponi gli slot se disponibili)

**Se il cliente fa un ORDINE:**
- Cosa vuole ordinare e quantità
- Data/ora di consegna o ritiro (se rilevante)
- Eventuale indirizzo di consegna

**Se chiede un PREVENTIVO o CATERING:**
- Descrizione del servizio
- Data dell'evento
- Numero di persone (se rilevante)
- Budget indicativo (se si offre spontaneamente)

## QUANDO HAI RACCOLTO I DATI

Conferma tutto al cliente con un riepilogo chiaro, digli che sarà ricontattato a breve per conferma.

Poi aggiungi ALLA FINE, su una riga separata (non mostrarla al cliente):
DATI_RACCOLTI:{"nome":"...","email":"...","richiesta":"...","servizio":"...","dataISO":"YYYY-MM-DD","oraISO":"HH:MM","coperti":0,"allergie":"...","occasione":"..."}

Note sui campi JSON:
- "richiesta": descrizione completa di cosa vuole il cliente
- "servizio": titolo breve (es: "Prenotazione tavolo", "Visita dentistica")
- "dataISO": data in formato YYYY-MM-DD, "" se non specificata
- "oraISO": ora in formato HH:MM, "" se non specificata
- "coperti": numero persone come intero, 0 se non applicabile
- "allergie": eventuali allergie, "" se nessuna o non rilevante
- "occasione": occasione speciale, "" se non specificata

## REGOLE
- Scrivi sempre in italiano
- Sii caldo, professionale e conciso
- Non inventare informazioni
- Se l'orario richiesto è fuori dagli orari di apertura, avvisa gentilmente il cliente`
}

export async function POST(req: Request) {
  const { messages, ownerId } = await req.json()

  let slots: { data: Date; oraInizio: string; oraFine: string; durata: number }[] = []
  let settings: BusinessSettings = {}

  if (ownerId) {
    try {
      const owner = await prisma.user.findUnique({ where: { id: ownerId } })
      if (owner) {
        settings = {
          nomeLocale: owner.nomeLocale,
          descrizioneBot: owner.descrizioneBot,
          maxCoperti: owner.maxCoperti,
          orariApertura: owner.orariApertura,
        }
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
      if (owner) {
        settings = {
          nomeLocale: owner.nomeLocale,
          descrizioneBot: owner.descrizioneBot,
          maxCoperti: owner.maxCoperti,
          orariApertura: owner.orariApertura,
        }
      }
    } catch (e) { console.error('[CHAT] errore publicId settings:', e) }
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: buildSystemPrompt(slots, settings),
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

            const lead = leadEsistente ?? await prisma.lead.create({
              data: {
                userId: owner.id,
                name: dati.nome,
                email: dati.email,
                notes: dati.richiesta,
                status: 'nuovo',
              },
            })

            const richiestaEsistente = await prisma.preventivo.findFirst({
              where: { userId: owner.id, leadId: lead.id },
            })

            if (!richiestaEsistente) {
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

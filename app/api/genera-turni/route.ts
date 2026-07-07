import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const toMin = (h: string) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm }

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { settimana, requisiti, note } = await req.json()
  if (!settimana) return NextResponse.json({ error: 'settimana obbligatoria' }, { status: 400 })

  const lunedi = new Date(settimana)
  const domenica = new Date(lunedi)
  domenica.setDate(domenica.getDate() + 6)

  const dateSettimana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunedi)
    d.setDate(d.getDate() + i)
    return toISO(d)
  })

  const mesiCoinvolti = [...new Set(dateSettimana.map(d => d.substring(0, 7)))]
    .map(ym => new Date(`${ym}-01`))

  const dipendenti = await prisma.dipendente.findMany({
    where: { userId: user.id },
    include: {
      disponibilita: { where: { mese: { in: mesiCoinvolti } } },
      richieste: {
        where: {
          status: 'approvata',
          tipo: 'assenza',
          data: { lte: domenica },
          dataFine: { gte: lunedi },
        },
      },
    },
  })

  if (dipendenti.length === 0)
    return NextResponse.json({ error: 'Nessun dipendente trovato' }, { status: 400 })

  // Costruisci mappa disponibilità: dipendenteId -> Set<giorno index 0-6>
  const disponibilitaMap = new Map<string, Set<number>>()
  for (const d of dipendenti) {
    const giorni = new Set<number>()
    for (const disp of d.disponibilita) {
      try {
        for (const g of JSON.parse(disp.giorni)) {
          const idx = dateSettimana.indexOf(g.data)
          if (idx >= 0) giorni.add(idx)
        }
      } catch {}
    }
    disponibilitaMap.set(d.id, giorni)
  }

  // Mappa assenze approvate: dipendenteId -> [{dal, al}]
  const assenzeMap = new Map<string, { dal: string; al: string }[]>()
  for (const d of dipendenti) {
    assenzeMap.set(d.id, d.richieste.map(r => ({
      dal: r.data ? toISO(r.data) : '',
      al: r.dataFine ? toISO(r.dataFine) : '',
    })))
  }

  function isAssente(dipendenteId: string, data: string) {
    return (assenzeMap.get(dipendenteId) ?? []).some(a => a.dal <= data && data <= a.al)
  }

  const giornoStr = lunedi.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

  // L'AI decide solo QUALI slot servono (giorno, orario, ruolo, quante persone)
  // Il server assegnerà i dipendenti evitando sovrapposizioni
  const prompt = `Sei un assistente per la gestione del personale di un ristorante/locale.
Devi pianificare i turni per la settimana dal ${giornoStr}.

## Fabbisogno del titolare:
${requisiti && requisiti.length > 0
    ? requisiti.map((r: any) => `- ${GIORNI[r.giorno]}: ${r.persone} persona/e${r.ruolo ? ` (ruolo: ${r.ruolo})` : ''}, orario ${r.oraInizio}–${r.oraFine}`).join('\n')
    : 'Nessun requisito specifico — crea un turno standard per ogni giorno'}
${note ? `\nNote aggiuntive: ${note}` : ''}

## Date della settimana (giorno 0 = Lunedì):
${dateSettimana.map((d, i) => `- giorno ${i} (${GIORNI[i]}): ${d}`).join('\n')}

## Istruzioni:
Genera la lista degli slot di turno necessari. NON assegnare dipendenti — ci penserà il sistema.
Ogni slot rappresenta una fascia oraria in cui serve una persona.
Se servono 3 persone nello stesso turno, crea 3 slot identici.
Rispondi SOLO con JSON valido:

{
  "slots": [
    {
      "giorno": 0,
      "oraInizio": "09:00",
      "oraFine": "17:00",
      "ruolo": null,
      "note": null
    }
  ],
  "spiegazione": "Breve spiegazione in 2-3 frasi"
}`

  let text = ''
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    text = message.content[0].type === 'text' ? message.content[0].text : ''
  } catch (e: any) {
    console.error('[GENERA-TURNI] API error:', e)
    return NextResponse.json({ error: 'Errore nella chiamata AI: ' + (e.message ?? String(e)) }, { status: 500 })
  }

  let parsed: any
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? text)
  } catch {
    console.error('[GENERA-TURNI] Parse error, raw:', text)
    return NextResponse.json({ error: 'Errore nel parsing della risposta AI', raw: text }, { status: 500 })
  }

  const slots: any[] = parsed.slots ?? []
  if (!Array.isArray(slots)) {
    return NextResponse.json({ error: 'Risposta AI in formato non valido', raw: text }, { status: 500 })
  }

  // Assegna dipendenti slot per slot — il server garantisce no sovrapposizioni
  const assegnati: { dipendenteId: string; giorno: number; oraInizio: string; oraFine: string }[] = []
  const contatore = new Map<string, number>(dipendenti.map(d => [d.id, 0]))
  const turniFinali: any[] = []
  const carenze: string[] = []

  function haConflitto(dipendenteId: string, giorno: number, oraInizio: string, oraFine: string) {
    return assegnati.some(a =>
      a.dipendenteId === dipendenteId &&
      a.giorno === giorno &&
      toMin(a.oraInizio) < toMin(oraFine) &&
      toMin(oraInizio) < toMin(a.oraFine)
    )
  }

  for (const slot of slots) {
    const giorno: number = slot.giorno
    const oraInizio: string = slot.oraInizio
    const oraFine: string = slot.oraFine
    const ruoloRichiesto: string | null = slot.ruolo ?? null
    const data = dateSettimana[giorno] ?? dateSettimana[0]

    // Filtra candidati: disponibili quel giorno, non assenti, senza conflitti, ruolo corretto
    const candidati = dipendenti
      .filter(d => {
        if (isAssente(d.id, data)) return false
        if (!(disponibilitaMap.get(d.id) ?? new Set()).has(giorno)) return false
        if (haConflitto(d.id, giorno, oraInizio, oraFine)) return false
        if (ruoloRichiesto && d.ruolo && d.ruolo.toLowerCase() !== ruoloRichiesto.toLowerCase()) return false
        return true
      })
      .sort((a, b) => (contatore.get(a.id) ?? 0) - (contatore.get(b.id) ?? 0)) // equità

    if (candidati.length === 0) {
      carenze.push(`${GIORNI[giorno]} ${oraInizio}–${oraFine}: nessun dipendente disponibile${ruoloRichiesto ? ` (ruolo ${ruoloRichiesto})` : ''}`)
      continue
    }

    const d = candidati[0]
    assegnati.push({ dipendenteId: d.id, giorno, oraInizio, oraFine })
    contatore.set(d.id, (contatore.get(d.id) ?? 0) + 1)
    turniFinali.push({ dipendenteId: d.id, nome: d.nome, giorno, oraInizio, oraFine, ruolo: d.ruolo ?? null, note: slot.note ?? null, data })
  }

  const spiegazione = [
    parsed.spiegazione,
    carenze.length > 0 ? `⚠️ Turni scoperti:\n${carenze.map(c => `- ${c}`).join('\n')}` : ''
  ].filter(Boolean).join('\n\n')

  return NextResponse.json({ turni: turniFinali, spiegazione })
}

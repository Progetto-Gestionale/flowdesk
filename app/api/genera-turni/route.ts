import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { settimana, requisiti, note } = await req.json()
  if (!settimana) return NextResponse.json({ error: 'settimana obbligatoria' }, { status: 400 })

  const lunedi = new Date(settimana)
  const domenica = new Date(lunedi)
  domenica.setDate(domenica.getDate() + 6)

  // Date ISO dei 7 giorni della settimana
  const dateSettimana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunedi)
    d.setDate(d.getDate() + i)
    return toISO(d)
  })

  // Mesi coinvolti dalla settimana (può stare a cavallo di due mesi)
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

  const dipendentiInfo = dipendenti.map(d => {
    // Raccoglie tutti i GiornoDisponibile dei mesi coinvolti e filtra quelli della settimana
    const tuttiGiorni: { data: string; oraInizio?: string; oraFine?: string }[] = []
    for (const disp of d.disponibilita) {
      try { tuttiGiorni.push(...JSON.parse(disp.giorni)) } catch {}
    }
    const giorniSettimana = tuttiGiorni.filter(g => dateSettimana.includes(g.data))

    const assenze = d.richieste.map(r => ({
      dal: r.data ? toISO(r.data) : null,
      al: r.dataFine ? toISO(r.dataFine) : null,
    }))

    const dispStr = giorniSettimana.length > 0
      ? giorniSettimana.map(g => {
          const idx = dateSettimana.indexOf(g.data)
          const label = GIORNI[idx] ?? g.data
          return g.oraInizio ? `${label} ${g.oraInizio}–${g.oraFine}` : label
        }).join(', ')
      : 'Non ha inviato disponibilità per questa settimana (disponibile se strettamente necessario)'

    return {
      id: d.id,
      nome: d.nome,
      ruolo: d.ruolo || 'generico',
      disponibilita: dispStr,
      assenze: assenze.length > 0 ? assenze.map(a => `dal ${a.dal} al ${a.al}`).join(', ') : 'nessuna',
    }
  })

  const giornoStr = lunedi.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

  const prompt = `Sei un assistente per la gestione del personale di un ristorante/locale. Devi creare il piano turni per la settimana dal ${giornoStr}.

## Dipendenti:
${dipendentiInfo.map(d => `- **${d.nome}** (ruolo: ${d.ruolo})
  Disponibilità dichiarata: ${d.disponibilita}
  Assenze approvate: ${d.assenze}`).join('\n')}

## Fabbisogno del titolare:
${requisiti && requisiti.length > 0
  ? requisiti.map((r: any) => `- ${GIORNI[r.giorno]}: ${r.persone} persona/e${r.ruolo ? ` (ruolo: ${r.ruolo})` : ''}, orario ${r.oraInizio}–${r.oraFine}`).join('\n')
  : 'Nessun requisito specifico — distribuisci equamente il lavoro tra i disponibili'}
${note ? `\nNote aggiuntive: ${note}` : ''}

## Date della settimana (giorno 0 = Lunedì):
${dateSettimana.map((d, i) => `- giorno ${i} (${GIORNI[i]}): ${d}`).join('\n')}

## Istruzioni:
1. Rispetta le disponibilità dei dipendenti
2. Non assegnare turni in giornate con assenza approvata
3. Distribuisci i turni in modo equo
4. Se un dipendente non ha dichiarato disponibilità, assegnalo solo se strettamente necessario
5. **NON assegnare mai la stessa persona a due turni sovrapposti nello stesso giorno** — controlla gli orari e usa persone diverse per coprire turni contemporanei
6. Se non ci sono abbastanza dipendenti disponibili per coprire il fabbisogno, segnalalo nella spiegazione indicando quale giorno/fascia è scoperta e di quante persone manca
7. Assegna i dipendenti in base al loro ruolo quando specificato nel fabbisogno
8. Rispondi SOLO con JSON valido, senza testo aggiuntivo:

{
  "turni": [
    {
      "dipendenteId": "id_del_dipendente",
      "nome": "Nome Dipendente",
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

  if (!Array.isArray(parsed?.turni)) {
    return NextResponse.json({ error: 'Risposta AI in formato non valido', raw: text }, { status: 500 })
  }

  const turniConDate = parsed.turni.map((t: any) => ({
    ...t,
    data: dateSettimana[t.giorno] ?? dateSettimana[0],
  }))

  // Rimuovi turni sovrapposti sulla stessa persona nello stesso giorno
  const toMin = (h: string) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm }
  const turniPuliti: typeof turniConDate = []
  const carenze: string[] = []

  for (const t of turniConDate) {
    const conflitto = turniPuliti.find(p =>
      p.dipendenteId === t.dipendenteId &&
      p.giorno === t.giorno &&
      toMin(p.oraInizio) < toMin(t.oraFine) &&
      toMin(t.oraInizio) < toMin(p.oraFine)
    )
    if (conflitto) {
      carenze.push(`${GIORNI[t.giorno]} ${t.oraInizio}–${t.oraFine}: manca personale (${t.nome} già occupato)`)
    } else {
      turniPuliti.push(t)
    }
  }

  const spiegazione = [
    parsed.spiegazione,
    carenze.length > 0 ? `⚠️ Turni scoperti per mancanza di personale:\n${carenze.map(c => `- ${c}`).join('\n')}` : ''
  ].filter(Boolean).join('\n\n')

  return NextResponse.json({ turni: turniPuliti, spiegazione })
}

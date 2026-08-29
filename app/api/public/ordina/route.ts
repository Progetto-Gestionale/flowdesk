import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildNoteOrdine } from '@/lib/ordineDaPreventivo'
import { sendEmailRichiestaRicevuta } from '@/lib/email'
import { parseFasce, fasciaPerIndirizzo } from '@/lib/fasceConsegna'
import { distanzaKm } from '@/lib/geocode'
import { decrementaStock, StockError } from '@/lib/stock'

// Un ordine asporto/delivery dal menu pubblico NON entra più subito in cucina: diventa una RICHIESTA
// (Preventivo, come le prenotazioni tavolo) che il locale accetta/rifiuta/propone-modifiche. Solo
// all'accettazione viene creato l'Ordine vero. Al cliente parte la mail "richiesta ricevuta".
export async function POST(req: Request) {
 try {
  const { publicId, tipo, nome, cognome, email, telefono, data, ora, indirizzo, cap, lat, lon, righe, noteCliente } = await req.json()

  if (!publicId || !email || !nome || !data || !ora || !righe?.length) {
    return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Locale non trovato' }, { status: 404 })

  const isDelivery = tipo === 'delivery'

  if (isDelivery && user.blockDelivery) {
    return NextResponse.json({ error: 'Il servizio delivery non è al momento disponibile.' }, { status: 503 })
  }
  if (!isDelivery && user.blockAsporto) {
    return NextResponse.json({ error: 'Il servizio asporto non è al momento disponibile.' }, { status: 503 })
  }

  const totale = righe.reduce((s: number, r: { prezzo: number; quantita: number }) => s + r.prezzo * r.quantita, 0)
  const regole = (() => { try { return JSON.parse(user.regolePrenotazione ?? '{}') } catch { return {} } })()

  // Rete di sicurezza zona di consegna (il grosso è validato lato client col geocoding):
  if (isDelivery) {
    // 1) CAP servito
    const capServiti = String(regole.capConsegna ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
    if (capServiti.length > 0 && (!cap || !capServiti.includes(String(cap).trim()))) {
      return NextResponse.json({ error: 'Non consegniamo in questa zona (CAP non servito).' }, { status: 422 })
    }
    // 2) Fasce di consegna: la fascia si sceglie per km (linea d'aria) e/o CAP → ordine minimo.
    const fasce = parseFasce(regole)
    if (fasce.length > 0) {
      const hasCoords = typeof lat === 'number' && typeof lon === 'number' && regole.latLocale != null && regole.lonLocale != null
      const dist = hasCoords ? distanzaKm(regole.latLocale as number, regole.lonLocale as number, lat, lon) : null
      const fascia = fasciaPerIndirizzo(fasce, dist, cap)
      if (fascia) {
        if (fascia.ordineMinimo > 0 && totale < fascia.ordineMinimo) {
          return NextResponse.json({ error: `Ordine minimo per la tua zona: €${fascia.ordineMinimo.toFixed(2)}.` }, { status: 422 })
        }
      } else if (hasCoords) {
        // Distanza nota e nessuna fascia (km o CAP) copre → fuori zona con certezza.
        return NextResponse.json({ error: `Indirizzo fuori dalla zona di consegna (a circa ${(dist as number).toFixed(1)} km in linea d'aria).` }, { status: 422 })
      } else if (fasce.some(f => f.cap.length > 0)) {
        // Senza coordinate possiamo escludere solo tramite CAP: se ci sono fasce a CAP e nessuna copre → fuori zona.
        return NextResponse.json({ error: 'Non consegniamo in questa zona (CAP non coperto).' }, { status: 422 })
      }
      // Senza coordinate e con sole fasce a km: rete di sicurezza indulgente (il client ha già validato).
    }
  }

  const nomeCompleto = [nome, cognome].filter(Boolean).join(' ')

  // Lead: trova per email o crea (come per le prenotazioni tavolo)
  const leadEsistente = email
    ? await prisma.lead.findFirst({ where: { userId: user.id, email }, orderBy: { createdAt: 'desc' } })
    : null
  const lead = leadEsistente ?? await prisma.lead.create({
    data: {
      userId: user.id,
      name: nomeCompleto,
      email: email || `form-${Date.now()}@noemail.local`,
      phone: telefono || null,
      notes: `Ordine ${isDelivery ? 'delivery' : 'asporto'} via menu pubblico.`,
      status: 'nuovo',
    },
  })

  // Voci del carrello salvate negli items del preventivo; dati consegna nella nota (marker INFO).
  const items = righe.map((r: { piattoId?: string | null; nome: string; prezzo: number; quantita: number; note?: string | null }) => ({
    piattoId: r.piattoId ?? null, nome: r.nome, prezzo: r.prezzo, quantita: r.quantita, note: r.note ?? null,
  }))
  const note = buildNoteOrdine(
    { tipo: isDelivery ? 'delivery' : 'asporto', indirizzo: isDelivery ? (indirizzo || null) : null, cap: cap || null, telefono: telefono || null, lat: lat ?? null, lon: lon ?? null, noteCliente: noteCliente || null, email },
    data, ora,
  )

  const count = await prisma.preventivo.count({ where: { userId: user.id } })
  // Il counter dei piatti gestiti scala SUBITO (richiesta = prenotazione della porzione).
  // Se poi la richiesta viene rifiutata, le porzioni vengono riaccreditate (stockScalato).
  let preventivo
  try {
    preventivo = await prisma.$transaction(async (tx) => {
      await decrementaStock(tx, righe)
      return tx.preventivo.create({
        data: {
          userId: user.id,
          leadId: lead.id,
          numero: count + 1,
          tipo: isDelivery ? 'delivery' : 'asporto',
          clienteName: nomeCompleto,
          clienteEmail: email || null,
          items: JSON.stringify(items),
          totale,
          status: 'da_verificare',
          note,
          stockScalato: true,
        },
      })
    })
  } catch (e) {
    if (e instanceof StockError) {
      return NextResponse.json({ error: `Purtroppo è appena andato esaurito: ${e.esauriti.join(', ')}. Aggiorna il carrello e riprova.`, esauriti: e.esauriti }, { status: 409 })
    }
    throw e
  }

  // Conferma di RICEZIONE al cliente (non è ancora accettato).
  if (email) {
    await sendEmailRichiestaRicevuta({
      clienteEmail: email,
      clienteNome: nomeCompleto,
      nomeLocale: user.nomeLocale ?? 'Il locale',
      tipo: isDelivery ? 'delivery' : 'asporto',
      data, ora,
      indirizzo: isDelivery ? (indirizzo || null) : null,
      items, totale,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, numero: preventivo.numero })
 } catch (e) {
  console.error('[PUBLIC/ORDINA] errore:', e)
  return NextResponse.json({ error: "Non è stato possibile inviare la richiesta. Riprova tra poco; se persiste contatta il locale." }, { status: 500 })
 }
}

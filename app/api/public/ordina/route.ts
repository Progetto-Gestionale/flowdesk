import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildNoteOrdine } from '@/lib/ordineDaPreventivo'
import { sendEmailRichiestaRicevuta } from '@/lib/email'
import { parseFasce, fasciaPerDistanza } from '@/lib/fasceConsegna'
import { distanzaKm } from '@/lib/geocode'

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
    // 2) Fasce di consegna: distanza → fascia → ordine minimo (out-of-zone se oltre l'ultima fascia).
    const fasce = parseFasce(regole)
    if (fasce.length > 0 && typeof lat === 'number' && typeof lon === 'number' && regole.latLocale != null && regole.lonLocale != null) {
      const dist = distanzaKm(regole.latLocale, regole.lonLocale, lat, lon)
      const fascia = fasciaPerDistanza(fasce, dist)
      if (!fascia) {
        return NextResponse.json({ error: `Indirizzo fuori dalla zona di consegna (a circa ${dist.toFixed(1)} km).` }, { status: 422 })
      }
      if (fascia.ordineMinimo > 0 && totale < fascia.ordineMinimo) {
        return NextResponse.json({ error: `Ordine minimo per la tua zona: €${fascia.ordineMinimo.toFixed(2)}.` }, { status: 422 })
      }
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
  const preventivo = await prisma.preventivo.create({
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
    },
  })

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

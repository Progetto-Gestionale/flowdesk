import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const { publicId, tipo, nome, cognome, email, telefono, data, ora, indirizzo, righe, noteCliente } = await req.json()

  if (!publicId || !email || !nome || !data || !ora || !righe?.length) {
    return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Locale non trovato' }, { status: 404 })

  const nomeCompleto = [nome, cognome].filter(Boolean).join(' ')
  const totale = righe.reduce((s: number, r: { prezzo: number; quantita: number }) => s + r.prezzo * r.quantita, 0)
  const descrizioneItems = righe.map((r: { quantita: number; nome: string }) => `${r.quantita}× ${r.nome}`).join(', ')

  // Note strutturate come il chatbot (extractDatiEmail le leggerà)
  const noteParts = [
    `Canale: ${tipo === 'delivery' ? 'Delivery' : 'Ordine asporto'}.`,
    `DATA_ISO:${data}`,
    `ORA_ISO:${ora}`,
    telefono ? `Tel: ${telefono}.` : null,
    tipo === 'delivery' && indirizzo ? `Indirizzo: ${indirizzo}.` : null,
    noteCliente ? `Note cliente: ${noteCliente}.` : null,
  ].filter(Boolean).join(' ')

  // Trova o crea lead
  let lead = await prisma.lead.findFirst({
    where: { userId: user.id, email },
    orderBy: { createdAt: 'desc' },
  })
  if (!lead) {
    lead = await prisma.lead.create({
      data: { userId: user.id, name: nomeCompleto, email, status: 'nuovo' },
    })
  } else {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'nuovo', cancellato: false },
    })
  }

  const count = await prisma.preventivo.count({ where: { userId: user.id } })

  const preventivo = await prisma.preventivo.create({
    data: {
      userId: user.id,
      leadId: lead.id,
      numero: count + 1,
      tipo: tipo === 'delivery' ? 'delivery' : 'ordine',
      clienteName: nomeCompleto,
      clienteEmail: email,
      items: JSON.stringify([{
        descrizione: descrizioneItems,
        quantita: righe.reduce((s: number, r: { quantita: number }) => s + r.quantita, 0),
        prezzo: totale,
        righe,
      }]),
      totale,
      status: 'da_verificare',
      note: noteParts,
    },
  })

  return NextResponse.json({ ok: true, numero: preventivo.numero })
}

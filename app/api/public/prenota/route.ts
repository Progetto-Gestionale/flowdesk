import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const { publicId, nome, email, telefono, data, ora, persone, note, allergie } = await req.json()

  if (!publicId || !nome || !data || !ora || !persone) {
    return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Locale non trovato' }, { status: 404 })

  // Trova o crea Lead
  const leadEsistente = email
    ? await prisma.lead.findFirst({ where: { userId: user.id, email }, orderBy: { createdAt: 'desc' } })
    : null

  const lead = leadEsistente ?? await prisma.lead.create({
    data: {
      userId: user.id,
      name: nome,
      email: email || `form-${Date.now()}@noemail.local`,
      notes: `Prenotazione tavolo via form pubblico. ${persone} coperti il ${data} alle ${ora}.`,
      status: 'nuovo',
    },
  })

  const count = await prisma.preventivo.count({ where: { userId: user.id } })

  const dataISO = `${data}T${ora}:00`
  let noteStr = `Prenotazione tavolo via form pubblico. DATA_ISO:${dataISO} Coperti: ${persone}.`
  if (allergie) noteStr += ` Allergie: ${allergie}.`
  if (telefono) noteStr += ` Telefono: ${telefono}.`
  if (note) noteStr += ` Note: ${note}.`

  const itemArricchito = {
    descrizione: `Prenotazione tavolo — ${persone} coperti`,
    quantita: Number(persone),
    prezzo: 0,
    coperti: Number(persone),
    ...(allergie ? { allergie } : {}),
  }

  await prisma.preventivo.create({
    data: {
      userId: user.id,
      leadId: lead.id,
      numero: count + 1,
      tipo: 'tavolo',
      clienteName: nome,
      clienteEmail: email || null,
      items: JSON.stringify([itemArricchito]),
      totale: 0,
      status: 'da_verificare',
      note: noteStr,
    },
  })

  return NextResponse.json({ ok: true })
}

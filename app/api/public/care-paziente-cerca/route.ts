import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** "333 1234567" → "••• ••• 4567": abbastanza per riconoscersi, non per profilare. */
function mascheraTelefono(tel?: string | null): string | null {
  if (!tel) return null
  const cifre = tel.replace(/\D/g, '')
  if (cifre.length < 4) return null
  return `••• ••• ${cifre.slice(-4)}`
}

// POST /api/public/care-paziente-cerca  { publicId, email }
// Riconosce un paziente già in anagrafica dalla sua email, per non fargli
// reinserire i dati a ogni prenotazione.
//
// È un endpoint pubblico, quindi restituisce il minimo che serve al paziente per
// dire "sì sono io": nome e telefono mascherato. Mai email, indirizzi, note
// cliniche o storico — chi tira a indovinare indirizzi non deve ricavarne nulla.
// La prenotazione usa comunque i dati salvati a DB, non quelli che tornano di qui.
export async function POST(req: Request) {
  const { publicId, email } = await req.json()

  if (!publicId || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
  }

  const user = await prisma.user.findFirst({ where: { publicId }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const paziente = await prisma.paziente.findFirst({
    where: {
      userId: user.id,
      cancellato: false,
      email: { equals: email.trim(), mode: 'insensitive' },
    },
    select: { nome: true, telefono: true },
  })

  if (!paziente) return NextResponse.json({ trovato: false })

  return NextResponse.json({
    trovato: true,
    nome: paziente.nome,
    telefonoMascherato: mascheraTelefono(paziente.telefono),
  })
}

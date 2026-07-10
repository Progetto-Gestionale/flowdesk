import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmailAccessoDipendente } from '@/lib/email'
import { getAuthUser } from '@/lib/getAuthUser'

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { email, dipendenteId } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email obbligatoria' }, { status: 400 })

  const where = dipendenteId
    ? { id: dipendenteId, userId: user.id }
    : { email, userId: user.id }
  const dipendente = await prisma.dipendente.findFirst({ where })
  if (!dipendente) return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })

  if (!dipendente.username) {
    return NextResponse.json({ error: 'Credenziali non ancora impostate. Usa "Imposta accesso" prima.' }, { status: 400 })
  }

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const loginUrl = `${BASE_URL}/dipendente/login`

  await sendEmailAccessoDipendente(email, dipendente.nome, dipendente.username, loginUrl)

  return NextResponse.json({ ok: true })
}

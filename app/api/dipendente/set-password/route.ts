import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { getDipSession, signDipToken, dipCookieOptions } from '@/lib/dipendenteAuth'

// Dipendente cambia la propria password (primo accesso o volontario)
export async function POST(req: Request) {
  const session = await getDipSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { nuovaPassword } = await req.json()
  if (!nuovaPassword || nuovaPassword.length < 6) {
    return NextResponse.json({ error: 'La password deve avere almeno 6 caratteri' }, { status: 400 })
  }

  const hash = await bcrypt.hash(nuovaPassword, 10)
  await prisma.dipendente.update({
    where: { id: session.dipendenteId },
    data: { passwordHash: hash, mustChangePassword: false },
  })

  // Rinnova il token (mustChangePassword ora false)
  const token = await signDipToken({ dipendenteId: session.dipendenteId, userId: session.userId, slug: session.slug })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(dipCookieOptions(token))
  return res
}

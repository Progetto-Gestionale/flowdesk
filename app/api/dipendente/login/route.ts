import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { signDipToken, dipCookieOptions } from '@/lib/dipendenteAuth'

export async function POST(req: Request) {
  const { username, password, slug } = await req.json()
  if (!username || !password || !slug) {
    return NextResponse.json({ error: 'Credenziali mancanti' }, { status: 400 })
  }

  // Risolvi il locale dal slug (publicId)
  const locale = await prisma.user.findUnique({ where: { publicId: slug }, select: { id: true } })
  if (!locale) {
    return NextResponse.json({ error: 'Locale non trovato' }, { status: 404 })
  }

  const dip = await prisma.dipendente.findFirst({
    where: { username, userId: locale.id },
  })
  if (!dip || !dip.passwordHash) {
    return NextResponse.json({ error: 'Credenziali non valide' }, { status: 401 })
  }

  const ok = await bcrypt.compare(password, dip.passwordHash)
  if (!ok) {
    return NextResponse.json({ error: 'Credenziali non valide' }, { status: 401 })
  }

  const token = await signDipToken({ dipendenteId: dip.id, userId: dip.userId, slug })
  const res = NextResponse.json({
    ok: true,
    mustChangePassword: dip.mustChangePassword,
    nome: dip.nome,
  })
  res.cookies.set(dipCookieOptions(token))
  return res
}

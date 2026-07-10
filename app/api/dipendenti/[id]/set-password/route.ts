import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateUsername } from '@/lib/dipendenteAuth'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { id } = await params
    const { password } = await req.json()
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password troppo corta (min 6 caratteri)' }, { status: 400 })
    }

    const dip = await prisma.dipendente.findFirst({ where: { id, userId: user.id } })
    if (!dip) return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })

    const hash = await bcrypt.hash(password, 10)
    const username = dip.username ?? generateUsername(dip.nome)

    await prisma.dipendente.update({
      where: { id },
      data: { passwordHash: hash, username, mustChangePassword: true },
    })

    return NextResponse.json({ ok: true, username })
  } catch (err) {
    console.error('[set-password]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// GET autenticato — indica se è configurato un PIN cameriere (senza rivelarlo)
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  return NextResponse.json({ pinAttivo: !!user.camerierePin })
}

// POST autenticato — imposta o rimuove il PIN cameriere. body: { pin: string|null }
// pin vuoto/null → rimuove il PIN (accesso libero).
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { pin } = await req.json()
  const clean = typeof pin === 'string' ? pin.trim() : ''

  if (!clean) {
    await prisma.user.update({ where: { id: user.id }, data: { camerierePin: null } })
    return NextResponse.json({ ok: true, pinAttivo: false })
  }
  if (!/^\d{4,8}$/.test(clean)) {
    return NextResponse.json({ error: 'Il PIN deve essere da 4 a 8 cifre' }, { status: 400 })
  }
  const hash = await bcrypt.hash(clean, 10)
  await prisma.user.update({ where: { id: user.id }, data: { camerierePin: hash } })
  return NextResponse.json({ ok: true, pinAttivo: true })
}

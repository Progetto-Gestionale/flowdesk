import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// POST pubblico — verifica il PIN cameriere. body: { publicId, pin }
export async function POST(req: Request) {
  const { publicId, pin } = await req.json()
  if (!publicId) return NextResponse.json({ error: 'publicId mancante' }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { publicId },
    select: { camerierePin: true },
  })
  if (!user) return NextResponse.json({ error: 'Locale non trovato' }, { status: 404 })

  // Nessun PIN configurato → accesso libero
  if (!user.camerierePin) return NextResponse.json({ ok: true })

  const ok = typeof pin === 'string' && pin.length > 0 && await bcrypt.compare(pin, user.camerierePin)
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true })
}

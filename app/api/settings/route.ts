import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
  return NextResponse.json({
    nomeLocale: user.nomeLocale,
    descrizioneBot: user.descrizioneBot,
    maxCoperti: user.maxCoperti,
    orariApertura: user.orariApertura,
    publicId: user.publicId,
  })
}

export async function PATCH(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const data = await req.json()
  const allowed = ['nomeLocale', 'descrizioneBot', 'maxCoperti', 'orariApertura', 'publicId']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in data) update[key] = data[key]
  }

  // Verifica unicità publicId
  if (update.publicId) {
    const existing = await prisma.user.findUnique({ where: { publicId: update.publicId as string } })
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: 'Questo ID pubblico è già in uso' }, { status: 409 })
    }
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data: update })
  return NextResponse.json({ ok: true, user: updated })
}

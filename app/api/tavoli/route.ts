import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const tavoli = await prisma.tavolo.findMany({
    where: { userId: user.id },
    orderBy: { numero: 'asc' },
  })
  return NextResponse.json({ tavoli })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { numero, etichetta, posti, note } = await req.json()
  const tavolo = await prisma.tavolo.create({
    data: { userId: user.id, numero, etichetta: etichetta || null, posti: posti ?? 4, note: note || null },
  })
  return NextResponse.json({ tavolo })
}

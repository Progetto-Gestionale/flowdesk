import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const data = searchParams.get('data')
  const turnoId = searchParams.get('turnoId')

  const where: Record<string, unknown> = { userId: user.id }
  if (data) {
    where.data = data
    where.turnoId = turnoId ?? null
  }

  const gruppi = await prisma.gruppoTavoli.findMany({
    where,
    include: { tavoli: { select: { id: true, numero: true, etichetta: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ gruppi })
}

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { tavoliIds, data, turnoId } = await req.json()
  if (!Array.isArray(tavoliIds) || tavoliIds.length < 2)
    return NextResponse.json({ error: 'Servono almeno 2 tavoli' }, { status: 400 })

  const tavoli = await prisma.tavolo.findMany({
    where: { id: { in: tavoliIds }, userId: user.id },
    orderBy: { numero: 'asc' },
  })
  const label = tavoli.map(t => t.numero).join('+')

  const gruppo = await prisma.gruppoTavoli.create({
    data: {
      userId: user.id,
      label,
      data: data ?? null,
      turnoId: turnoId ?? null,
      tavoli: { connect: tavoliIds.map((id: string) => ({ id })) },
    },
    include: { tavoli: { select: { id: true, numero: true, etichetta: true } } },
  })
  return NextResponse.json({ gruppo })
}

import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const sedute = await prisma.seduta.findMany({
    where: { pazienteId: id, userId: user.id },
    orderBy: { data: 'desc' },
  })

  return NextResponse.json({ sedute })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const paziente = await prisma.paziente.findFirst({ where: { id, userId: user.id } })
  if (!paziente) return NextResponse.json({ error: 'Paziente non trovato' }, { status: 404 })

  const { data, tipo, note } = await req.json()

  const seduta = await prisma.seduta.create({
    data: {
      userId: user.id,
      pazienteId: id,
      data: data ? new Date(data) : new Date(),
      tipo,
      note,
    },
  })

  return NextResponse.json({ seduta })
}

import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const documenti = await prisma.documentoPaziente.findMany({
    where: { pazienteId: id, userId: user.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ documenti })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const paziente = await prisma.paziente.findFirst({ where: { id, userId: user.id } })
  if (!paziente) return NextResponse.json({ error: 'Paziente non trovato' }, { status: 404 })

  const { nome, url, tipo } = await req.json()
  if (!nome || !url) return NextResponse.json({ error: 'Nome e link richiesti' }, { status: 400 })

  const documento = await prisma.documentoPaziente.create({
    data: { userId: user.id, pazienteId: id, nome, url, tipo },
  })

  return NextResponse.json({ documento })
}

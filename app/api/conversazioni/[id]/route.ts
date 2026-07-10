import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const data = await req.json()
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  await prisma.conversazione.updateMany({ where: { id, userId: user.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  await prisma.conversazione.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

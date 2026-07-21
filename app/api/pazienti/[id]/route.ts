import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const paziente = await prisma.paziente.findFirst({ where: { id, userId: user.id } })
  if (!paziente) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  return NextResponse.json({ paziente })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const data = await req.json()
  if (data.dataNascita) data.dataNascita = new Date(data.dataNascita)
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const paziente = await prisma.paziente.updateMany({ where: { id, userId: user.id }, data })
  return NextResponse.json({ paziente })
}

// Soft-cancel: marca come cancellato senza eliminare
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const paziente = await prisma.paziente.findFirst({ where: { id, userId: user.id } })
  if (!paziente) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  await prisma.paziente.updateMany({ where: { id, userId: user.id }, data: { cancellato: true } })

  return NextResponse.json({ ok: true })
}

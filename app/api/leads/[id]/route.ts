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

  const lead = await prisma.lead.updateMany({ where: { id, userId: user.id }, data })
  return NextResponse.json({ lead })
}

// Soft-cancel: marca tutto come cancellato senza eliminare
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const lead = await prisma.lead.findFirst({ where: { id, userId: user.id } })
  if (!lead) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  await prisma.lead.updateMany({ where: { id, userId: user.id }, data: { cancellato: true } })
  await prisma.preventivo.updateMany({ where: { leadId: id, userId: user.id }, data: { status: 'cliente_eliminato' } })
  if (lead.email) {
    await prisma.appuntamento.updateMany({ where: { clienteEmail: lead.email, userId: user.id }, data: { status: 'cancellato' } })
  }

  return NextResponse.json({ ok: true })
}

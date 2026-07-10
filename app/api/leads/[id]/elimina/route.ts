import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const lead = await prisma.lead.findFirst({ where: { id, userId: user.id } })
  if (!lead) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  // Elimina preventivi, appuntamenti e lead
  await prisma.preventivo.deleteMany({ where: { leadId: id, userId: user.id } })
  if (lead.email) {
    await prisma.appuntamento.deleteMany({ where: { clienteEmail: lead.email, userId: user.id } })
  }
  await prisma.lead.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}

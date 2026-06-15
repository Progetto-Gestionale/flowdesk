import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const LEAD_STATUS_MAP: Record<string, string> = {
  inviato: 'proposta',
  accettato: 'chiuso',
  rifiutato: 'nuovo',
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const data = await req.json()
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  await prisma.preventivo.updateMany({ where: { id, userId: user.id }, data })

  // Sincronizza lo status del lead collegato
  if (data.status && LEAD_STATUS_MAP[data.status]) {
    const preventivo = await prisma.preventivo.findFirst({ where: { id, userId: user.id } })
    if (preventivo?.leadId) {
      await prisma.lead.updateMany({
        where: { id: preventivo.leadId, userId: user.id },
        data: { status: LEAD_STATUS_MAP[data.status] },
      })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  await prisma.preventivo.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

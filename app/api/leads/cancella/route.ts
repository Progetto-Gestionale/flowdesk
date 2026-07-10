import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Cancella (soft) il lead collegato a un'email o a un leadId
export async function POST(req: Request) {
  const user = await getAuthUser()
  const userId = user?.id
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const { email, leadId } = await req.json()

  if (leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, userId: user.id } })
    if (lead) {
      await prisma.lead.updateMany({ where: { id: leadId, userId: user.id }, data: { cancellato: true } })
      await prisma.preventivo.updateMany({ where: { leadId, userId: user.id }, data: { status: 'cliente_eliminato' } })
      if (lead.email) {
        await prisma.appuntamento.updateMany({ where: { clienteEmail: lead.email, userId: user.id }, data: { status: 'cancellato' } })
      }
    }
  } else if (email) {
    const leads = await prisma.lead.findMany({ where: { email, userId: user.id } })
    for (const lead of leads) {
      await prisma.lead.updateMany({ where: { id: lead.id, userId: user.id }, data: { cancellato: true } })
      await prisma.preventivo.updateMany({ where: { leadId: lead.id, userId: user.id }, data: { status: 'cliente_eliminato' } })
    }
    await prisma.appuntamento.updateMany({ where: { clienteEmail: email, userId: user.id }, data: { status: 'cancellato' } })
  }

  return NextResponse.json({ ok: true })
}

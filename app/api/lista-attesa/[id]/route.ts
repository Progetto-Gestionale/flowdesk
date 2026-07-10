import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const data = await req.json()

  const item = await prisma.listaAttesa.findFirst({ where: { id, userId: user.id } })
  if (!item) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  await prisma.listaAttesa.update({ where: { id }, data })

  // Propaga su preventivo e lead
  if (data.status === 'confermato' && item.preventivoId) {
    await prisma.preventivo.updateMany({ where: { id: item.preventivoId, userId: user.id }, data: { status: 'accettato' } })
    if (item.leadId) {
      await prisma.lead.updateMany({ where: { id: item.leadId, userId: user.id }, data: { status: 'chiuso', cancellato: false } })
    }
    // Crea appuntamento in calendario
    const dataOra = new Date(`${item.data.toISOString().split('T')[0]}T${item.ora}:00`)
    await prisma.appuntamento.create({
      data: {
        userId: user.id,
        clienteNome: item.clienteNome,
        clienteEmail: item.clienteEmail ?? undefined,
        data: dataOra,
        coperti: item.coperti,
        note: item.note ?? undefined,
        status: 'confermato',
      },
    })
  }
  if (data.status === 'cancellato' && item.preventivoId) {
    await prisma.preventivo.updateMany({ where: { id: item.preventivoId, userId: user.id }, data: { status: 'cliente_eliminato' } })
    if (item.leadId) {
      await prisma.lead.updateMany({ where: { id: item.leadId, userId: user.id }, data: { cancellato: true } })
    }
  }
  if (data.status === 'notificato' && item.preventivoId) {
    await prisma.preventivo.updateMany({ where: { id: item.preventivoId, userId: user.id }, data: { status: 'lista_attesa_contattato' } })
  }
  if (data.status === 'in_attesa' && item.preventivoId) {
    await prisma.preventivo.updateMany({ where: { id: item.preventivoId, userId: user.id }, data: { status: 'lista_attesa' } })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  await prisma.listaAttesa.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

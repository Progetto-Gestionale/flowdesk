import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  if ('status' in body) {
    data.status = body.status
    if (body.status === 'chiuso' || body.status === 'consegnato') data.closedAt = new Date()
  }
  if ('tavoloId' in body) data.tavoloId = body.tavoloId
  if ('tavolo' in body) data.tavolo = body.tavolo
  const ordine = await prisma.ordine.update({ where: { id }, data })
  return NextResponse.json({ ordine })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  await prisma.rigaOrdine.deleteMany({ where: { ordineId: id } })
  await prisma.ordine.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

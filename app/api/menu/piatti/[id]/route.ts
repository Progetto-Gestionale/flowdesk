import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const data = await req.json()
  if (data.prezzo) data.prezzo = parseFloat(data.prezzo)
  const piatto = await prisma.menuPiatto.update({ where: { id }, data })
  return NextResponse.json({ piatto })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  await prisma.menuPiatto.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

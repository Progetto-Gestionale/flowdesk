import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const data = await req.json()
  await prisma.dipendente.updateMany({ where: { id, userId: user.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  await prisma.turno.deleteMany({ where: { dipendenteId: id } })
  await prisma.richiestaDipendente.deleteMany({ where: { dipendenteId: id } })
  await prisma.disponibilitaDipendente.deleteMany({ where: { dipendenteId: id } })
  await prisma.dipendente.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

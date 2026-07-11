import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  await prisma.turno.updateMany({
    where: { id, userId: user.id },
    data: { oraInizio: body.oraInizio, oraFine: body.oraFine, ruolo: body.ruolo || null, note: body.note || null },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  await prisma.turno.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

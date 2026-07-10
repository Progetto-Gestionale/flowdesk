import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params

  const gruppo = await prisma.gruppoTavoli.findUnique({ where: { id }, include: { tavoli: true } })
  if (!gruppo || gruppo.userId !== user.id)
    return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  // Scollega tutti i tavoli dal gruppo
  await prisma.tavolo.updateMany({
    where: { gruppoId: id },
    data: { gruppoId: null },
  })
  await prisma.gruppoTavoli.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

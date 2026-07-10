import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const { status } = await req.json()
  const richiesta = await prisma.richiestaDipendente.findFirst({
    where: { id },
    include: { dipendente: true },
  })
  if (!richiesta || richiesta.dipendente.userId !== user.id)
    return NextResponse.json({ error: 'Non trovato' }, { status: 404 })
  await prisma.richiestaDipendente.update({ where: { id }, data: { status } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const richiesta = await prisma.richiestaDipendente.findFirst({
    where: { id },
    include: { dipendente: true },
  })
  if (!richiesta || richiesta.dipendente.userId !== user.id)
    return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  // Se era un'assenza approvata, elimina anche i turni nel periodo
  const tipiAssenza = ['assenza', 'malattia', 'permesso', 'ferie']
  if (richiesta.status === 'approvata' && tipiAssenza.includes(richiesta.tipo) && richiesta.data) {
    await prisma.turno.deleteMany({
      where: {
        dipendenteId: richiesta.dipendenteId,
        data: {
          gte: richiesta.data,
          lte: richiesta.dataFine ?? richiesta.data,
        },
      },
    })
  }

  await prisma.richiestaDipendente.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

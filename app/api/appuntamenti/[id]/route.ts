import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req)
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  // Gestione assegnazione tavoli (singolo o multiplo)
  if ('tavoliIds' in body) {
    const ids: string[] = body.tavoliIds ?? []
    let tavoloId: string | null = null
    let tavoliIdsJson: string = JSON.stringify(ids)

    if (ids.length === 1) {
      tavoloId = ids[0]
    }
    // Con 2+ tavoli non creiamo GruppoTavoli permanente:
    // la fusione vale solo per questo appuntamento/turno

    await prisma.appuntamento.update({
      where: { id },
      data: { tavoloId, tavoliIds: tavoliIdsJson },
    })
    return NextResponse.json({ ok: true })
  }

  // Aggiornamento generico (status, note, ecc.)
  const { tavoliIds: _ignored, ...data } = body

  if (data.tavoloId) {
    const corrente = await prisma.appuntamento.findFirst({ where: { id, userId: user.id } })
    if (corrente) {
      const fineNuovo = new Date(corrente.data.getTime() + corrente.durata * 60000)
      const conflitto = await prisma.appuntamento.findFirst({
        where: { userId: user.id, tavoloId: data.tavoloId, id: { not: id }, status: { notIn: ['cancellato'] }, data: { lt: fineNuovo } },
      })
      if (conflitto) {
        const fineConflitto = new Date(conflitto.data.getTime() + conflitto.durata * 60000)
        if (fineConflitto > corrente.data)
          return NextResponse.json({ error: 'Tavolo già occupato in questo orario', conflitto: true }, { status: 409 })
      }
    }
  }

  await prisma.appuntamento.updateMany({ where: { id, userId: user.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req)
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
  await prisma.appuntamento.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

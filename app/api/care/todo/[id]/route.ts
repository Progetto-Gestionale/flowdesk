import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const { testo, fatto } = await req.json()
  const data: Record<string, unknown> = {}
  if (typeof testo === 'string' && testo.trim()) data.testo = testo.trim()
  if (typeof fatto === 'boolean') {
    data.fatto = fatto
    // Il timer delle 24 ore parte da qui, e riparte da zero se la voce
    // viene rimessa fra le cose da fare
    data.fattoAt = fatto ? new Date() : null
  }

  await prisma.todo.updateMany({ where: { id, userId: user.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  await prisma.todo.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

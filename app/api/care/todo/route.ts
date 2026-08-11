import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ORE_VISIBILITA_FATTE } from '@/lib/todoConfig'

export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ todo: [] })

  // Le voci spuntate spariscono da sole dopo 24 ore: la pulizia avviene qui,
  // così l'utente le vede scomparire esattamente quando scadono e non serve un cron.
  const scadenza = new Date(Date.now() - ORE_VISIBILITA_FATTE * 60 * 60 * 1000)
  await prisma.todo.deleteMany({
    where: { userId: user.id, fatto: true, fattoAt: { lt: scadenza } },
  })

  const todo = await prisma.todo.findMany({
    where: { userId: user.id },
    orderBy: [{ fatto: 'asc' }, { ordine: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ todo })
}

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const { testo } = await req.json()
  if (!testo?.trim()) return NextResponse.json({ error: 'Testo richiesto' }, { status: 400 })

  const quante = await prisma.todo.count({ where: { userId: user.id } })
  const voce = await prisma.todo.create({
    data: { userId: user.id, testo: testo.trim(), ordine: quante },
  })

  return NextResponse.json({ todo: voce })
}

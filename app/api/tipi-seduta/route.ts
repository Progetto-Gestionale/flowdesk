import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ tipiSeduta: [] })

  const tipiSeduta = await prisma.tipoSeduta.findMany({
    where: { userId: user.id },
    orderBy: { ordine: 'asc' },
  })

  return NextResponse.json({ tipiSeduta })
}

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const { nome, descrizione, prezzo, durata } = await req.json()
  if (!nome) return NextResponse.json({ error: 'Nome richiesto' }, { status: 400 })

  const count = await prisma.tipoSeduta.count({ where: { userId: user.id } })

  const tipoSeduta = await prisma.tipoSeduta.create({
    data: {
      userId: user.id,
      nome,
      descrizione,
      prezzo: prezzo ?? 0,
      durata: durata ?? 45,
      ordine: count,
    },
  })

  return NextResponse.json({ tipoSeduta })
}

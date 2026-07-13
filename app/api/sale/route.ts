import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const sale = await prisma.sala.findMany({
    where: { userId: user.id },
    orderBy: { ordine: 'asc' },
    include: { _count: { select: { tavoli: true } } },
  })
  // Auto-crea sala di default se non esistono sale
  if (sale.length === 0) {
    const sala = await prisma.sala.create({
      data: { userId: user.id, nome: 'Sala principale', ordine: 0 },
      include: { _count: { select: { tavoli: true } } },
    })
    await prisma.tavolo.updateMany({ where: { userId: user.id, salaId: null }, data: { salaId: sala.id } })
    return NextResponse.json({ sale: [sala] })
  }
  // Se ci sono sale ma alcuni tavoli non hanno salaId, assegnali alla prima sala
  const firstSala = sale[0]
  const orphans = await prisma.tavolo.count({ where: { userId: user.id, salaId: null } })
  if (orphans > 0) {
    await prisma.tavolo.updateMany({ where: { userId: user.id, salaId: null }, data: { salaId: firstSala.id } })
    // Aggiorna il conteggio nella risposta
    const saleConCount = await prisma.sala.findMany({
      where: { userId: user.id },
      orderBy: { ordine: 'asc' },
      include: { _count: { select: { tavoli: true } } },
    })
    return NextResponse.json({ sale: saleConCount })
  }
  return NextResponse.json({ sale })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { nome } = await req.json()
  if (!nome) return NextResponse.json({ error: 'nome richiesto' }, { status: 400 })
  const count = await prisma.sala.count({ where: { userId: user.id } })
  const sala = await prisma.sala.create({
    data: { userId: user.id, nome, ordine: count },
    include: { _count: { select: { tavoli: true } } },
  })
  return NextResponse.json({ sala })
}

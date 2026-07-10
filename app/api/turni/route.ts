import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const url = new URL(req.url)
  const settimana = url.searchParams.get('settimana') // YYYY-MM-DD (lunedi)
  let where: Record<string, unknown> = { userId: user.id }
  if (settimana) {
    const inizio = new Date(settimana)
    const fine = new Date(settimana)
    fine.setDate(fine.getDate() + 7)
    where = { ...where, data: { gte: inizio, lt: fine } }
  }
  const turni = await prisma.turno.findMany({
    where,
    include: { dipendente: { select: { id: true, nome: true, ruolo: true } } },
    orderBy: { data: 'asc' },
  })
  return NextResponse.json({ turni })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { dipendenteId, data, oraInizio, oraFine, ruolo, note } = await req.json()
  if (!dipendenteId || !data || !oraInizio || !oraFine)
    return NextResponse.json({ error: 'Campi obbligatori mancanti' }, { status: 400 })
  const turno = await prisma.turno.create({
    data: { userId: user.id, dipendenteId, data: new Date(data), oraInizio, oraFine, ruolo, note },
    include: { dipendente: { select: { id: true, nome: true, ruolo: true } } },
  })
  return NextResponse.json({ turno })
}

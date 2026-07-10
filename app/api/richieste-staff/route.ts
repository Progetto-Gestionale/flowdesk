import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const richieste = await prisma.richiestaDipendente.findMany({
    where: { dipendente: { userId: user.id } },
    include: { dipendente: { select: { id: true, nome: true, ruolo: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ richieste })
}

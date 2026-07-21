import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/public/care-tipi-seduta?publicId=xxx
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const publicId = searchParams.get('publicId')
  if (!publicId) return NextResponse.json({ error: 'Parametro mancante' }, { status: 400 })

  const user = await prisma.user.findFirst({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const tipiSeduta = await prisma.tipoSeduta.findMany({
    where: { userId: user.id, attivo: true },
    orderBy: { ordine: 'asc' },
    select: { id: true, nome: true, descrizione: true, prezzo: true, durata: true },
  })

  return NextResponse.json({ nomeLocale: user.nomeLocale, tipiSeduta })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const solo_oggi = searchParams.get('oggi') === '1'
  let dal: Date
  if (solo_oggi) {
    // cutoff serata: oggi alle 04:00 UTC (o ieri alle 04:00 se siamo prima delle 04:00)
    dal = new Date()
    dal.setUTCHours(4, 0, 0, 0)
    if (new Date().getUTCHours() < 4) dal.setUTCDate(dal.getUTCDate() - 1)
  } else {
    const giorni = parseInt(searchParams.get('giorni') ?? '90')
    dal = new Date()
    dal.setDate(dal.getDate() - giorni)
  }

  const ordini = await prisma.ordine.findMany({
    where: { userId: user.id, createdAt: { gte: dal } },
    include: { righe: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ ordini })
}

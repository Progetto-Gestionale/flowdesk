import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const giorni = parseInt(searchParams.get('giorni') ?? '90')
  const dal = new Date()
  dal.setDate(dal.getDate() - giorni)

  const ordini = await prisma.ordine.findMany({
    where: { userId: user.id, createdAt: { gte: dal } },
    include: { righe: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ ordini })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

function getServiceWindowStart(): Date {
  const CUTOFF_HOUR = 4 // 4am UTC
  const now = new Date()
  const start = new Date(now)
  if (now.getUTCHours() < CUTOFF_HOUR) {
    start.setUTCDate(start.getUTCDate() - 1)
  }
  start.setUTCHours(CUTOFF_HOUR, 0, 0, 0)
  return start
}

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const stato = searchParams.get('stato') // 'aperto' | 'chiuso' | null (= tutti oggi)

  const serviceStart = getServiceWindowStart()

  const where: Record<string, unknown> = { userId: user.id, createdAt: { gte: serviceStart } }
  if (stato) where.status = stato

  const ordini = await prisma.ordine.findMany({
    where,
    include: { righe: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ ordini })
}

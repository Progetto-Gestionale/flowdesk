import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/disponibilita-override?da=YYYY-MM-DD&a=YYYY-MM-DD
export async function GET(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ override: [] })

  const { searchParams } = new URL(req.url)
  const da = searchParams.get('da')
  const a = searchParams.get('a')

  const override = await prisma.disponibilitaOverride.findMany({
    where: {
      userId: user.id,
      ...(da && a ? { data: { gte: new Date(`${da}T00:00:00Z`), lte: new Date(`${a}T23:59:59Z`) } } : {}),
    },
  })

  return NextResponse.json({ override })
}

// POST { data: 'YYYY-MM-DD', slots: ['08:00-14:00', ...] }  — upsert
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const { data, slots } = await req.json()
  if (!data) return NextResponse.json({ error: 'Data richiesta' }, { status: 400 })

  const dataDate = new Date(`${data}T00:00:00Z`)

  const override = await prisma.disponibilitaOverride.upsert({
    where: { userId_data: { userId: user.id, data: dataDate } },
    update: { slots: JSON.stringify(slots ?? []) },
    create: { userId: user.id, data: dataDate, slots: JSON.stringify(slots ?? []) },
  })

  return NextResponse.json({ override })
}

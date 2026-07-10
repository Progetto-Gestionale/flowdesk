import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const url = new URL(req.url)
  const settimana = url.searchParams.get('settimana')
  if (!settimana) return NextResponse.json({ error: 'settimana obbligatoria' }, { status: 400 })

  const record = await prisma.requisitiTurni.findUnique({
    where: { userId_settimana: { userId: user.id, settimana: new Date(settimana) } },
  })
  return NextResponse.json({ requisiti: record ? JSON.parse(record.requisiti) : [] })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { settimana, requisiti } = await req.json()

  const record = await prisma.requisitiTurni.upsert({
    where: { userId_settimana: { userId: user.id, settimana: new Date(settimana) } },
    update: { requisiti: JSON.stringify(requisiti) },
    create: { userId: user.id, settimana: new Date(settimana), requisiti: JSON.stringify(requisiti) },
  })
  return NextResponse.json({ record })
}

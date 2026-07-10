import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  return NextResponse.json({ blockAsporto: user.blockAsporto, blockDelivery: user.blockDelivery })
}

export async function PATCH(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const body = await req.json()
  const data: Record<string, boolean> = {}
  if (typeof body.blockAsporto === 'boolean') data.blockAsporto = body.blockAsporto
  if (typeof body.blockDelivery === 'boolean') data.blockDelivery = body.blockDelivery
  await prisma.user.update({ where: { id: user.id }, data })
  return NextResponse.json({ ok: true })
}

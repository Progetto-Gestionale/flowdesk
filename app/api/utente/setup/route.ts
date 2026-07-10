import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { verticale } = await req.json()
  if (verticale !== 'food' && verticale !== 'care') {
    return NextResponse.json({ error: 'Verticale non valida' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { verticale },
  })

  return NextResponse.json({ ok: true, verticale })
}

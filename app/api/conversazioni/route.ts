import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await getAuthUser()
  const userId = user?.id
  if (!user) return NextResponse.json({ conversazioni: [] })

  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')

  const conversazioni = await prisma.conversazione.findMany({
    where: { userId: user.id, ...(email ? { clienteEmail: email } : {}) },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ conversazioni })
}

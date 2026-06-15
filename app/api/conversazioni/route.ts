import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ conversazioni: [] })

  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')

  const conversazioni = await prisma.conversazione.findMany({
    where: { userId: user.id, ...(email ? { clienteEmail: email } : {}) },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ conversazioni })
}

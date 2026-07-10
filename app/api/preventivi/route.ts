import { currentUser } from '@clerk/nextjs/server'
import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function getOrCreateUser(clerkId: string) {
  let user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) {
    const clerkUser = await currentUser()
    user = await prisma.user.create({
      data: {
        clerkId,
        email: clerkUser?.emailAddresses[0]?.emailAddress,
        name: clerkUser?.fullName ?? clerkUser?.firstName ?? '',
        plan: 'trial',
      },
    })
  }
  return user
}

export async function GET(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await getOrCreateUser(userId)
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('leadId')

  const preventivi = await prisma.preventivo.findMany({
    where: { userId: user.id, ...(leadId ? { leadId } : {}) },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ preventivi })
}

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await getOrCreateUser(userId)
  const { clienteName, clienteEmail, items, note } = await req.json()

  const count = await prisma.preventivo.count({ where: { userId: user.id } })
  const totale = items.reduce((sum: number, i: { quantita: number; prezzo: number }) => sum + i.quantita * i.prezzo, 0)

  const preventivo = await prisma.preventivo.create({
    data: {
      userId: user.id,
      numero: count + 1,
      clienteName,
      clienteEmail,
      items: JSON.stringify(items),
      totale,
      note,
    },
  })

  return NextResponse.json({ preventivo })
}

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

  const url = new URL(req.url)
  const includeCancellati = url.searchParams.get('include_cancellati') === 'true'

  const leads = await prisma.lead.findMany({
    where: { userId: user.id, ...(includeCancellati ? {} : { cancellato: false }) },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ leads })
}

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await getOrCreateUser(userId)

  const { name, email, phone, notes } = await req.json()
  if (!name) return NextResponse.json({ error: 'Nome richiesto' }, { status: 400 })

  const lead = await prisma.lead.create({
    data: { userId: user.id, name, email, phone, notes },
  })

  return NextResponse.json({ lead })
}

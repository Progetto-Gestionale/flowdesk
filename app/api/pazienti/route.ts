import { currentUser } from '@clerk/nextjs/server'
import { getAuthUserId } from '@/lib/getAuthUser'
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
        verticale: 'care',
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

  const pazienti = await prisma.paziente.findMany({
    where: { userId: user.id, ...(includeCancellati ? {} : { cancellato: false }) },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { sedute: true } } },
  })

  return NextResponse.json({ pazienti })
}

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await getOrCreateUser(userId)

  const { nome, email, telefono, dataNascita, note } = await req.json()
  if (!nome) return NextResponse.json({ error: 'Nome richiesto' }, { status: 400 })

  const paziente = await prisma.paziente.create({
    data: {
      userId: user.id,
      nome,
      email,
      telefono,
      note,
      dataNascita: dataNascita ? new Date(dataNascita) : null,
    },
  })

  return NextResponse.json({ paziente })
}

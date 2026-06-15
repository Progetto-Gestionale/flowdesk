import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function getOrCreateUser(clerkId: string) {
  let user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) {
    const clerkUser = await currentUser()
    user = await prisma.user.create({
      data: { clerkId, email: clerkUser?.emailAddresses[0]?.emailAddress, name: clerkUser?.fullName ?? '', plan: 'trial' },
    })
  }
  return user
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const user = await getOrCreateUser(userId)
  const appuntamenti = await prisma.appuntamento.findMany({
    where: { userId: user.id },
    orderBy: { data: 'asc' },
  })
  return NextResponse.json({ appuntamenti })
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const user = await getOrCreateUser(userId)
  const { clienteNome, clienteEmail, servizio, data, durata, note, coperti, allergie, occasione } = await req.json()
  const appuntamento = await prisma.appuntamento.create({
    data: { userId: user.id, clienteNome, clienteEmail, servizio, data: new Date(data), durata: durata ?? 60, note, coperti: coperti ?? 1, allergie: allergie || null, occasione: occasione || null },
  })
  return NextResponse.json({ appuntamento })
}

import { currentUser } from '@clerk/nextjs/server'
import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
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

export async function GET(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const user = await getOrCreateUser(userId)
  const slots = await prisma.slotDisponibile.findMany({
    where: { userId: user.id },
    orderBy: [{ data: 'asc' }, { oraInizio: 'asc' }],
  })
  return NextResponse.json({ slots })
}

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const user = await getOrCreateUser(userId)
  const { data, oraInizio, oraFine, durata } = await req.json()
  const slot = await prisma.slotDisponibile.create({
    data: { userId: user.id, data: new Date(data), oraInizio, oraFine, durata: durata ?? 60 },
  })
  return NextResponse.json({ slot })
}

export async function DELETE(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const user = await getOrCreateUser(userId)
  const { id } = await req.json()
  await prisma.slotDisponibile.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

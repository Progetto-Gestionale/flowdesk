import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentUser } from '@clerk/nextjs/server'

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
  const userId = await getAuthUserId(req)
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const user = await getOrCreateUser(userId)
  const appuntamenti = await prisma.appuntamento.findMany({
    where: { userId: user.id },
    orderBy: { data: 'asc' },
  })
  return NextResponse.json({ appuntamenti })
}

export async function POST(req: Request) {
  const userId = await getAuthUserId(req)
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const user = await getOrCreateUser(userId)
  const { clienteNome, clienteEmail, servizio, data, durata, note, coperti, allergie, occasione, tavoloId } = await req.json()
  const dataObj = new Date(data)
  const durataMin = durata ?? 60

  if (tavoloId) {
    const fineNuovo = new Date(dataObj.getTime() + durataMin * 60000)
    const conflitto = await prisma.appuntamento.findFirst({
      where: { userId: user.id, tavoloId, status: { notIn: ['cancellato'] }, data: { lt: fineNuovo } },
    })
    if (conflitto) {
      const fineConflitto = new Date(conflitto.data.getTime() + conflitto.durata * 60000)
      if (fineConflitto > dataObj) {
        return NextResponse.json({ error: 'Tavolo già occupato in questo orario', conflitto: true }, { status: 409 })
      }
    }
  }

  const appuntamento = await prisma.appuntamento.create({
    data: { userId: user.id, clienteNome, clienteEmail, servizio, data: dataObj, durata: durataMin, note, coperti: coperti ?? 1, allergie: allergie || null, occasione: occasione || null, tavoloId: tavoloId || null },
  })
  return NextResponse.json({ appuntamento })
}

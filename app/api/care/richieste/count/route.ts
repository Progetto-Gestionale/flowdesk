import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { STATUS_IN_ATTESA } from '@/lib/careRichiesta'

// Quante richieste aspettano ancora una risposta: alimenta il pallino giallo
// sulla voce Richieste della sidebar e sulla campanella.
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ daVerificare: 0 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ daVerificare: 0 })

  const daVerificare = await prisma.appuntamento.count({
    where: { userId: user.id, status: STATUS_IN_ATTESA },
  })

  return NextResponse.json({ daVerificare })
}

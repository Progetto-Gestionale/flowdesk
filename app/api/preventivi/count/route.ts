import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ daVerificare: 0 })
  const count = await prisma.preventivo.count({ where: { userId: user.id, status: 'da_verificare' } })
  return NextResponse.json({ daVerificare: count })
}

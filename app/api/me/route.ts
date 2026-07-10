import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { publicId: true, turniServizio: true } })
  return NextResponse.json({ user: dbUser })
}

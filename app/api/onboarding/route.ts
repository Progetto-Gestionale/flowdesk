import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const clerkUser = await currentUser()
  const { name, niche, objectives, modules } = await req.json()

  await prisma.user.upsert({
    where: { clerkId: userId },
    update: { name, niche, objectives: JSON.stringify(objectives) },
    create: {
      clerkId: userId,
      email: clerkUser?.emailAddresses[0]?.emailAddress,
      name,
      niche,
      objectives: JSON.stringify(objectives),
    },
  })

  return NextResponse.json({ ok: true })
}

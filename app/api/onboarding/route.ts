import { currentUser } from '@clerk/nextjs/server'
import { getAuthUserId } from '@/lib/getAuthUser'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const clerkUser = await currentUser()
  const { name, niche, objectives, modules } = await req.json()

  // Verticale scelta in fase di iscrizione (cookie impostato dalla landing /food o /care).
  // La impostiamo SOLO alla creazione: la verticale di un utente esistente non cambia mai.
  const cookieStore = await cookies()
  const verticale = cookieStore.get('verticale_pending')?.value === 'care' ? 'care' : 'food'

  await prisma.user.upsert({
    where: { clerkId: userId },
    update: { name, niche, objectives: JSON.stringify(objectives) },
    create: {
      clerkId: userId,
      email: clerkUser?.emailAddresses[0]?.emailAddress,
      name,
      niche,
      objectives: JSON.stringify(objectives),
      verticale,
    },
  })

  return NextResponse.json({ ok: true })
}

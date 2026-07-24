import { auth, currentUser } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export default async function DashboardCheck() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })

  // Utente GIÀ registrato → sempre dritto al SUO dashboard.
  // La verticale non viene mai cambiata qui: chi è già iscritto a food/care resta lì
  // (anche se fosse rimasto un cookie verticale_pending da una visita all'altra landing).
  // Copre anche il caso "mi registro con un account già registrato" → entra nel suo dashboard.
  if (user) {
    redirect(user.verticale === 'care' ? '/care/dashboard' : '/food/dashboard')
  }

  // Nuovo utente (nessun record DB) → creiamo il record con la verticale scelta in fase
  // di iscrizione e andiamo DRITTI al dashboard, senza domande di onboarding.
  const clerkUser = await currentUser()
  const cookieStore = await cookies()
  const verticalePending = cookieStore.get('verticale_pending')?.value as 'food' | 'care' | undefined
  const verticale: 'food' | 'care' = verticalePending === 'care' ? 'care' : 'food'

  await prisma.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: {
      clerkId: userId,
      email: clerkUser?.emailAddresses[0]?.emailAddress,
      name: clerkUser?.fullName ?? clerkUser?.firstName ?? '',
      plan: 'trial',
      verticale,
    },
  })
  redirect(verticale === 'care' ? '/care/dashboard' : '/food/dashboard')
}

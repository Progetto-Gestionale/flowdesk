import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export default async function DashboardCheck() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const clerkUser = await currentUser()
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })

  // Solo i nuovi utenti (non ancora nel DB) vanno all'onboarding
  if (!user) {
    const createdAt = clerkUser?.createdAt ?? 0
    const isNew = Date.now() - createdAt < 5 * 60 * 1000 // registrato negli ultimi 5 minuti

    if (isNew) redirect('/onboarding')

    // Utente esistente su Clerk ma non nel DB → crea profilo base e manda alla dashboard
    await prisma.user.create({
      data: {
        clerkId: userId!,
        email: clerkUser?.emailAddresses[0]?.emailAddress,
        name: clerkUser?.fullName ?? clerkUser?.firstName ?? '',
        plan: 'trial',
      },
    })
  }

  redirect('/dashboard')
}

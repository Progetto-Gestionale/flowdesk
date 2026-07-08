import { auth, currentUser } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export default async function DashboardCheck() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const clerkUser = await currentUser()
  const cookieStore = await cookies()
  const verticalePending = cookieStore.get('verticale_pending')?.value as 'food' | 'care' | undefined

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })

  if (!user) {
    const createdAt = clerkUser?.createdAt ?? 0
    const isNew = Date.now() - createdAt < 5 * 60 * 1000

    if (isNew) redirect('/onboarding')

    await prisma.user.create({
      data: {
        clerkId: userId!,
        email: clerkUser?.emailAddresses[0]?.emailAddress,
        name: clerkUser?.fullName ?? clerkUser?.firstName ?? '',
        plan: 'trial',
        ...(verticalePending ? { verticale: verticalePending } : {}),
      },
    })
  } else if (verticalePending) {
    await prisma.user.update({
      where: { clerkId: userId! },
      data: { verticale: verticalePending },
    })
  }

  redirect('/dashboard')
}

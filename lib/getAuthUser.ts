import { auth } from '@clerk/nextjs/server'
import { prisma } from './prisma'

export async function getAuthUserId(): Promise<string | null> {
  try {
    const { userId } = await auth()
    return userId ?? null
  } catch {
    return null
  }
}

export async function getAuthUser() {
  const userId = await getAuthUserId()
  if (!userId) return null
  return prisma.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId },
  })
}

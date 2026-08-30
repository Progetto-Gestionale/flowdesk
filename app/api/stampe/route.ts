import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'
import { ristampaJob } from '@/lib/print/enqueue'

// Coda di stampa: ultimi job del locale + ristampa (riaccoda un job con il transport attivo).
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const jobs = await prisma.printJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { stampante: { select: { nome: true } } },
  })
  return NextResponse.json({ jobs })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { jobId } = await req.json()
  if (!jobId) return NextResponse.json({ error: 'jobId richiesto' }, { status: 400 })
  const ok = await ristampaJob(jobId, user.id)
  if (!ok) return NextResponse.json({ error: 'Ristampa non riuscita' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

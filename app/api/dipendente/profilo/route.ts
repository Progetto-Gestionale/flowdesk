import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDipSession } from '@/lib/dipendenteAuth'

export async function GET() {
  const session = await getDipSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const dipendente = await prisma.dipendente.findUnique({
    where: { id: session.dipendenteId },
    include: {
      turni: { orderBy: { data: 'asc' } },
      richieste: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!dipendente) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  return NextResponse.json({ dipendente, slug: session.slug ?? null })
}

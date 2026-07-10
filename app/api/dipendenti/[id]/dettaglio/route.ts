import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { id } = await params

    const dip = await prisma.dipendente.findFirst({
      where: { id, userId: user.id },
      include: {
        turni: { orderBy: { data: 'desc' }, take: 50 },
        richieste: { orderBy: { createdAt: 'desc' } },
        timbrature: { orderBy: { timestamp: 'desc' }, take: 100 },
        disponibilita: true,
      },
    })

    if (!dip) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

    return NextResponse.json({ dip })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

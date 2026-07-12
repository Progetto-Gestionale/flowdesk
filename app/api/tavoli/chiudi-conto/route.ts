import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// POST — chiude il conto aperto per un tavolo/gruppo e scioglie la fusione
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { tavoloId, gruppoId } = await req.json()
  if (!tavoloId && !gruppoId) return NextResponse.json({ error: 'tavoloId o gruppoId richiesti' }, { status: 400 })

  // Trova tutti i conti aperti per questo tavolo/gruppo
  const where = gruppoId
    ? { userId: user.id, gruppoId, status: 'aperto' }
    : { userId: user.id, tavoloId, gruppoId: null, status: 'aperto' }

  await prisma.ordine.updateMany({ where, data: { status: 'chiuso' } })

  // Scioglie il gruppo se presente
  if (gruppoId) {
    await prisma.gruppoTavoli.deleteMany({ where: { id: gruppoId, userId: user.id } })
  }

  return NextResponse.json({ ok: true })
}

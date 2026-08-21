import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// POST — riordina le categorie. body: { ids: string[] } nell'ordine desiderato.
// Assegna ordine = indice, solo alle categorie del titolare (filtro su userId).
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { ids } = await req.json()
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids mancante' }, { status: 400 })

  await prisma.$transaction(
    ids.map((id: string, i: number) =>
      prisma.menuCategoria.updateMany({ where: { id, userId: user.id }, data: { ordine: i } })
    )
  )

  return NextResponse.json({ ok: true })
}

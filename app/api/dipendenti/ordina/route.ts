import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST — riordina i dipendenti. body: { ids: string[] } nell'ordine di visualizzazione desiderato.
// Assegna ordine = indice, solo ai dipendenti che appartengono al titolare (filtro su userId).
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { ids } = await req.json()
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids mancante' }, { status: 400 })

  await prisma.$transaction(
    ids.map((id: string, i: number) =>
      prisma.dipendente.updateMany({ where: { id, userId: user.id }, data: { ordine: i } })
    )
  )

  return NextResponse.json({ ok: true })
}

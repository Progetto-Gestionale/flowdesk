import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// POST — segna "notato" più ordini insieme (usato dalla mappa Tavoli all'apertura di un conto).
// body: { ids: string[], campo: 'notatoNuovo' | 'notatoPronto' }
// L'acknowledgment è cross-dispositivo: gli altri schermi si allineano al prossimo polling.
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { ids, campo } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'ids mancante' }, { status: 400 })
  if (campo !== 'notatoNuovo' && campo !== 'notatoPronto') return NextResponse.json({ error: 'campo non valido' }, { status: 400 })

  await prisma.ordine.updateMany({
    where: { id: { in: ids }, userId: user.id }, // solo ordini del titolare
    data: { [campo]: true },
  })

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDipSession } from '@/lib/dipendenteAuth'

// Ordini delivery pronti da consegnare, per il ristorante del dipendente
export async function GET() {
  const session = await getDipSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const ordini = await prisma.ordine.findMany({
    where: { userId: session.userId, tipo: 'delivery', status: 'pronto' },
    include: { righe: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ ordini })
}

// Il fattorino segna un ordine come consegnato
export async function PATCH(req: Request) {
  const session = await getDipSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Id mancante' }, { status: 400 })

  // updateMany con scope su userId + tipo: aggiorna solo se l'ordine è di questo ristorante
  const res = await prisma.ordine.updateMany({
    where: { id, userId: session.userId, tipo: 'delivery' },
    data: { status: 'consegnato' },
  })
  if (res.count === 0) return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404 })

  return NextResponse.json({ ok: true })
}

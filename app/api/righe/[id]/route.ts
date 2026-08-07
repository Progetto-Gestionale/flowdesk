import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// PATCH — segna una singola voce del conto (RigaOrdine) come pagata / non pagata.
// È un aiuto cassa per dividere il conto per piatto: non cambia il totale dell'ordine.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  // Verifica che la riga appartenga a un ordine dell'utente loggato.
  const riga = await prisma.rigaOrdine.findUnique({ where: { id }, include: { ordine: true } })
  if (!riga || riga.ordine.userId !== user.id) {
    return NextResponse.json({ error: 'Non trovato' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if ('pagata' in body) data.pagata = !!body.pagata
  // quantitaPagata: unità pagate della voce, limitato tra 0 e la quantità della riga.
  if ('quantitaPagata' in body) {
    const n = Math.floor(Number(body.quantitaPagata))
    data.quantitaPagata = Math.max(0, Math.min(riga.quantita, Number.isFinite(n) ? n : 0))
  }

  const aggiornata = await prisma.rigaOrdine.update({ where: { id }, data })
  return NextResponse.json({ riga: aggiornata })
}

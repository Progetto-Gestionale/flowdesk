import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  // Coursing: marca pronta (o annulla) una singola mandata dell'ordine.
  // { mandataPronta: N } → segna prontaAt su tutte le righe con mandata N.
  // { mandataPronta: N, annulla: true } → azzera prontaAt (ripristina la mandata).
  // Se dopo l'update tutte le righe risultano pronte, l'ordine si conclude (tavolo → 'consegnato').
  if ('mandataPronta' in body) {
    const n = Math.floor(Number(body.mandataPronta))
    const annulla = body.annulla === true
    await prisma.rigaOrdine.updateMany({
      where: { ordineId: id, mandata: n },
      data: { prontaAt: annulla ? null : new Date() },
    })
    const righe = await prisma.rigaOrdine.findMany({ where: { ordineId: id }, select: { prontaAt: true } })
    const tuttePronte = righe.length > 0 && righe.every(r => r.prontaAt != null)
    const patch: Record<string, unknown> = {}
    if (tuttePronte) { patch.status = 'consegnato'; patch.closedAt = new Date() }
    else if (annulla) { patch.status = 'aperto'; patch.closedAt = null } // riaperto se avevo concluso
    if (Object.keys(patch).length) await prisma.ordine.update({ where: { id }, data: patch })
    const ordine = await prisma.ordine.findUnique({
      where: { id },
      include: { righe: { orderBy: [{ mandata: 'asc' }, { id: 'asc' }] } },
    })
    return NextResponse.json({ ordine })
  }

  const data: Record<string, unknown> = {}
  if ('status' in body) {
    data.status = body.status
    if (body.status === 'pronto') data.prontoAt = new Date()
    // 'non_consegnato' = delivery non consegnato / asporto non ritirato: concluso (va nello storico) ma non incassato.
    if (body.status === 'chiuso' || body.status === 'consegnato' || body.status === 'non_consegnato') data.closedAt = new Date()
  }
  if ('tavoloId' in body) data.tavoloId = body.tavoloId
  if ('tavolo' in body) data.tavolo = body.tavolo
  // Acknowledgment cross-dispositivo: spegne pulse "nuovo" / badge "pronto" ovunque (via polling).
  if ('notatoNuovo' in body) data.notatoNuovo = !!body.notatoNuovo
  if ('notatoPronto' in body) data.notatoPronto = !!body.notatoPronto
  const ordine = await prisma.ordine.update({ where: { id }, data })
  return NextResponse.json({ ordine })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  await prisma.rigaOrdine.deleteMany({ where: { ordineId: id } })
  await prisma.ordine.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// POST — chiude il conto aperto per un tavolo/gruppo e scioglie la fusione
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { tavoloId, gruppoId, coperti } = await req.json()
  if (!tavoloId && !gruppoId) return NextResponse.json({ error: 'tavoloId o gruppoId richiesti' }, { status: 400 })

  // Chiude tutti i conti aperti per questo tavolo/gruppo
  const where = gruppoId
    ? { userId: user.id, gruppoId, status: { notIn: ['chiuso'] } }
    : { userId: user.id, tavoloId, gruppoId: null, status: { notIn: ['chiuso'] } }

  const copertiVal = typeof coperti === 'number' && coperti > 0 ? coperti : null
  await prisma.ordine.updateMany({ where, data: { status: 'chiuso', closedAt: new Date(), ...(copertiVal ? { coperti: copertiVal } : {}) } })

  // Marca come "confermato" SOLO l'appuntamento della serata corrente il cui orario è già passato.
  // Filtro temporale: data >= inizio serata (04:00 UTC di oggi o ieri) e data <= adesso.
  // Così non tocchiamo prenotazioni future dello stesso tavolo nella stessa sera,
  // né prenotazioni di serate precedenti.
  const now = new Date()
  const serataInizio = new Date(now)
  serataInizio.setUTCHours(4, 0, 0, 0)
  if (now.getUTCHours() < 4) serataInizio.setUTCDate(serataInizio.getUTCDate() - 1)

  const statiAttivi = ['in_attesa', 'confermato', 'pronto']
  const filtroData = { gte: serataInizio, lte: now }

  if (tavoloId) {
    await prisma.appuntamento.updateMany({
      where: { userId: user.id, tavoloId, status: { in: statiAttivi }, data: filtroData },
      data: { status: 'confermato' },
    })
  }
  if (gruppoId) {
    const gruppo = await prisma.gruppoTavoli.findUnique({
      where: { id: gruppoId },
      include: { tavoli: { select: { id: true } } },
    })
    if (gruppo) {
      const tavoloIds = gruppo.tavoli.map(t => t.id)
      await prisma.appuntamento.updateMany({
        where: { userId: user.id, tavoloId: { in: tavoloIds }, status: { in: statiAttivi }, data: filtroData },
        data: { status: 'confermato' },
      })
    }
    // NON eliminiamo il gruppo: mantiene raggruppati i sottogruppi del conto anche da chiuso.
    // Liberiamo però i tavoli (li stacchiamo dal gruppo) così tornano disponibili sulla mappa
    // e i nuovi ordini non si riagganciano a questo conto già chiuso.
    // Gli ordini chiusi conservano il loro gruppoId → restano uniti nello storico.
    await prisma.gruppoTavoli.update({
      where: { id: gruppoId },
      data: { tavoli: { set: [] } },
    })
  }

  return NextResponse.json({ ok: true })
}

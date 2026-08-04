import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// Riepilogo della SERATA corrente per l'overview.
// NON modifica in alcun modo le route analytics esistenti: riusa solo la stessa logica
// (raggruppamento per conto, split per tipo, classificazione prenotazione tavolo) su una
// finestra "oggi". La serata è la giornata di servizio con taglio alle 04:00 UTC (come il
// bucket delle analytics), così gli ordini dopo mezzanotte restano nella serata precedente.

function isPrenotazioneTavolo(servizio?: string | null): boolean {
  const s = (servizio ?? '').toLowerCase()
  if (/delivery|consegna|domicilio/.test(s)) return false
  if (/asporto|take away|takeaway|ordine/.test(s)) return false
  return /tavolo|prenotazione|cena|pranzo|sala|ristorazione/.test(s)
}

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const now = new Date()
  const start = new Date(now)
  if (start.getUTCHours() < 4) start.setUTCDate(start.getUTCDate() - 1)
  start.setUTCHours(4, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)

  const [ordiniTavolo, ordiniAspDel, appuntamenti] = await Promise.all([
    prisma.ordine.findMany({
      where: { userId: user.id, tipo: 'tavolo', status: 'chiuso', createdAt: { gte: start, lt: end } },
      select: { id: true, totale: true, coperti: true, gruppoId: true, tavoloId: true, tavolo: true, createdAt: true, closedAt: true },
    }),
    prisma.ordine.findMany({
      where: { userId: user.id, tipo: { in: ['asporto', 'delivery'] }, createdAt: { gte: start, lt: end } },
      select: { totale: true, status: true },
    }),
    prisma.appuntamento.findMany({
      where: { userId: user.id, data: { gte: start, lt: end }, status: { in: ['confermato', 'completato', 'pronto'] } },
      select: { coperti: true, servizio: true },
    }),
  ])

  // Coperti dai conti chiusi = una entry per conto (gruppo di tavoli uniti o singolo tavolo),
  // prendendo il valore inserito dal cameriere alla chiusura. Stessa logica delle analytics tavoli.
  const contoKey = (o: typeof ordiniTavolo[number]) => {
    const base = o.gruppoId ?? o.tavoloId ?? o.tavolo ?? o.id
    const when = o.closedAt ? new Date(o.closedAt).getTime() : new Date(o.createdAt).getTime()
    return `${base}#${when}`
  }
  const copertiConto = new Map<string, number>()
  for (const o of ordiniTavolo) {
    const ck = contoKey(o)
    copertiConto.set(ck, Math.max(copertiConto.get(ck) ?? 0, o.coperti ?? 0))
  }
  let copertiConti = 0
  for (const v of copertiConto.values()) copertiConti += v
  const incassoTavoli = ordiniTavolo.reduce((s, o) => s + o.totale, 0)

  // Incasso ordini + delivery: esclude non consegnati/annullati (come nelle analytics ordini).
  const consegnato = (o: { status: string }) => o.status !== 'non_consegnato' && o.status !== 'annullato'
  const incassoOrdiniDelivery = ordiniAspDel.filter(consegnato).reduce((s, o) => s + o.totale, 0)

  // Prenotazioni tavolo della serata (numero tavoli prenotati + coperti prenotati).
  const prenTavolo = appuntamenti.filter(a => isPrenotazioneTavolo(a.servizio))
  const prenotazioniNum = prenTavolo.length
  const prenotazioniCoperti = prenTavolo.reduce((s, a) => s + (a.coperti ?? 0), 0)

  return NextResponse.json({
    prenotazioniNum,
    prenotazioniCoperti,
    copertiConti,
    incassoTavoli,
    incassoOrdiniDelivery,
    incassoTotale: incassoTavoli + incassoOrdiniDelivery,
  })
}

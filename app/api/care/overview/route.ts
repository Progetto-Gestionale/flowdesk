import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { romeWallTimeToDate } from '@/lib/romeTime'
import { utcToRoma } from '@/lib/careRichiesta'

// Numeri dell'Overview: sedute di oggi, richieste da evadere, incassato da lunedì.
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ seduteOggi: 0, richiesteInAttesa: 0, incassoSettimana: 0 })

  const oggi = utcToRoma(new Date()).data
  const inizioOggi = romeWallTimeToDate(oggi, '00:00')
  const fineOggi = new Date(inizioOggi.getTime() + 24 * 60 * 60 * 1000)

  // Lunedì della settimana corrente, in ora italiana
  const [a, m, g] = oggi.split('-').map(Number)
  const dow = new Date(Date.UTC(a, m - 1, g)).getUTCDay() // 0 = domenica
  const indietro = dow === 0 ? 6 : dow - 1
  const lunedi = new Date(Date.UTC(a, m - 1, g - indietro))
  const p = (n: number) => String(n).padStart(2, '0')
  const inizioSettimana = romeWallTimeToDate(
    `${lunedi.getUTCFullYear()}-${p(lunedi.getUTCMonth() + 1)}-${p(lunedi.getUTCDate())}`, '00:00',
  )

  const [seduteOggi, richiesteInAttesa, completateSettimana] = await Promise.all([
    prisma.appuntamento.count({
      where: {
        userId: user.id,
        data: { gte: inizioOggi, lt: fineOggi },
        status: { notIn: ['cancellato', 'in_attesa', 'proposta_inviata'] },
      },
    }),
    prisma.appuntamento.count({ where: { userId: user.id, status: 'in_attesa' } }),
    prisma.appuntamento.findMany({
      where: {
        userId: user.id,
        status: 'completato',
        data: { gte: inizioSettimana, lt: fineOggi },
      },
      select: { tipoSeduta: { select: { prezzo: true } } },
    }),
  ])

  const incassoSettimana = completateSettimana.reduce((t, x) => t + (x.tipoSeduta?.prezzo ?? 0), 0)

  return NextResponse.json({ seduteOggi, richiesteInAttesa, incassoSettimana })
}

import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { romeWallTimeToDate } from '@/lib/romeTime'
import { utcToRoma } from '@/lib/careRichiesta'

// GET /api/care/analytics?da=YYYY-MM-DD&a=YYYY-MM-DD
// Numeri sulle sedute completate nel periodo: quante, quanto hanno reso,
// come sono distribuite nei giorni e fra i tipi di trattamento.
export async function GET(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const da = searchParams.get('da')
  const a = searchParams.get('a')
  if (!da || !a) return NextResponse.json({ error: 'Periodo mancante' }, { status: 400 })

  const inizio = romeWallTimeToDate(da, '00:00')
  const fine = new Date(romeWallTimeToDate(a, '00:00').getTime() + 24 * 60 * 60 * 1000)

  const completate = await prisma.appuntamento.findMany({
    where: { userId: user.id, status: 'completato', data: { gte: inizio, lt: fine } },
    select: {
      data: true,
      pazienteId: true,
      servizio: true,
      tipoSeduta: { select: { nome: true, prezzo: true } },
    },
  })

  // Sedute e incasso giorno per giorno (l'asse X del grafico a barre)
  const perGiorno = new Map<string, { sedute: number; incasso: number }>()
  for (let t = new Date(inizio); t < fine; t = new Date(t.getTime() + 24 * 60 * 60 * 1000)) {
    perGiorno.set(utcToRoma(t).data, { sedute: 0, incasso: 0 })
  }

  const perTipo = new Map<string, { sedute: number; incasso: number }>()
  const pazienti = new Set<string>()
  let incassoTotale = 0

  for (const app of completate) {
    const prezzo = app.tipoSeduta?.prezzo ?? 0
    incassoTotale += prezzo
    if (app.pazienteId) pazienti.add(app.pazienteId)

    const giorno = utcToRoma(app.data).data
    const rigaG = perGiorno.get(giorno) ?? { sedute: 0, incasso: 0 }
    rigaG.sedute++; rigaG.incasso += prezzo
    perGiorno.set(giorno, rigaG)

    const nome = app.tipoSeduta?.nome ?? app.servizio ?? 'Altro'
    const rigaT = perTipo.get(nome) ?? { sedute: 0, incasso: 0 }
    rigaT.sedute++; rigaT.incasso += prezzo
    perTipo.set(nome, rigaT)
  }

  return NextResponse.json({
    seduteCompletate: completate.length,
    incassoTotale,
    // "Quanto lascia in media un paziente nel periodo", non per singola seduta
    spesaMediaPaziente: pazienti.size ? incassoTotale / pazienti.size : 0,
    pazientiDistinti: pazienti.size,
    perGiorno: [...perGiorno.entries()].map(([giorno, v]) => ({ giorno, ...v })),
    perTipo: [...perTipo.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((x, y) => y.sedute - x.sedute),
  })
}

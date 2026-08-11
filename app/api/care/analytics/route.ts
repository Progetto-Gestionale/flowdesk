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
  // Come raggruppare le barre: un giorno per la settimana, una settimana per il
  // mese, un mese per l'anno. Con 365 barre il grafico annuale è illeggibile.
  const raggruppa = (searchParams.get('raggruppa') ?? 'giorno') as 'giorno' | 'settimana' | 'mese'
  if (!da || !a) return NextResponse.json({ error: 'Periodo mancante' }, { status: 400 })

  const inizio = romeWallTimeToDate(da, '00:00')
  const fine = new Date(romeWallTimeToDate(a, '00:00').getTime() + 24 * 60 * 60 * 1000)

  const [completate, noShow, storicoPrecedente] = await Promise.all([
    prisma.appuntamento.findMany({
      where: { userId: user.id, status: 'completato', data: { gte: inizio, lt: fine } },
      select: {
        data: true,
        pazienteId: true,
        servizio: true,
        tipoSeduta: { select: { nome: true, prezzo: true } },
      },
    }),
    prisma.appuntamento.count({
      where: { userId: user.id, status: 'no_show', data: { gte: inizio, lt: fine } },
    }),
    // Chi era già passato di qui PRIMA del periodo: serve a distinguere i pazienti
    // nuovi da quelli di ritorno
    prisma.appuntamento.findMany({
      where: { userId: user.id, status: 'completato', data: { lt: inizio }, pazienteId: { not: null } },
      select: { pazienteId: true },
      distinct: ['pazienteId'],
    }),
  ])

  // ── Barre del grafico, raggruppate secondo il periodo scelto ──────────────
  const p2 = (n: number) => String(n).padStart(2, '0')

  /** Chiave del gruppo a cui appartiene una data (in ora italiana). */
  function chiaveGruppo(dataIta: string): string {
    if (raggruppa === 'mese') return dataIta.slice(0, 7)   // "2026-08"
    if (raggruppa === 'giorno') return dataIta             // "2026-08-05"
    // Settimane DEL MESE (1-7, 8-14, 15-21, 22-28, 29-fine), non settimane
    // solari: così ogni barra appartiene al mese che stai guardando e non se
    // ne vedono due mozzate che sconfinano nel mese prima e in quello dopo.
    const [, mese, giorno] = dataIta.split('-').map(Number)
    void mese
    const indice = Math.min(4, Math.floor((giorno - 1) / 7))
    return `${dataIta.slice(0, 7)}#${indice}`             // "2026-08#0"
  }

  // Gruppi pre-inizializzati, così restano visibili anche quelli a zero
  const perGiorno = new Map<string, { sedute: number; incasso: number }>()
  for (let t = new Date(inizio); t < fine; t = new Date(t.getTime() + 24 * 60 * 60 * 1000)) {
    perGiorno.set(chiaveGruppo(utcToRoma(t).data), { sedute: 0, incasso: 0 })
  }

  const perTipo = new Map<string, { sedute: number; incasso: number }>()
  const pazienti = new Set<string>()
  let incassoTotale = 0

  for (const app of completate) {
    const prezzo = app.tipoSeduta?.prezzo ?? 0
    incassoTotale += prezzo
    if (app.pazienteId) pazienti.add(app.pazienteId)

    const gruppo = chiaveGruppo(utcToRoma(app.data).data)
    const rigaG = perGiorno.get(gruppo) ?? { sedute: 0, incasso: 0 }
    rigaG.sedute++; rigaG.incasso += prezzo
    perGiorno.set(gruppo, rigaG)

    const nome = app.tipoSeduta?.nome ?? app.servizio ?? 'Altro'
    const rigaT = perTipo.get(nome) ?? { sedute: 0, incasso: 0 }
    rigaT.sedute++; rigaT.incasso += prezzo
    perTipo.set(nome, rigaT)
  }

  // Tasso di no-show sulle sedute che avrebbero dovuto svolgersi
  const previste = completate.length + noShow
  const tassoNoShow = previste > 0 ? (noShow / previste) * 100 : 0

  const giaVisti = new Set(storicoPrecedente.map(x => x.pazienteId))
  let pazientiNuovi = 0
  for (const p of pazienti) if (!giaVisti.has(p)) pazientiNuovi++

  return NextResponse.json({
    seduteCompletate: completate.length,
    noShow,
    tassoNoShow,
    pazientiNuovi,
    pazientiDiRitorno: pazienti.size - pazientiNuovi,
    incassoTotale,
    // "Quanto lascia in media un paziente nel periodo", non per singola seduta
    spesaMediaPaziente: pazienti.size ? incassoTotale / pazienti.size : 0,
    pazientiDistinti: pazienti.size,
    raggruppa,
    perGiorno: [...perGiorno.entries()]
      .map(([giorno, v]) => ({ giorno, ...v }))
      .sort((x, y) => x.giorno.localeCompare(y.giorno)),
    perTipo: [...perTipo.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((x, y) => y.sedute - x.sedute),
  })
}

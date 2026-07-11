import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

function romeDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function romeTime(d: Date): string {
  return d.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' })
}

function diffOreMinuti(oraInizio: string, oraFine: string): number {
  const [h1, m1] = oraInizio.split(':').map(Number)
  const [h2, m2] = oraFine.split(':').map(Number)
  let minuti = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (minuti < 0) minuti += 24 * 60
  return minuti
}

function oraToMin(ora: string): number {
  if (!ora || ora === '—') return NaN
  const [h, m] = ora.split(':').map(Number)
  return h * 60 + m
}

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dipId = searchParams.get('dipendenteId')
  const fonte = (searchParams.get('fonte') ?? 'turni') as 'turni' | 'cartellino'

  // ── DETAIL ENDPOINT ──
  if (dipId) {
    const periodoParam = (searchParams.get('periodo') ?? 'mese') as 'settimana' | 'mese' | 'anno'
    const rifParam = searchParams.get('riferimento')
    let rif: Date
    if (rifParam) {
      const [y, m, d] = rifParam.split('-').map(Number)
      rif = new Date(y, m - 1, d)
    } else {
      rif = new Date()
    }

    let inizio: Date, fine: Date, rangeLabel: string

    if (periodoParam === 'settimana') {
      const dow = (rif.getDay() + 6) % 7 // 0=lun
      inizio = new Date(rif.getFullYear(), rif.getMonth(), rif.getDate() - dow)
      fine = new Date(inizio.getFullYear(), inizio.getMonth(), inizio.getDate() + 7)
      const fineDisplay = new Date(fine.getTime() - 86400000)
      rangeLabel = `${inizio.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} – ${fineDisplay.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}`
    } else if (periodoParam === 'mese') {
      inizio = new Date(rif.getFullYear(), rif.getMonth(), 1)
      fine = new Date(rif.getFullYear(), rif.getMonth() + 1, 1)
      rangeLabel = inizio.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    } else {
      inizio = new Date(rif.getFullYear(), 0, 1)
      fine = new Date(rif.getFullYear() + 1, 0, 1)
      rangeLabel = String(rif.getFullYear())
    }

    const fineBuffer = new Date(fine.getTime() + 8 * 3600000)

    const [dip, turni, timbrature, richieste, anyTimbriLocale] = await Promise.all([
      prisma.dipendente.findFirst({
        where: { id: dipId, userId: user.id },
        select: { id: true, nome: true, ruolo: true },
      }),
      prisma.turno.findMany({
        where: { dipendenteId: dipId, userId: user.id, data: { gte: inizio, lt: fine } },
        select: { data: true, oraInizio: true, oraFine: true },
        orderBy: { data: 'asc' },
      }),
      prisma.timbratura.findMany({
        where: { dipendenteId: dipId, timestamp: { gte: inizio, lt: fineBuffer } },
        select: { tipo: true, timestamp: true },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.richiestaDipendente.findMany({
        where: {
          dipendenteId: dipId,
          OR: [
            { data: { gte: inizio, lt: fine } },
            { dataFine: { gte: inizio } },
          ],
        },
        select: { tipo: true, status: true, data: true, dataFine: true, oraInizio: true, oraFine: true },
        orderBy: { data: 'asc' },
      }),
      prisma.timbratura.findFirst({ where: { dipendenteId: dipId }, select: { id: true } }),
    ])

    if (!dip) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

    const usaTimbri = Boolean(anyTimbriLocale) || timbrature.length > 0

    // turniPerGiorno
    const turniPerGiorno: Record<string, { oraInizio: string; oraFine: string; ore: number }[]> = {}
    turni.forEach(t => {
      const k = romeDate(t.data)
      if (!turniPerGiorno[k]) turniPerGiorno[k] = []
      turniPerGiorno[k].push({
        oraInizio: t.oraInizio,
        oraFine: t.oraFine,
        ore: Math.round(diffOreMinuti(t.oraInizio, t.oraFine) / 60 * 10) / 10,
      })
    })

    // timbraturePerGiorno — pairing globale entrata→uscita
    const timbraturePerGiorno: Record<string, { oraInizio: string; oraFine: string; ore: number }[]> = {}
    const sortedTimbr = [...timbrature].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    let ti = 0
    while (ti < sortedTimbr.length) {
      if (sortedTimbr[ti].tipo === 'entrata') {
        const e = sortedTimbr[ti].timestamp
        const u = sortedTimbr[ti + 1]?.tipo === 'uscita' ? sortedTimbr[ti + 1].timestamp : null
        const k = romeDate(e)
        const oraI = romeTime(e)
        const oraF = u ? romeTime(u) : '—'
        const ore = u ? Math.round((u.getTime() - e.getTime()) / 360000) / 10 : 0
        if (!timbraturePerGiorno[k]) timbraturePerGiorno[k] = []
        timbraturePerGiorno[k].push({ oraInizio: oraI, oraFine: oraF, ore })
        ti += u ? 2 : 1
      } else { ti++ }
    }

    // Ritardi & Straordinari — confronto turni vs timbrature per giorno
    const ritardi: {
      data: string
      turnoInizio: string; turnoFine: string
      entrataEff: string | null; uscitaEff: string | null
      ritardoMin: number; straordinarioMin: number
    }[] = []

    for (const [data, ts] of Object.entries(turniPerGiorno)) {
      const timbriGiorno = timbraturePerGiorno[data] ?? []
      ts.forEach((t, i) => {
        const tb = timbriGiorno[i]
        const entrataMin = tb ? oraToMin(tb.oraInizio) : NaN
        const uscitaMin = tb ? oraToMin(tb.oraFine) : NaN
        const ritardoMin = !isNaN(entrataMin) ? entrataMin - oraToMin(t.oraInizio) : 0
        const straordinarioMin = !isNaN(uscitaMin) ? uscitaMin - oraToMin(t.oraFine) : 0
        ritardi.push({
          data,
          turnoInizio: t.oraInizio, turnoFine: t.oraFine,
          entrataEff: tb?.oraInizio ?? null,
          uscitaEff: tb?.oraFine && tb.oraFine !== '—' ? tb.oraFine : null,
          ritardoMin,
          straordinarioMin,
        })
      })
    }

    const pd = `${inizio.getFullYear()}-${String(inizio.getMonth() + 1).padStart(2, '0')}-${String(inizio.getDate()).padStart(2, '0')}`
    const pf = `${fine.getFullYear()}-${String(fine.getMonth() + 1).padStart(2, '0')}-${String(fine.getDate()).padStart(2, '0')}`

    return NextResponse.json({
      dip,
      turniPerGiorno,
      timbraturePerGiorno,
      richieste: richieste.map(r => ({
        tipo: r.tipo, status: r.status,
        data: r.data ? romeDate(r.data) : null,
        dataFine: r.dataFine ? romeDate(r.dataFine) : null,
        oraInizio: r.oraInizio, oraFine: r.oraFine,
      })),
      usaTimbri,
      ritardi,
      periodo: periodoParam,
      inizioPeriodo: pd,
      finePeriodo: pf,
      rangeLabel,
    })
  }

  // ── LIST ENDPOINT ──
  const meseParam = searchParams.get('mese')
  const ora = new Date()
  const meseStr = meseParam ?? `${ora.getFullYear()}-${String(ora.getMonth() + 1).padStart(2, '0')}`
  const [year, month] = meseStr.split('-').map(Number)
  const inizioMese = new Date(year, month - 1, 1)
  const fineMese = new Date(year, month, 1)

  const [dipendenti, turni, timbrature, richieste] = await Promise.all([
    prisma.dipendente.findMany({
      where: { userId: user.id },
      select: { id: true, nome: true, ruolo: true },
    }),
    prisma.turno.findMany({
      where: { userId: user.id, data: { gte: inizioMese, lt: fineMese <= ora ? fineMese : ora } },
      select: { dipendenteId: true, data: true, oraInizio: true, oraFine: true },
    }),
    prisma.timbratura.findMany({
      where: {
        dipendente: { userId: user.id },
        timestamp: { gte: inizioMese, lt: new Date(Math.min((fineMese <= ora ? fineMese : ora).getTime() + 8 * 3600000, ora.getTime())) },
      },
      select: { dipendenteId: true, tipo: true, timestamp: true },
      orderBy: { timestamp: 'asc' },
    }),
    prisma.richiestaDipendente.findMany({
      where: {
        dipendente: { userId: user.id },
        OR: [
          { data: { gte: inizioMese, lt: fineMese } },
          { dataFine: { gte: inizioMese } },
        ],
      },
      select: { dipendenteId: true, tipo: true, status: true, data: true, dataFine: true },
    }),
  ])

  const tipiAssenza = ['assenza', 'malattia', 'permesso', 'ferie']

  const staff = dipendenti.map(dip => {
    const mieiTurni = turni.filter(t => t.dipendenteId === dip.id)
    const mieTimbrature = timbrature.filter(t => t.dipendenteId === dip.id)
    const mieRichieste = richieste.filter(r => r.dipendenteId === dip.id)

    let oreLavorate: number, giorniLavorati: number, giornoTop: string | null

    if (fonte === 'cartellino') {
      const sorted = [...mieTimbrature].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      const coppie: { entrata: Date; uscita: Date | null; giorno: string }[] = []
      let ci = 0
      while (ci < sorted.length) {
        if (sorted[ci].tipo === 'entrata') {
          const usc = sorted[ci + 1]?.tipo === 'uscita' ? sorted[ci + 1].timestamp : null
          coppie.push({ entrata: sorted[ci].timestamp, uscita: usc, giorno: romeDate(sorted[ci].timestamp) })
          ci += usc ? 2 : 1
        } else { ci++ }
      }
      let minutiTotali = 0
      const perDow = [0, 0, 0, 0, 0, 0, 0]
      const giorniSet = new Set<string>()
      coppie.forEach(({ entrata, uscita, giorno }) => {
        if (uscita) minutiTotali += (uscita.getTime() - entrata.getTime()) / 60000
        giorniSet.add(giorno)
        perDow[new Date(giorno + 'T12:00:00').getDay()]++
      })
      oreLavorate = Math.round(minutiTotali / 60 * 10) / 10
      giorniLavorati = giorniSet.size
      const idx = perDow.indexOf(Math.max(...perDow))
      giornoTop = giorniLavorati > 0 ? GIORNI[idx] : null
    } else {
      const min = mieiTurni.reduce((s, t) => s + diffOreMinuti(t.oraInizio, t.oraFine), 0)
      oreLavorate = Math.round(min / 60 * 10) / 10
      giorniLavorati = new Set(mieiTurni.map(t => romeDate(t.data))).size
      const perGiorno = [0, 0, 0, 0, 0, 0, 0]
      mieiTurni.forEach(t => perGiorno[t.data.getDay()]++)
      const idx = perGiorno.indexOf(Math.max(...perGiorno))
      giornoTop = giorniLavorati > 0 ? GIORNI[idx] : null
    }

    // Ritardi nel mese
    const timbriPerGiornoList: Record<string, { oraInizio: string; oraFine: string }[]> = {}
    const sortedT = [...mieTimbrature].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    let ti2 = 0
    while (ti2 < sortedT.length) {
      if (sortedT[ti2].tipo === 'entrata') {
        const e = sortedT[ti2].timestamp
        const u = sortedT[ti2 + 1]?.tipo === 'uscita' ? sortedT[ti2 + 1].timestamp : null
        const k = romeDate(e)
        if (!timbriPerGiornoList[k]) timbriPerGiornoList[k] = []
        timbriPerGiornoList[k].push({ oraInizio: romeTime(e), oraFine: u ? romeTime(u) : '—' })
        ti2 += u ? 2 : 1
      } else { ti2++ }
    }
    const turniPerGiornoList: Record<string, { oraInizio: string; oraFine: string }[]> = {}
    mieiTurni.forEach(t => {
      const k = romeDate(t.data)
      if (!turniPerGiornoList[k]) turniPerGiornoList[k] = []
      turniPerGiornoList[k].push({ oraInizio: t.oraInizio, oraFine: t.oraFine })
    })
    let ritardiCount = 0
    let ritardiMinTot = 0
    for (const [data, ts] of Object.entries(turniPerGiornoList)) {
      const timbriG = timbriPerGiornoList[data] ?? []
      ts.forEach((t, i) => {
        const tb = timbriG[i]
        if (!tb) return
        const entrataMin = oraToMin(tb.oraInizio)
        if (isNaN(entrataMin)) return
        const rit = entrataMin - oraToMin(t.oraInizio)
        if (rit > 2) { ritardiCount++; ritardiMinTot += rit }
      })
    }

    const ferie = mieRichieste.filter(r => r.tipo === 'ferie')
    const malattie = mieRichieste.filter(r => r.tipo === 'malattia')
    const permessi = mieRichieste.filter(r => r.tipo === 'permesso')

    return {
      id: dip.id, nome: dip.nome, ruolo: dip.ruolo,
      oreLavorate, giorniLavorati, giornoTop,
      ritardi: { count: ritardiCount, minTotali: ritardiMinTot },
      ferie: { totale: ferie.length, approvate: ferie.filter(r => r.status === 'approvata').length },
      malattie: { totale: malattie.length, approvate: malattie.filter(r => r.status === 'approvata').length },
      permessi: { totale: permessi.length, approvati: permessi.filter(r => r.status === 'approvata').length },
    }
  })

  const mesiDisponibili: string[] = []
  for (let i = 0; i <= ora.getMonth(); i++) {
    const d = new Date(ora.getFullYear(), i, 1)
    mesiDisponibili.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  mesiDisponibili.reverse()

  return NextResponse.json({ staff, mese: meseStr, mesiDisponibili })
}

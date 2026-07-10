import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

function diffOreMinuti(oraInizio: string, oraFine: string): number {
  const [h1, m1] = oraInizio.split(':').map(Number)
  const [h2, m2] = oraFine.split(':').map(Number)
  let minuti = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (minuti < 0) minuti += 24 * 60 // turno mezzanotte
  return minuti
}

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const meseParam = searchParams.get('mese') // YYYY-MM, default mese corrente

  const ora = new Date()
  const meseStr = meseParam ?? `${ora.getFullYear()}-${String(ora.getMonth() + 1).padStart(2, '0')}`
  const [year, month] = meseStr.split('-').map(Number)
  const inizioMese = new Date(year, month - 1, 1)
  const fineMese = new Date(year, month, 1)

  const [dipendenti, turni, richieste] = await Promise.all([
    prisma.dipendente.findMany({
      where: { userId: user.id },
      select: { id: true, nome: true, ruolo: true },
    }),
    prisma.turno.findMany({
      where: { userId: user.id, data: { gte: inizioMese, lt: fineMese <= ora ? fineMese : ora } },
      select: { dipendenteId: true, data: true, oraInizio: true, oraFine: true },
    }),
    prisma.richiestaDipendente.findMany({
      where: {
        dipendente: { userId: user.id },
        OR: [
          { data: { gte: inizioMese, lt: fineMese } },
          { dataFine: { gte: inizioMese } },
        ],
      },
      select: { dipendenteId: true, tipo: true, status: true, data: true, dataFine: true, oraInizio: true, oraFine: true },
    }),
  ])

  const tipiAssenza = ['assenza', 'malattia', 'permesso', 'ferie']

  const staff = dipendenti.map(dip => {
    const mieiTurni = turni.filter(t => t.dipendenteId === dip.id)
    const mieRichieste = richieste.filter(r => r.dipendenteId === dip.id)

    // Ore e giorni lavorati
    const minutiTotali = mieiTurni.reduce((s, t) => s + diffOreMinuti(t.oraInizio, t.oraFine), 0)
    const oreLavorate = Math.round(minutiTotali / 60 * 10) / 10
    const giorniLavorati = new Set(mieiTurni.map(t => t.data.toISOString().split('T')[0])).size

    // Giorno della settimana più frequente
    const perGiorno = [0, 0, 0, 0, 0, 0, 0]
    mieiTurni.forEach(t => perGiorno[t.data.getDay()]++)
    const giornoTopIdx = perGiorno.indexOf(Math.max(...perGiorno))
    const giornoTop = giorniLavorati > 0 ? GIORNI[giornoTopIdx] : null

    // Richieste per tipo (solo del mese)
    const richiesteAssenza = mieRichieste.filter(r => tipiAssenza.includes(r.tipo))
    const ferie = richiesteAssenza.filter(r => r.tipo === 'ferie')
    const malattie = richiesteAssenza.filter(r => r.tipo === 'malattia')
    const permessi = richiesteAssenza.filter(r => r.tipo === 'permesso')
    const preferenze = mieRichieste.filter(r => r.tipo === 'preferenza_orario')

    return {
      id: dip.id,
      nome: dip.nome,
      ruolo: dip.ruolo,
      oreLavorate,
      giorniLavorati,
      giornoTop,
      ferie: { totale: ferie.length, approvate: ferie.filter(r => r.status === 'approvata').length },
      malattie: { totale: malattie.length, approvate: malattie.filter(r => r.status === 'approvata').length },
      permessi: { totale: permessi.length, approvati: permessi.filter(r => r.status === 'approvata').length },
      preferenze: preferenze.length,
    }
  })

  // Lista mesi disponibili: tutti i mesi passati dell'anno corrente
  const mesiDisponibili = []
  for (let i = 0; i <= ora.getMonth(); i++) {
    const d = new Date(ora.getFullYear(), i, 1)
    mesiDisponibili.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  mesiDisponibili.reverse() // più recente prima

  // Dettaglio singolo dipendente
  const dipId = searchParams.get('dipendenteId')
  if (dipId) {
    const dip = staff.find(d => d.id === dipId)
    if (!dip) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

    const mieiTurni = turni.filter(t => t.dipendenteId === dipId)
    const mieRichieste = richieste.filter(r => r.dipendenteId === dipId)

    // Turni per giorno (per calendario)
    const turniPerGiorno: Record<string, { oraInizio: string; oraFine: string; ore: number }[]> = {}
    mieiTurni.forEach(t => {
      const k = t.data.toISOString().split('T')[0]
      if (!turniPerGiorno[k]) turniPerGiorno[k] = []
      turniPerGiorno[k].push({ oraInizio: t.oraInizio, oraFine: t.oraFine, ore: Math.round(diffOreMinuti(t.oraInizio, t.oraFine) / 60 * 10) / 10 })
    })

    // Ore per giorno settimana
    const orePerDow = [0, 0, 0, 0, 0, 0, 0]
    mieiTurni.forEach(t => { orePerDow[t.data.getDay()] += diffOreMinuti(t.oraInizio, t.oraFine) / 60 })
    const orePerDowRound = orePerDow.map(v => Math.round(v * 10) / 10)

    // Lista richieste con dettaglio
    const richiesteDettaglio = mieRichieste.map(r => ({
      tipo: r.tipo,
      status: r.status,
      data: r.data,
      dataFine: r.dataFine,
      oraInizio: r.oraInizio,
      oraFine: r.oraFine,
    }))

    return NextResponse.json({ dip, turniPerGiorno, orePerDow: orePerDowRound, richieste: richiesteDettaglio, mese: meseStr })
  }

  return NextResponse.json({ staff, mese: meseStr, mesiDisponibili })
}

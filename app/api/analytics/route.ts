import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const periodo = searchParams.get('periodo') ?? 'anno' // settimana | mese | anno
  const rifParam = searchParams.get('riferimento')

  const ora = new Date()
  const rif = rifParam ? new Date(rifParam) : ora // data di riferimento per la navigazione

  let inizio: Date
  let fine: Date // limite superiore per la query (può essere nel futuro)
  let bucketFn: (d: Date) => string
  let buckets: string[]

  if (periodo === 'settimana') {
    const lun = new Date(rif)
    lun.setDate(rif.getDate() - ((rif.getDay() + 6) % 7))
    lun.setHours(0, 0, 0, 0)
    inizio = lun
    fine = new Date(lun); fine.setDate(lun.getDate() + 7)
    bucketFn = (d) => {
      const GIORNI_IT = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
      return GIORNI_IT[d.getDay()]
    }
    buckets = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom']
  } else if (periodo === 'mese') {
    inizio = new Date(rif.getFullYear(), rif.getMonth(), 1)
    fine = new Date(rif.getFullYear(), rif.getMonth() + 1, 1)
    bucketFn = (d) => String(d.getDate())
    buckets = Array.from({ length: new Date(rif.getFullYear(), rif.getMonth() + 1, 0).getDate() }, (_, i) => String(i + 1))
  } else {
    // anno — 12 mesi centrati sull'anno del riferimento
    inizio = new Date(rif.getFullYear(), 0, 1)
    fine = new Date(rif.getFullYear() + 1, 0, 1)
    bucketFn = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(rif.getFullYear(), i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }

  const limiteSuperiore = fine < ora ? fine : ora // non mostrare dati futuri

  const [appuntamenti, ordini] = await Promise.all([
    prisma.appuntamento.findMany({
      where: { userId: user.id, data: { gte: inizio, lt: limiteSuperiore } },
      select: { data: true, status: true },
    }),
    prisma.ordine.findMany({
      where: { userId: user.id, createdAt: { gte: inizio, lt: limiteSuperiore } },
      select: { createdAt: true, totale: true },
    }),
  ])

  // Bucket prenotazioni
  const perBucket: Record<string, { totale: number; noShow: number; completati: number; cancellati: number }> = {}
  for (const b of buckets) perBucket[b] = { totale: 0, noShow: 0, completati: 0, cancellati: 0 }
  for (const a of appuntamenti) {
    const key = bucketFn(a.data)
    if (!perBucket[key]) continue
    perBucket[key].totale++
    if (a.status === 'no_show') perBucket[key].noShow++
    else if (a.status === 'cancellato') perBucket[key].cancellati++
    else perBucket[key].completati++
  }

  // Revenue tavoli per bucket
  const revenuePerBucket: Record<string, number> = {}
  for (const b of buckets) revenuePerBucket[b] = 0
  for (const o of ordini) {
    const key = bucketFn(o.createdAt)
    if (revenuePerBucket[key] !== undefined) revenuePerBucket[key] += o.totale
  }

  // Giorno della settimana più gettonato
  const perGiorno = [0, 0, 0, 0, 0, 0, 0]
  for (const a of appuntamenti) perGiorno[a.data.getDay()]++

  // Ora più gettonata
  const perOra: Record<number, number> = {}
  for (const a of appuntamenti) {
    const h = a.data.getHours()
    perOra[h] = (perOra[h] ?? 0) + 1
  }

  const totaleApp = appuntamenti.length
  const noShow = appuntamenti.filter(a => a.status === 'no_show').length
  const cancellati = appuntamenti.filter(a => a.status === 'cancellato').length
  const completati = appuntamenti.filter(a => a.status !== 'no_show' && a.status !== 'cancellato').length
  const tassoNoShow = totaleApp > 0 ? Math.round((noShow / totaleApp) * 100) : 0

  const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
  const giornoTop = perGiorno.indexOf(Math.max(...perGiorno))
  const oraTopEntry = Object.entries(perOra).sort((a, b) => b[1] - a[1])[0]
  const oraTop = oraTopEntry ? parseInt(oraTopEntry[0]) : null

  const MESI_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  let labelPeriodo: string
  if (periodo === 'settimana') {
    const dom = new Date(inizio); dom.setDate(inizio.getDate() + 6)
    labelPeriodo = `${inizio.getDate()} ${MESI_IT[inizio.getMonth()]} – ${dom.getDate()} ${MESI_IT[dom.getMonth()]} ${dom.getFullYear()}`
  } else if (periodo === 'mese') {
    labelPeriodo = `${MESI_IT[rif.getMonth()]} ${rif.getFullYear()}`
  } else {
    labelPeriodo = String(rif.getFullYear())
  }

  return NextResponse.json({
    totaleApp, noShow, cancellati, completati, tassoNoShow, periodo, labelPeriodo,
    giornoTop: giornoTop >= 0 ? GIORNI[giornoTop] : null,
    oraTop: oraTop !== null ? `${String(oraTop).padStart(2, '0')}:00` : null,
    perMese: buckets.map(b => ({ mese: b, ...perBucket[b], revenue: revenuePerBucket[b] ?? 0 })), // cancellati incluso in perBucket
  })
}

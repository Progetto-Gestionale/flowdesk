import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

function bucketKey(date: Date, byMonth: boolean): string {
  const d = new Date(date)
  if (d.getUTCHours() < 4) d.setUTCDate(d.getUTCDate() - 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  if (byMonth) return `${y}-${m}`
  return `${y}-${m}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function calcolaRange(periodo: string, rif: Date): { from: Date; to: Date } {
  if (periodo === 'anno') {
    const anno = rif.getUTCFullYear()
    return {
      from: new Date(Date.UTC(anno, 0, 1)),
      to: new Date(Date.UTC(anno + 1, 0, 1)),
    }
  }
  if (periodo === 'mese') {
    const anno = rif.getUTCFullYear()
    const mese = rif.getUTCMonth()
    return {
      from: new Date(Date.UTC(anno, mese, 1)),
      to: new Date(Date.UTC(anno, mese + 1, 1)),
    }
  }
  // settimana: lunedì - domenica della settimana di rif
  const d = new Date(rif)
  d.setUTCHours(0, 0, 0, 0)
  const dow = d.getUTCDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const from = new Date(d)
  from.setUTCDate(d.getUTCDate() + diff)
  const to = new Date(from)
  to.setUTCDate(from.getUTCDate() + 7)
  return { from, to }
}

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const periodo = searchParams.get('periodo') ?? 'settimana'
  const rifStr = searchParams.get('riferimento')
  const rif = rifStr ? new Date(rifStr) : new Date()
  const byMonth = periodo === 'anno'

  const { from, to } = calcolaRange(periodo, rif)

  // Non mostrare il giorno corrente (dati parziali)
  const oggi = new Date()
  oggi.setUTCHours(0, 0, 0, 0)
  const toEffettivo = to > oggi ? oggi : to

  // Pre-popola tutti i bucket con zero (così appaiono sempre nel grafico)
  const bucketMap: Record<string, { incasso: number; ordini: number; coperti: number }> = {}
  if (byMonth) {
    const d = new Date(from)
    while (d < to) {
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      if (!bucketMap[key]) bucketMap[key] = { incasso: 0, ordini: 0, coperti: 0 }
      d.setUTCMonth(d.getUTCMonth() + 1)
    }
  } else {
    const d = new Date(from)
    while (d < to) {
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      bucketMap[key] = { incasso: 0, ordini: 0, coperti: 0 }
      d.setUTCDate(d.getUTCDate() + 1)
    }
  }

  const ordini = await prisma.ordine.findMany({
    where: {
      userId: user.id,
      tipo: 'tavolo',
      status: 'chiuso',
      createdAt: { gte: from, lt: toEffettivo },
    },
    select: { id: true, totale: true, coperti: true, createdAt: true, closedAt: true },
  })

  for (const o of ordini) {
    const k = bucketKey(o.createdAt, byMonth)
    if (bucketMap[k]) {
      bucketMap[k].incasso += o.totale
      bucketMap[k].ordini += 1
      bucketMap[k].coperti += o.coperti ?? 0
    }
  }

  const andamento = Object.entries(bucketMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, v]) => ({ data, ...v }))

  const totaleIncasso = ordini.reduce((s, o) => s + o.totale, 0)
  const copertiConfermati = ordini.reduce((s, o) => s + (o.coperti ?? 0), 0)
  const spesaMediaPersona = copertiConfermati > 0 ? totaleIncasso / copertiConfermati : 0
  const ordiniConDurata = ordini.filter(o => o.closedAt != null)
  const durataMedia = ordiniConDurata.length > 0
    ? ordiniConDurata.reduce((s, o) => s + (o.closedAt!.getTime() - o.createdAt.getTime()), 0) / ordiniConDurata.length / 60000
    : 0

  return NextResponse.json({
    totaleIncasso,
    totaleOrdini: ordini.length,
    copertiConfermati,
    spesaMediaPersona,
    tassoNoShow: 0,
    durataMediaMinuti: Math.round(durataMedia),
    andamento,
  })
}

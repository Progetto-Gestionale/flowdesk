import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// Una prenotazione "tavolo" del calendario (stessa classificazione di inferTipo lato calendario):
// esclude asporto/delivery, così i coperti su prenotazione non vengono gonfiati dagli ordini.
function isPrenotazioneTavolo(servizio?: string | null): boolean {
  const s = (servizio ?? '').toLowerCase()
  if (/delivery|consegna|domicilio/.test(s)) return false
  if (/asporto|take away|takeaway|ordine/.test(s)) return false
  return /tavolo|prenotazione|cena|pranzo|sala|ristorazione/.test(s)
}

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

  // Pre-popola tutti i bucket con zero
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

  const [ordini, appuntamenti] = await Promise.all([
    prisma.ordine.findMany({
      where: {
        userId: user.id,
        tipo: 'tavolo',
        status: 'chiuso',
        createdAt: { gte: from, lt: toEffettivo },
      },
      select: { id: true, totale: true, coperti: true, gruppoId: true, tavoloId: true, tavolo: true, createdAt: true, closedAt: true },
    }),
    prisma.appuntamento.findMany({
      where: {
        userId: user.id,
        // 'completato' incluso: le prenotazioni passate vengono spostate da 'confermato' a
        // 'completato' dal cleanup notturno; senza includerlo i coperti su prenotazione risultavano ~0.
        status: { in: ['confermato', 'completato', 'no_show'] },
        data: { gte: from, lt: toEffettivo },
      },
      select: { status: true, coperti: true, servizio: true },
    }),
  ])

  // Un "conto" (bill) = un gruppo di tavoli uniti, oppure un singolo tavolo in una sessione.
  // Tutti gli ordini (sottogruppi) di uno stesso conto vengono chiusi insieme con lo stesso
  // closedAt e con gli stessi coperti (quelli inseriti dal cameriere alla chiusura).
  // → "tavoli serviti" = numero di CONTI chiusi (non i sottogruppi, non i coperti);
  //   i coperti totali si contano UNA sola volta per conto.
  const contoKey = (o: typeof ordini[number]) => {
    const base = o.gruppoId ?? o.tavoloId ?? o.tavolo ?? o.id
    const when = o.closedAt ? new Date(o.closedAt).getTime() : new Date(o.createdAt).getTime()
    return `${base}#${when}`
  }
  // Coperti per conto = valore inserito dal cameriere alla chiusura (uguale su tutti i sottogruppi;
  // prendiamo il massimo per robustezza contro eventuali sottogruppi rimasti senza coperti).
  const copertiConto = new Map<string, number>()
  for (const o of ordini) {
    const ck = contoKey(o)
    copertiConto.set(ck, Math.max(copertiConto.get(ck) ?? 0, o.coperti ?? 0))
  }

  const contiVisti = new Set<string>()
  for (const o of ordini) {
    const k = bucketKey(o.createdAt, byMonth)
    if (!bucketMap[k]) continue
    bucketMap[k].incasso += o.totale        // l'incasso somma tutti i sottogruppi (soldi reali)
    const ck = contoKey(o)
    if (!contiVisti.has(ck)) {
      contiVisti.add(ck)
      bucketMap[k].ordini += 1               // +1 conto servito
      bucketMap[k].coperti += copertiConto.get(ck) ?? 0
    }
  }

  const andamento = Object.entries(bucketMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, v]) => ({ data, ...v }))

  const totaleIncasso = ordini.reduce((s, o) => s + o.totale, 0)

  // Coperti totali = somma dei coperti per conto (inseriti dal cameriere alla chiusura).
  let copertiConfermati = 0
  for (const v of copertiConto.values()) copertiConfermati += v

  // Coperti su prenotazione = somma coperti delle PRENOTAZIONI TAVOLO del calendario
  // effettivamente avvenute (confermate o completate); no-show e cancellate non occupano tavoli.
  const copertiPrenotazione = appuntamenti
    .filter(a => isPrenotazioneTavolo(a.servizio) && (a.status === 'confermato' || a.status === 'completato'))
    .reduce((s, a) => s + (a.coperti ?? 0), 0)

  // Walk-in = coperti totali dai conti − coperti su prenotazione tavolo.
  const copertiWalkIn = Math.max(0, copertiConfermati - copertiPrenotazione)

  const noShow = appuntamenti.filter(a => a.status === 'no_show' && isPrenotazioneTavolo(a.servizio)).length

  const spesaMediaPersona = copertiConfermati > 0 ? totaleIncasso / copertiConfermati : 0

  // Durata media = dall'APERTURA del conto alla CHIUSURA del conto (non per singolo ordine).
  // Se il cameriere ha unito più conti (stesso gruppo, tavoli diversi), quelli erano un unico
  // tavolo: l'apertura del conto è la MEDIA delle aperture dei sotto-conti (uno per tavolo),
  // mentre la chiusura (closedAt) è la stessa per tutti.
  const ordiniPerConto = new Map<string, (typeof ordini[number])[]>()
  for (const o of ordini) {
    const ck = contoKey(o)
    const arr = ordiniPerConto.get(ck) ?? []
    arr.push(o)
    ordiniPerConto.set(ck, arr)
  }
  const durateConto: number[] = []
  for (const ordiniConto of ordiniPerConto.values()) {
    const chiusura = ordiniConto.find(o => o.closedAt != null)?.closedAt
    if (!chiusura) continue
    // Apertura di ogni sotto-conto (per tavolo) = createdAt più vecchio di quel tavolo.
    const aperturaPerTavolo = new Map<string, number>()
    for (const o of ordiniConto) {
      const sub = o.tavoloId ?? o.id
      const t = new Date(o.createdAt).getTime()
      aperturaPerTavolo.set(sub, Math.min(aperturaPerTavolo.get(sub) ?? Infinity, t))
    }
    const aperture = [...aperturaPerTavolo.values()]
    const aperturaMedia = aperture.reduce((s, x) => s + x, 0) / aperture.length
    const durMin = (new Date(chiusura).getTime() - aperturaMedia) / 60000
    if (durMin >= 0) durateConto.push(durMin)
  }
  const durataMedia = durateConto.length > 0
    ? durateConto.reduce((s, x) => s + x, 0) / durateConto.length
    : 0

  // Tavoli serviti = numero di conti chiusi (una entry per conto nella mappa coperti).
  const totaleTavoli = copertiConto.size

  return NextResponse.json({
    totaleIncasso,
    totaleOrdini: totaleTavoli,
    copertiConfermati,
    copertiPrenotazione,
    copertiWalkIn,
    spesaMediaPersona,
    noShow,
    durataMediaMinuti: Math.round(durataMedia),
    andamento,
  })
}

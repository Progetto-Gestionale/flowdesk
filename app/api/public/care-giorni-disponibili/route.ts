import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fasceDelGiorno, fasciaOccupata, slotLiberi, type Fascia } from '@/lib/careDisponibilita'

// GET /api/public/care-giorni-disponibili?publicId=xxx&tipoSedutaId=yyy&mese=YYYY-MM
// Restituisce i giorni del mese in cui quel servizio ha almeno uno slot libero,
// così il paziente vede subito dove può prenotare senza aprire giorno per giorno.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const publicId = searchParams.get('publicId')
  const tipoSedutaId = searchParams.get('tipoSedutaId')
  const mese = searchParams.get('mese') // YYYY-MM

  if (!publicId || !mese) return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })

  const user = await prisma.user.findFirst({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const tipo = tipoSedutaId
    ? await prisma.tipoSeduta.findFirst({ where: { id: tipoSedutaId, userId: user.id, attivo: true } })
    : null
  if (tipoSedutaId && !tipo) return NextResponse.json({ error: 'Tipo di seduta non valido' }, { status: 400 })
  const durata = tipo?.durata ?? 45

  const [anno, m] = mese.split('-').map(Number)
  if (!anno || !m || m < 1 || m > 12) return NextResponse.json({ error: 'Mese non valido' }, { status: 400 })
  const giorniNelMese = new Date(Date.UTC(anno, m, 0)).getUTCDate()
  const p = (n: number) => String(n).padStart(2, '0')
  const date = Array.from({ length: giorniNelMese }, (_, i) => `${anno}-${p(m)}-${p(i + 1)}`)

  // Una query sola per tutto il mese, invece di una per giorno
  const da = new Date(Date.UTC(anno, m - 1, 1)); da.setHours(da.getHours() - 12)
  const a = new Date(Date.UTC(anno, m, 1)); a.setHours(a.getHours() + 12)

  const [override, appuntamenti] = await Promise.all([
    prisma.disponibilitaOverride.findMany({
      where: { userId: user.id, data: { gte: da, lte: a } },
      select: { data: true, slots: true },
    }),
    prisma.appuntamento.findMany({
      where: { userId: user.id, status: { not: 'cancellato' }, data: { gte: da, lte: a } },
      select: { data: true, durata: true },
    }),
  ])

  const overridePerGiorno = new Map(
    override.map(o => [o.data.toISOString().slice(0, 10), o.slots]),
  )

  const disponibili = date.filter(data => {
    const ranges = fasceDelGiorno({
      data,
      orariApertura: user.orariApertura,
      overrideSlots: overridePerGiorno.get(data) ?? null,
      tipo,
    })
    if (ranges.length === 0) return false

    const occupati = appuntamenti
      .map(app => fasciaOccupata(app, data))
      .filter((x): x is Fascia => x !== null)

    // Basta sapere che esiste almeno uno slot: non serve calcolarli tutti
    return slotLiberi({ data, ranges, durata, occupati, soloIlPrimo: true }).length > 0
  })

  return NextResponse.json({ giorni: disponibili, durata })
}

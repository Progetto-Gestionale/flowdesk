import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fasceDelGiorno, fasciaOccupata, slotLiberi, type Fascia } from '@/lib/careDisponibilita'

// GET /api/public/care-disponibilita?publicId=xxx&data=YYYY-MM-DD&durata=45&tipoSedutaId=yyy
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const publicId = searchParams.get('publicId')
  const data = searchParams.get('data')
  const durata = Number(searchParams.get('durata') ?? 45)
  const tipoSedutaId = searchParams.get('tipoSedutaId')

  if (!publicId || !data) return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })

  const user = await prisma.user.findFirst({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const override = await prisma.disponibilitaOverride.findUnique({
    where: { userId_data: { userId: user.id, data: new Date(`${data}T00:00:00Z`) } },
  })
  const tipo = tipoSedutaId
    ? await prisma.tipoSeduta.findFirst({ where: { id: tipoSedutaId, userId: user.id } })
    : null

  const ranges = fasceDelGiorno({
    data,
    orariApertura: user.orariApertura,
    overrideSlots: override?.slots ?? null,
    tipo,
  })
  if (ranges.length === 0) return NextResponse.json({ slots: [] })

  // Margine di ±12h per coprire il giorno italiano indipendentemente dal fuso salvato
  const da = new Date(`${data}T00:00:00Z`); da.setHours(da.getHours() - 12)
  const a = new Date(`${data}T23:59:59Z`); a.setHours(a.getHours() + 12)
  const appuntamenti = await prisma.appuntamento.findMany({
    where: { userId: user.id, status: { not: 'cancellato' }, data: { gte: da, lte: a } },
    select: { data: true, durata: true },
  })
  const occupati = appuntamenti
    .map(app => fasciaOccupata(app, data))
    .filter((x): x is Fascia => x !== null)

  return NextResponse.json({ slots: slotLiberi({ data, ranges, durata, occupati }) })
}

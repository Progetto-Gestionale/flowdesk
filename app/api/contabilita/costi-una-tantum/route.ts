import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Costi una tantum / spot (owner-only). Non ricorrenti: legati a un intervallo di date.
// L'importo netto è il TOTALE del periodo; il motore contabile (chiusuraGiorno) lo spalma
// solo sui giorni tra dataInizio e dataFine (inclusa). Vedi model CostoUnaTantum.
const CATEGORIE = ['affitto', 'utenze', 'servizi', 'personale_extra', 'marketing', 'leasing', 'assicurazioni', 'manutenzioni', 'altro']
const ALIQUOTE = [0, 0.04, 0.1, 0.22]

// "YYYY-MM-DD" → Date a mezzanotte UTC (coerente con fatture/turni). Null se non valida.
function parseGiorno(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const costi = await prisma.costoUnaTantum.findMany({
    where: { userId: user.id },
    orderBy: { dataInizio: 'desc' },
  })
  return NextResponse.json({ costi })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const voce = String(b.voce ?? '').trim()
  const importoNetto = Number(b.importoNetto)
  const dataInizio = parseGiorno(b.dataInizio)
  // dataFine opzionale: se assente → singolo giorno (= dataInizio).
  const dataFine = b.dataFine ? parseGiorno(b.dataFine) : dataInizio

  if (!voce) return NextResponse.json({ error: 'Voce obbligatoria' }, { status: 400 })
  if (!Number.isFinite(importoNetto) || importoNetto <= 0) return NextResponse.json({ error: 'Importo non valido' }, { status: 400 })
  if (!dataInizio || !dataFine) return NextResponse.json({ error: 'Date non valide' }, { status: 400 })
  if (dataFine < dataInizio) return NextResponse.json({ error: 'La data fine precede la data inizio' }, { status: 400 })

  const data = {
    voce,
    importoNetto,
    categoria: CATEGORIE.includes(b.categoria) ? b.categoria : 'altro',
    aliquota: ALIQUOTE.includes(Number(b.aliquota)) ? Number(b.aliquota) : 0.22,
    dataInizio,
    dataFine,
  }
  const creato = await prisma.costoUnaTantum.create({ data: { userId: user.id, ...data } })
  return NextResponse.json(creato)
}

export async function DELETE(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 })

  const esistente = await prisma.costoUnaTantum.findFirst({ where: { id, userId: user.id } })
  if (!esistente) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })
  await prisma.costoUnaTantum.delete({ where: { id: esistente.id } })
  return NextResponse.json({ ok: true })
}

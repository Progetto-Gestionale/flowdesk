import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calcolaPeriodo } from '@/lib/contabilita/periodo'

// Fatture/bolle fornitori (F3). Owner-only. Alimentano l'IVA a credito reale del cassetto
// fiscale e il confronto "comprato vs consumato". L'imponibile è netto IVA; l'IVA di ogni
// riga = imponibile × aliquota (calcolata, non salvata: la aliquota è la fonte di verità).
const CATEGORIE = ['merci', 'bevande', 'servizi', 'altro']
const ALIQUOTE = [0, 0.04, 0.1, 0.22]

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const p = calcolaPeriodo(searchParams.get('periodo') ?? 'mese', searchParams.get('riferimento'))
  const fatture = await prisma.fattura.findMany({
    where: { userId: user.id, data: { gte: p.inizio, lt: p.fine } },
    orderBy: { data: 'desc' },
    select: { id: true, fornitore: true, numero: true, data: true, categoria: true, note: true, righe: { select: { imponibile: true, aliquota: true } } },
  })

  // Ogni fattura con i suoi totali (netto, IVA, lordo) già calcolati per la UI.
  const lista = fatture.map(f => {
    const netto = f.righe.reduce((s, r) => s + r.imponibile, 0)
    const iva = f.righe.reduce((s, r) => s + r.imponibile * r.aliquota, 0)
    return { ...f, netto, iva, lordo: netto + iva }
  })
  const totali = {
    netto: lista.reduce((s, f) => s + f.netto, 0),
    iva: lista.reduce((s, f) => s + f.iva, 0),
    numero: lista.length,
  }
  return NextResponse.json({ periodo: p.periodo, label: p.label, fatture: lista, totali })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const data = b.data ? new Date(b.data) : null
  if (!data || isNaN(data.getTime())) return NextResponse.json({ error: 'Data non valida' }, { status: 400 })
  const categoria = CATEGORIE.includes(b.categoria) ? b.categoria : 'merci'

  // Righe: { imponibile > 0, aliquota ∈ {0,4,10,22%} }. Scartiamo quelle vuote/nulle.
  const righeIn = Array.isArray(b.righe) ? b.righe : []
  const righe = righeIn
    .map((r: { imponibile?: unknown; aliquota?: unknown }) => ({
      imponibile: Number(r.imponibile),
      aliquota: Number(r.aliquota),
    }))
    .filter((r: { imponibile: number; aliquota: number }) =>
      Number.isFinite(r.imponibile) && r.imponibile > 0 && ALIQUOTE.includes(r.aliquota))
  if (righe.length === 0) return NextResponse.json({ error: 'Inserisci almeno una riga con imponibile e aliquota' }, { status: 400 })

  const fattura = await prisma.fattura.create({
    data: {
      userId: user.id,
      fornitore: typeof b.fornitore === 'string' && b.fornitore.trim() ? b.fornitore.trim() : null,
      numero: typeof b.numero === 'string' && b.numero.trim() ? b.numero.trim() : null,
      data,
      categoria,
      note: typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null,
      righe: { create: righe },
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: fattura.id })
}

export async function DELETE(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') ?? ''
  const f = await prisma.fattura.findFirst({ where: { id, userId: user.id }, select: { id: true } })
  if (!f) return NextResponse.json({ error: 'Non trovata' }, { status: 404 })
  await prisma.fattura.delete({ where: { id: f.id } }) // le righe cadono in cascata
  return NextResponse.json({ ok: true })
}

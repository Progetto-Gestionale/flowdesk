import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { totaleMensile } from '@/lib/contabilita/costiFissi'

const CATEGORIE = ['affitto', 'utenze', 'servizi', 'personale_extra', 'marketing', 'leasing', 'assicurazioni', 'manutenzioni', 'altro']
const PERIODICITA = ['mensile', 'trimestrale', 'annuale']

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const costi = await prisma.costoFisso.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ costi, totaleMensile: totaleMensile(costi) })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const voce = String(b.voce ?? '').trim()
  const importoNetto = Number(b.importoNetto)
  if (!voce) return NextResponse.json({ error: 'Voce obbligatoria' }, { status: 400 })
  if (!Number.isFinite(importoNetto) || importoNetto < 0) return NextResponse.json({ error: 'Importo non valido' }, { status: 400 })

  const data = {
    voce,
    importoNetto,
    categoria: CATEGORIE.includes(b.categoria) ? b.categoria : 'altro',
    aliquota: [0, 0.04, 0.1, 0.22].includes(Number(b.aliquota)) ? Number(b.aliquota) : 0.22,
    periodicita: PERIODICITA.includes(b.periodicita) ? b.periodicita : 'mensile',
    attivo: b.attivo !== false,
  }

  // Update se arriva un id, altrimenti crea.
  if (b.id) {
    const esistente = await prisma.costoFisso.findFirst({ where: { id: String(b.id), userId: user.id } })
    if (!esistente) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })
    const upd = await prisma.costoFisso.update({ where: { id: esistente.id }, data })
    return NextResponse.json(upd)
  }
  const creato = await prisma.costoFisso.create({ data: { userId: user.id, ...data } })
  return NextResponse.json(creato)
}

export async function DELETE(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 })

  // Scoping esplicito: elimina solo se la riga è del titolare.
  const esistente = await prisma.costoFisso.findFirst({ where: { id, userId: user.id } })
  if (!esistente) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })
  await prisma.costoFisso.delete({ where: { id: esistente.id } })
  return NextResponse.json({ ok: true })
}

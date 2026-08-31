import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { costoOrarioReale } from '@/lib/contabilita/labor'

// Anagrafica retributiva dei dipendenti (paga netta + moltiplicatore costi azienda).
// Owner-only. I dati di paga sono sensibili: mai esposti alle rotte pubbliche dipendente.
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const dip = await prisma.dipendente.findMany({
    where: { userId: user.id },
    orderBy: { ordine: 'asc' },
    select: { id: true, nome: true, ruolo: true, pagaOrariaBaseNetta: true, moltiplicatoreCostoAzienda: true },
  })
  const cfg = await prisma.contabilitaConfig.findUnique({ where: { userId: user.id } })
  return NextResponse.json({
    dipendenti: dip.map(d => ({ ...d, costoOrarioReale: costoOrarioReale(d.pagaOrariaBaseNetta, d.moltiplicatoreCostoAzienda) })),
    moltiplicatoreDefault: cfg?.moltiplicatoreLaborDefault ?? 1.4,
  })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const id = String(b.id ?? '')
  const dip = await prisma.dipendente.findFirst({ where: { id, userId: user.id } })
  if (!dip) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const paga = b.pagaOrariaBaseNetta === null || b.pagaOrariaBaseNetta === '' ? null : Number(b.pagaOrariaBaseNetta)
  if (paga !== null && (!Number.isFinite(paga) || paga < 0)) return NextResponse.json({ error: 'Paga non valida' }, { status: 400 })
  const molt = Number(b.moltiplicatoreCostoAzienda)

  const upd = await prisma.dipendente.update({
    where: { id: dip.id },
    data: {
      pagaOrariaBaseNetta: paga,
      moltiplicatoreCostoAzienda: Number.isFinite(molt) && molt >= 1 ? molt : 1.4,
    },
    select: { id: true, nome: true, pagaOrariaBaseNetta: true, moltiplicatoreCostoAzienda: true },
  })
  return NextResponse.json({ ...upd, costoOrarioReale: costoOrarioReale(upd.pagaOrariaBaseNetta, upd.moltiplicatoreCostoAzienda) })
}

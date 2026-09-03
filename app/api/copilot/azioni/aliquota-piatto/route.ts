import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// ─────────────────────────────────────────────────────────────────────────────
// AZIONE REALE (Fase 2) — imposta l'aliquota IVA di vendita di un piatto (override
// sul singolo piatto: es. alcolici in asporto al 22%). Owner-only, scoped su userId.
// Aliquote ammesse: 4/10/22% oppure null per tornare a ereditare da categoria/default.
// ─────────────────────────────────────────────────────────────────────────────
const ALIQUOTE = [0.04, 0.1, 0.22]

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { piattoId, aliquota } = (await req.json().catch(() => ({}))) as { piattoId?: string; aliquota?: number | null }
  if (!piattoId || typeof piattoId !== 'string') {
    return NextResponse.json({ error: 'piattoId mancante' }, { status: 400 })
  }
  // null = eredita da categoria/default; altrimenti deve essere un'aliquota valida.
  const val = aliquota === null ? null : Number(aliquota)
  if (val !== null && !ALIQUOTE.includes(val)) {
    return NextResponse.json({ error: 'Aliquota non valida' }, { status: 400 })
  }

  const piatto = await prisma.menuPiatto.findFirst({ where: { id: piattoId, userId: user.id }, select: { id: true, nome: true } })
  if (!piatto) return NextResponse.json({ error: 'Piatto non trovato' }, { status: 404 })

  await prisma.menuPiatto.update({ where: { id: piatto.id }, data: { aliquotaVendita: val } })
  return NextResponse.json({ ok: true, nome: piatto.nome, aliquota: val })
}

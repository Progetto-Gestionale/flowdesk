import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// ─────────────────────────────────────────────────────────────────────────────
// AZIONE REALE (Fase 2) — mette un piatto in cima al suo menu (ordine = 0).
// Riusa la stessa logica di POST /api/menu/piatti/ordina, scoped su userId. Il
// frontend chiede conferma prima di chiamare. Idempotente: rieseguirla non rompe
// nulla. Non tocca prezzi né disponibilità: solo l'ordinamento nel menu.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { piattoId } = (await req.json().catch(() => ({}))) as { piattoId?: string }
  if (!piattoId || typeof piattoId !== 'string') {
    return NextResponse.json({ error: 'piattoId mancante' }, { status: 400 })
  }

  // Solo un piatto del titolare (scoping anti cross-tenant).
  const piatto = await prisma.menuPiatto.findFirst({
    where: { id: piattoId, userId: user.id },
    select: { id: true, categoriaId: true, nome: true },
  })
  if (!piatto) return NextResponse.json({ error: 'Piatto non trovato' }, { status: 404 })

  // Ordine attuale dei piatti della stessa categoria, col target messo davanti.
  const piatti = await prisma.menuPiatto.findMany({
    where: { userId: user.id, categoriaId: piatto.categoriaId },
    orderBy: { ordine: 'asc' },
    select: { id: true },
  })
  const ids = [piatto.id, ...piatti.map((p) => p.id).filter((id) => id !== piatto.id)]

  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.menuPiatto.updateMany({ where: { id, userId: user.id }, data: { ordine: i } }),
    ),
  )

  return NextResponse.json({ ok: true, nome: piatto.nome })
}

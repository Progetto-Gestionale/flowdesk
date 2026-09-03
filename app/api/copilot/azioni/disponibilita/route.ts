import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// ─────────────────────────────────────────────────────────────────────────────
// AZIONE REALE (Fase 2) — segna un piatto come esaurito o di nuovo disponibile.
// Owner-only, scoped su userId. Conferma esplicita nel frontend prima di chiamare.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { piattoId, disponibile } = (await req.json().catch(() => ({}))) as { piattoId?: string; disponibile?: boolean }
  if (!piattoId || typeof piattoId !== 'string' || typeof disponibile !== 'boolean') {
    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 })
  }

  const piatto = await prisma.menuPiatto.findFirst({ where: { id: piattoId, userId: user.id }, select: { id: true, nome: true } })
  if (!piatto) return NextResponse.json({ error: 'Piatto non trovato' }, { status: 404 })

  await prisma.menuPiatto.update({ where: { id: piatto.id }, data: { disponibile } })
  return NextResponse.json({ ok: true, nome: piatto.nome, disponibile })
}

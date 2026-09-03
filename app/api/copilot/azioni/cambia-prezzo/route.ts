import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// ─────────────────────────────────────────────────────────────────────────────
// AZIONE REALE (Fase 2) — cambia il prezzo (LORDO, quello che paga il cliente) di
// un piatto. Owner-only, scoped su userId. Il frontend mostra "da X a Y" e chiede
// conferma con prezzo modificabile PRIMA di chiamare: l'AI propone, decide il titolare.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { piattoId, nuovoPrezzo } = (await req.json().catch(() => ({}))) as { piattoId?: string; nuovoPrezzo?: number }
  if (!piattoId || typeof piattoId !== 'string') {
    return NextResponse.json({ error: 'piattoId mancante' }, { status: 400 })
  }
  const prezzo = Number(nuovoPrezzo)
  if (!Number.isFinite(prezzo) || prezzo <= 0 || prezzo > 100000) {
    return NextResponse.json({ error: 'Prezzo non valido' }, { status: 400 })
  }

  const piatto = await prisma.menuPiatto.findFirst({
    where: { id: piattoId, userId: user.id },
    select: { id: true, nome: true, prezzo: true },
  })
  if (!piatto) return NextResponse.json({ error: 'Piatto non trovato' }, { status: 404 })

  const prezzoArrotondato = Math.round(prezzo * 100) / 100
  await prisma.menuPiatto.update({ where: { id: piatto.id }, data: { prezzo: prezzoArrotondato } })

  return NextResponse.json({ ok: true, nome: piatto.nome, prezzoVecchio: piatto.prezzo, prezzoNuovo: prezzoArrotondato })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// POST — scioglie manualmente un conto unito (GruppoTavoli) SENZA chiuderlo.
// Gli ordini aperti tornano ai loro singoli tavoli (gruppoId=null, etichetta "T<numero>"),
// il gruppo viene eliminato. Speculare a /api/tavoli/unisci-conti.
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { gruppoId } = await req.json()
  if (!gruppoId) return NextResponse.json({ error: 'gruppoId richiesto' }, { status: 400 })

  const gruppo = await prisma.gruppoTavoli.findFirst({
    where: { id: gruppoId, userId: user.id },
    include: { tavoli: { select: { id: true, numero: true } } },
  })
  if (!gruppo) return NextResponse.json({ error: 'Gruppo non trovato' }, { status: 404 })

  // Ogni ordine aperto torna al suo tavolo con l'etichetta singola "T<numero>"
  for (const t of gruppo.tavoli) {
    await prisma.ordine.updateMany({
      where: { userId: user.id, gruppoId, tavoloId: t.id, status: { notIn: ['chiuso'] } },
      data: { gruppoId: null, tavolo: `T${t.numero}` },
    })
  }
  // Eventuali ordini aperti nel gruppo senza tavolo corrispondente: stacca comunque
  await prisma.ordine.updateMany({
    where: { userId: user.id, gruppoId, status: { notIn: ['chiuso'] } },
    data: { gruppoId: null },
  })

  // Elimina il gruppo (libera i tavoli via SetNull sulla relazione)
  await prisma.gruppoTavoli.delete({ where: { id: gruppoId } })

  return NextResponse.json({ ok: true })
}

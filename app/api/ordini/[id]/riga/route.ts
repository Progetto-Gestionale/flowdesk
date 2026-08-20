import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'
import { repartoPerPiatti } from '@/lib/reparti'

async function ricalcolaTotale(id: string) {
  const righe = await prisma.rigaOrdine.findMany({ where: { ordineId: id } })
  const totale = righe.reduce((s, r) => s + r.prezzo * r.quantita, 0)
  return prisma.ordine.update({ where: { id }, data: { totale }, include: { righe: true } })
}

// POST — aggiunge una riga a un ordine
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const { piattoId, nome, prezzo, quantita = 1, note = '' } = await req.json()
  if (!piattoId || !nome || prezzo == null) return NextResponse.json({ error: 'piattoId, nome e prezzo richiesti' }, { status: 400 })

  // Se esiste già la stessa riga (stesso piattoId, stessa nota) aumenta la quantità
  const esistente = await prisma.rigaOrdine.findFirst({
    where: { ordineId: id, piattoId, note: note ?? '' },
  })
  if (esistente) {
    await prisma.rigaOrdine.update({ where: { id: esistente.id }, data: { quantita: esistente.quantita + quantita } })
  } else {
    const repMap = await repartoPerPiatti([piattoId])
    await prisma.rigaOrdine.create({
      data: { ordineId: id, piattoId, nome, prezzo: parseFloat(prezzo), quantita, note: note ?? '', reparto: repMap[piattoId] ?? null },
    })
  }

  const ordine = await ricalcolaTotale(id)
  return NextResponse.json({ ordine })
}

// DELETE — rimuove una riga da un ordine
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const { rigaId } = await req.json()
  if (!rigaId) return NextResponse.json({ error: 'rigaId richiesto' }, { status: 400 })

  await prisma.rigaOrdine.delete({ where: { id: rigaId } })
  const ordine = await ricalcolaTotale(id)
  return NextResponse.json({ ordine })
}

// PATCH — modifica quantità di una riga
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const { rigaId, quantita } = await req.json()
  if (!rigaId || quantita == null) return NextResponse.json({ error: 'rigaId e quantita richiesti' }, { status: 400 })

  if (quantita <= 0) {
    await prisma.rigaOrdine.delete({ where: { id: rigaId } })
  } else {
    await prisma.rigaOrdine.update({ where: { id: rigaId }, data: { quantita } })
  }

  const ordine = await ricalcolaTotale(id)
  return NextResponse.json({ ordine })
}

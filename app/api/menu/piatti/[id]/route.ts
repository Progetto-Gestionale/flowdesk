import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'
import { normQuantita, normSoglia, normEtichetta, normColore } from '@/lib/menuPiatto'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const data = await req.json()
  if (data.prezzo) data.prezzo = parseFloat(data.prezzo)
  // Sanitizza i nuovi campi solo se presenti (il quick-edit inline invia es. solo { quantita }).
  if ('quantita' in data) data.quantita = normQuantita(data.quantita)
  if ('quantitaSoglia' in data) data.quantitaSoglia = normSoglia(data.quantitaSoglia)
  if ('etichetta' in data) data.etichetta = normEtichetta(data.etichetta)
  if ('etichettaColore' in data) data.etichettaColore = normColore(data.etichettaColore)
  // Il piatto deve appartenere all'utente: updateMany con guardia su userId (evita modifiche cross-account).
  const res = await prisma.menuPiatto.updateMany({ where: { id, userId: user.id }, data })
  if (res.count === 0) return NextResponse.json({ error: 'Piatto non trovato' }, { status: 404 })
  const piatto = await prisma.menuPiatto.findUnique({ where: { id } })
  return NextResponse.json({ piatto })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  try {
    // onDelete SetNull sulle righe ordine: il piatto si può eliminare anche se già
    // ordinato (le righe storiche conservano nome/prezzo, perdono solo il link).
    await prisma.menuPiatto.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[MENU/PIATTI] errore delete:', e)
    return NextResponse.json({ error: 'Impossibile eliminare il piatto. Riprova.' }, { status: 500 })
  }
}

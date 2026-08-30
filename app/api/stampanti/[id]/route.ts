import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  // Whitelist dei campi modificabili.
  const data: Record<string, unknown> = {}
  if (typeof body.nome === 'string') data.nome = body.nome.trim()
  if (typeof body.reparto === 'string') data.reparto = body.reparto.trim()
  if ('indirizzo' in body) data.indirizzo = body.indirizzo?.trim() || null
  if (body.tipo === 'rete' || body.tipo === 'altro') data.tipo = body.tipo
  if (typeof body.attiva === 'boolean') data.attiva = body.attiva
  await prisma.stampante.updateMany({ where: { id, userId: user.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  // I PrintJob restano (storico coda); la loro stampanteId va a null (onDelete: SetNull).
  await prisma.stampante.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const data = await req.json()
  const categoria = await prisma.menuCategoria.update({ where: { id }, data })
  return NextResponse.json({ categoria })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  try {
    await prisma.menuPiatto.deleteMany({ where: { categoriaId: id } })
    await prisma.menuCategoria.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[MENU/CATEGORIE] errore delete:', e)
    return NextResponse.json({ error: 'Impossibile eliminare la categoria. Riprova.' }, { status: 500 })
  }
}

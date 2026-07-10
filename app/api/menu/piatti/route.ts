import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { categoriaId, nome, descrizione, prezzo, immagineUrl } = await req.json()
  const count = await prisma.menuPiatto.count({ where: { categoriaId } })
  const piatto = await prisma.menuPiatto.create({
    data: { userId: user.id, categoriaId, nome, descrizione, prezzo: parseFloat(prezzo), immagineUrl, ordine: count },
  })
  return NextResponse.json({ piatto })
}

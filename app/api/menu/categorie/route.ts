import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo') ?? 'locale'
  const categorie = await prisma.menuCategoria.findMany({
    where: { userId: user.id, tipo },
    include: { piatti: { orderBy: { ordine: 'asc' } } },
    orderBy: { ordine: 'asc' },
  })
  return NextResponse.json({ categorie })
}

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { nome, tipo = 'locale' } = await req.json()
  const count = await prisma.menuCategoria.count({ where: { userId: user.id, tipo } })
  const categoria = await prisma.menuCategoria.create({
    data: { userId: user.id, nome, ordine: count, tipo },
  })
  return NextResponse.json({ categoria })
}

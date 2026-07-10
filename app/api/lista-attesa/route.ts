import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const url = new URL(req.url)
  const soloAttivi = url.searchParams.get('attivi') === 'true'
  const lista = await prisma.listaAttesa.findMany({
    where: {
      userId: user.id,
      ...(soloAttivi ? { status: 'in_attesa' } : {}),
    },
    orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json({ lista })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { clienteNome, clienteEmail, clienteTel, data, ora, coperti, note } = await req.json()
  const item = await prisma.listaAttesa.create({
    data: {
      userId: user.id,
      clienteNome,
      clienteEmail,
      clienteTel,
      data: new Date(data),
      ora,
      coperti: coperti ?? 1,
      note,
    },
  })
  return NextResponse.json({ item })
}

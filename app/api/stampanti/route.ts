import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// Stampanti del locale (CRUD). Transport-agnostiche: qui si registra solo dove/cosa serve.
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const stampanti = await prisma.stampante.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ stampanti })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { nome, reparto, indirizzo, tipo, attiva } = await req.json()
  if (!nome?.trim() || !reparto?.trim()) {
    return NextResponse.json({ error: 'nome e reparto richiesti' }, { status: 400 })
  }
  const stampante = await prisma.stampante.create({
    data: {
      userId: user.id,
      nome: nome.trim(),
      reparto: reparto.trim(),
      indirizzo: indirizzo?.trim() || null,
      tipo: tipo === 'altro' ? 'altro' : 'rete',
      attiva: attiva !== false,
    },
  })
  return NextResponse.json({ stampante })
}

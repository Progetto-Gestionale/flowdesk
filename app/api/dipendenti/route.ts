import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const dipendenti = await prisma.dipendente.findMany({
    where: { userId: user.id },
    orderBy: { nome: 'asc' },
  })
  return NextResponse.json({ dipendenti })
}

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { nome, email, ruolo, fotoUrl } = await req.json()
  if (!nome || !email) return NextResponse.json({ error: 'Nome e email obbligatori' }, { status: 400 })
  try {
    const dipendente = await prisma.dipendente.create({
      data: { userId: user.id, nome, email, ruolo: ruolo || null, fotoUrl: fotoUrl || null },
    })
    return NextResponse.json({ dipendente })
  } catch (e: any) {
    console.error('Errore creazione dipendente:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

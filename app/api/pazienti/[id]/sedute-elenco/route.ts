import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Elenco unificato delle sedute di un paziente per la tendina "collega a una seduta":
// gli appuntamenti in agenda (anche non ancora svolti) e le sedute inserite a mano
// in cartella, che non hanno un appuntamento dietro.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ sedute: [] })

  const [appuntamenti, sedute] = await Promise.all([
    prisma.appuntamento.findMany({
      where: { userId: user.id, pazienteId: id, status: { not: 'cancellato' } },
      orderBy: { data: 'desc' },
      select: { id: true, data: true, servizio: true, status: true },
    }),
    prisma.seduta.findMany({
      where: { userId: user.id, pazienteId: id, appuntamentoId: null },
      orderBy: { data: 'desc' },
      select: { id: true, data: true, tipo: true },
    }),
  ])

  const voci = [
    ...appuntamenti.map(a => ({
      chiave: `app:${a.id}`,
      appuntamentoId: a.id,
      sedutaId: null as string | null,
      data: a.data,
      tipo: a.servizio,
      completata: a.status === 'completato',
    })),
    ...sedute.map(s => ({
      chiave: `sed:${s.id}`,
      appuntamentoId: null as string | null,
      sedutaId: s.id,
      data: s.data,
      tipo: s.tipo,
      completata: true,
    })),
  ].sort((x, y) => new Date(y.data).getTime() - new Date(x.data).getTime())

  return NextResponse.json({ sedute: voci })
}

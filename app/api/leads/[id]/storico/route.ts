import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const lead = await prisma.lead.findFirst({ where: { id, userId: user.id } })
  if (!lead) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const [richieste, appuntamenti] = await Promise.all([
    prisma.preventivo.findMany({ where: { leadId: id, userId: user.id }, orderBy: { createdAt: 'desc' } }),
    lead.email
      ? prisma.appuntamento.findMany({ where: { clienteEmail: lead.email, userId: user.id }, orderBy: { data: 'desc' } })
      : Promise.resolve([]),
  ])

  const richiesteAccettate = richieste.filter(r => r.status === 'accettato')
  const spesaTotale = richiesteAccettate.reduce((sum, r) => sum + r.totale, 0)
  const ultimaVisita = appuntamenti.find(a => a.status === 'completato')?.data ?? null
  const noShow = appuntamenti.filter(a => a.status === 'no_show').length

  // Preferenze ricorrenti: le descrizioni più frequenti dagli items
  const descrizioni: string[] = []
  for (const r of richieste) {
    try {
      const items = JSON.parse(r.items) as { descrizione: string }[]
      items.forEach(i => { if (i.descrizione) descrizioni.push(i.descrizione) })
    } catch { /* ignora */ }
  }

  return NextResponse.json({
    totaleRichieste: richieste.length,
    richiesteAccettate: richiesteAccettate.length,
    spesaTotale,
    totaleAppuntamenti: appuntamenti.length,
    ultimaVisita,
    noShow,
    richieste: richieste.slice(0, 5),
    appuntamenti: appuntamenti.slice(0, 5),
  })
}

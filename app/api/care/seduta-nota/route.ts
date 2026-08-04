import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { creaNotifica } from '@/lib/notifiche'

// PATCH { appuntamentoId? , sedutaId?, note }
//
// La nota di una seduta è la stessa cosa vista da tre punti diversi (calendario,
// prossimi appuntamenti, storico sedute). Qui si scrive su entrambi i record
// collegati, così non esistono due versioni della stessa nota.
export async function PATCH(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const { appuntamentoId, sedutaId, note } = await req.json()
  if (!appuntamentoId && !sedutaId) {
    return NextResponse.json({ error: 'Serve un appuntamento o una seduta' }, { status: 400 })
  }
  const testo: string | null = typeof note === 'string' && note.trim() ? note.trim() : null

  // Risale all'altra metà della coppia, se esiste
  let idApp: string | null = appuntamentoId ?? null
  let idSeduta: string | null = sedutaId ?? null

  if (idApp && !idSeduta) {
    const s = await prisma.seduta.findFirst({
      where: { appuntamentoId: idApp, userId: user.id }, select: { id: true },
    })
    idSeduta = s?.id ?? null
  } else if (idSeduta && !idApp) {
    const s = await prisma.seduta.findFirst({
      where: { id: idSeduta, userId: user.id }, select: { appuntamentoId: true },
    })
    idApp = s?.appuntamentoId ?? null
  }

  if (idApp) {
    await prisma.appuntamento.updateMany({ where: { id: idApp, userId: user.id }, data: { note: testo } })
  }
  if (idSeduta) {
    await prisma.seduta.updateMany({ where: { id: idSeduta, userId: user.id }, data: { note: testo } })
  }

  await creaNotifica(user.id, {
    tipo: 'seduta',
    titolo: testo ? 'Nota della seduta aggiornata' : 'Nota della seduta rimossa',
    dettaglio: testo ? testo.slice(0, 80) : undefined,
    link: '/care/dashboard/calendario',
  })

  return NextResponse.json({ ok: true, appuntamentoId: idApp, sedutaId: idSeduta })
}

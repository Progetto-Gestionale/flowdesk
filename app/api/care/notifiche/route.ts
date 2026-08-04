import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GIORNI_CONSERVAZIONE } from '@/lib/notifiche'
import { romeWallTimeToDate } from '@/lib/romeTime'

// GET — tutte le notifiche ancora valide, più recenti prima.
// La pulizia delle vecchie avviene qui: niente cron da tenere in piedi, e
// l'utente le vede sparire esattamente quando scadono.
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ notifiche: [] })

  const scadenza = new Date(Date.now() - GIORNI_CONSERVAZIONE * 24 * 60 * 60 * 1000)
  await prisma.notifica.deleteMany({ where: { userId: user.id, createdAt: { lt: scadenza } } })

  const notifiche = await prisma.notifica.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    notifiche,
    daLeggere: notifiche.filter(n => !n.letta).length,
  })
}

// PATCH { ids?: string[] } — segna come lette quelle indicate, o tutte se manca `ids`.
export async function PATCH(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const { ids } = await req.json().catch(() => ({ ids: undefined }))

  await prisma.notifica.updateMany({
    where: { userId: user.id, letta: false, ...(Array.isArray(ids) ? { id: { in: ids } } : {}) },
    data: { letta: true },
  })

  return NextResponse.json({ ok: true })
}

// DELETE ?id=xxx | ?giorno=YYYY-MM-DD | (niente) = tutte
export async function DELETE(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const giorno = searchParams.get('giorno')

  if (id) {
    await prisma.notifica.deleteMany({ where: { id, userId: user.id } })
  } else if (giorno) {
    // Il giorno arriva in ora italiana (è così che le raggruppa la pagina):
    // gli estremi vanno convertiti, o su Vercel — che gira in UTC — si cancella
    // la fascia sbagliata a cavallo della mezzanotte.
    const inizio = romeWallTimeToDate(giorno, '00:00')
    const fine = new Date(romeWallTimeToDate(giorno, '23:59').getTime() + 59_999)
    await prisma.notifica.deleteMany({
      where: { userId: user.id, createdAt: { gte: inizio, lte: fine } },
    })
  } else {
    await prisma.notifica.deleteMany({ where: { userId: user.id } })
  }

  return NextResponse.json({ ok: true })
}

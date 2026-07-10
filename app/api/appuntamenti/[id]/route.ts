import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  // Gestione assegnazione tavoli (singolo o multiplo)
  if ('tavoliIds' in body) {
    const ids: string[] = body.tavoliIds ?? []
    let tavoloId: string | null = null
    const tavoliIdsJson: string = JSON.stringify(ids)

    if (ids.length === 1) {
      tavoloId = ids[0]
    }

    // Elimina eventuali gruppi auto precedenti che contengono questi stessi tavoli
    const appCorrente = await prisma.appuntamento.findFirst({ where: { id, userId: user.id } })
    if (appCorrente && ids.length > 0) {
      const vecchiGruppi = await prisma.gruppoTavoli.findMany({
        where: { userId: user.id, auto: true, tavoli: { some: { id: { in: ids } } } },
        select: { id: true },
      })
      if (vecchiGruppi.length > 0) {
        await prisma.gruppoTavoli.deleteMany({ where: { id: { in: vecchiGruppi.map(g => g.id) } } })
      }
    }

    // Con 2+ tavoli creiamo un GruppoTavoli auto per far unire gli ordini QR
    if (ids.length >= 2 && appCorrente) {
      const localApp = new Date(appCorrente.data.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
      const dataStr = `${localApp.getFullYear()}-${String(localApp.getMonth() + 1).padStart(2, '0')}-${String(localApp.getDate()).padStart(2, '0')}`
      const minutiApp = localApp.getHours() * 60 + localApp.getMinutes()

      // Trova il turno di servizio corrispondente all'orario della prenotazione
      let turnoId: string | null = null
      try {
        const turni: { id: string; oraInizio: string; oraFine: string }[] = JSON.parse(user.turniServizio ?? '[]')
        function toMin(t: string) { const [h, m] = t.split(':').map(Number); const v = h*60+m; return v===0?1440:v }
        const turno = turni.find(t => minutiApp >= toMin(t.oraInizio) && minutiApp < toMin(t.oraFine))
        turnoId = turno?.id ?? null
      } catch {}

      const tavoli = await prisma.tavolo.findMany({ where: { id: { in: ids } }, orderBy: { numero: 'asc' } })
      const label = tavoli.map(t => t.numero).join('+')
      await prisma.gruppoTavoli.create({
        data: {
          userId: user.id,
          label,
          data: dataStr,
          turnoId,
          auto: true,
          tavoli: { connect: ids.map((tid: string) => ({ id: tid })) },
        },
      })
    }

    await prisma.appuntamento.update({
      where: { id },
      data: { tavoloId, tavoliIds: tavoliIdsJson },
    })
    return NextResponse.json({ ok: true })
  }

  // Aggiornamento generico (status, note, ecc.)
  const { tavoliIds: _ignored, ...data } = body

  if (data.tavoloId) {
    const corrente = await prisma.appuntamento.findFirst({ where: { id, userId: user.id } })
    if (corrente) {
      const fineNuovo = new Date(corrente.data.getTime() + corrente.durata * 60000)
      const conflitto = await prisma.appuntamento.findFirst({
        where: { userId: user.id, tavoloId: data.tavoloId, id: { not: id }, status: { notIn: ['cancellato'] }, data: { lt: fineNuovo } },
      })
      if (conflitto) {
        const fineConflitto = new Date(conflitto.data.getTime() + conflitto.durata * 60000)
        if (fineConflitto > corrente.data)
          return NextResponse.json({ error: 'Tavolo già occupato in questo orario', conflitto: true }, { status: 409 })
      }
    }
  }

  await prisma.appuntamento.updateMany({ where: { id, userId: user.id }, data })

  // Quando un appuntamento viene concluso (completato/cancellato/no_show), aggiorna la richiesta collegata
  if (data.status && ['completato', 'cancellato', 'no_show'].includes(data.status)) {
    const app = await prisma.appuntamento.findFirst({
      where: { id, userId: user.id },
      select: { note: true },
    })
    if (app?.note) {
      const match = app.note.match(/Da richiesta #(\d+)/)
      if (match) {
        const numero = parseInt(match[1])
        const nuovoStatus = data.status === 'completato' ? 'concluso_completato'
          : data.status === 'cancellato' ? 'concluso_cancellato'
          : 'concluso_no_show'
        await prisma.preventivo.updateMany({
          where: {
            userId: user.id,
            numero,
            status: { notIn: ['concluso_completato', 'concluso_cancellato', 'concluso_no_show'] },
          },
          data: { status: nuovoStatus },
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
  await prisma.appuntamento.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function toMin(t: string) { const [h, m] = t.split(':').map(Number); const v = h * 60 + m; return v === 0 ? 1440 : v }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const { tavoliIds } = await req.json()

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const preventivo = await prisma.preventivo.findFirst({ where: { id, userId: user.id } })
  if (!preventivo) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const ids: string[] = tavoliIds ?? []
  const numStr = `#${String(preventivo.numero).padStart(3, '0')}`

  // Salva tavoliIds sul preventivo
  await prisma.preventivo.update({ where: { id }, data: { tavoliIds: JSON.stringify(ids) } })

  if (ids.length === 0) return NextResponse.json({ ok: true })

  // Cerca o crea appuntamento collegato
  let app = await prisma.appuntamento.findFirst({
    where: { userId: user.id, note: { contains: numStr } },
  })

  if (!app) {
    const note = preventivo.note ?? ''
    const dataMatch = note.match(/DATA_ISO:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)
    const copertiMatch = note.match(/Coperti:\s*(\d+)/)
    const items = (() => { try { return JSON.parse(preventivo.items) as Array<{ coperti?: number }> } catch { return [] } })()
    const coperti = items[0]?.coperti ?? (copertiMatch ? parseInt(copertiMatch[1]) : 2)
    const dataISO = dataMatch ? new Date(dataMatch[1]).toISOString() : new Date().toISOString()

    app = await prisma.appuntamento.create({
      data: {
        userId: user.id,
        clienteNome: preventivo.clienteName,
        clienteEmail: preventivo.clienteEmail ?? undefined,
        servizio: 'Prenotazione tavolo',
        data: new Date(dataISO),
        durata: 90,
        note: `Da richiesta ${numStr}`,
        coperti,
      },
    })
  }

  // Rimuovi gruppi auto precedenti che contengono questi tavoli
  const vecchiGruppi = await prisma.gruppoTavoli.findMany({
    where: { userId: user.id, auto: true, tavoli: { some: { id: { in: ids } } } },
    select: { id: true },
  })
  if (vecchiGruppi.length > 0) {
    await prisma.gruppoTavoli.deleteMany({ where: { id: { in: vecchiGruppi.map(g => g.id) } } })
  }

  // Con 2+ tavoli crea GruppoTavoli auto
  if (ids.length >= 2) {
    const localApp = new Date(app.data.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
    const dataStr = `${localApp.getFullYear()}-${String(localApp.getMonth() + 1).padStart(2, '0')}-${String(localApp.getDate()).padStart(2, '0')}`
    const minutiApp = localApp.getHours() * 60 + localApp.getMinutes()
    let turnoId: string | null = null
    try {
      const turni: { id: string; oraInizio: string; oraFine: string }[] = JSON.parse(user.turniServizio ?? '[]')
      const turno = turni.find(t => minutiApp >= toMin(t.oraInizio) && minutiApp < toMin(t.oraFine))
      turnoId = turno?.id ?? null
    } catch {}
    const tavoli = await prisma.tavolo.findMany({ where: { id: { in: ids } }, orderBy: { numero: 'asc' } })
    await prisma.gruppoTavoli.create({
      data: {
        userId: user.id,
        label: tavoli.map(t => t.numero).join('+'),
        data: dataStr,
        turnoId,
        auto: true,
        tavoli: { connect: ids.map(tid => ({ id: tid })) },
      },
    })
  }

  // Aggiorna appuntamento con tavolo/i
  await prisma.appuntamento.update({
    where: { id: app.id },
    data: {
      tavoloId: ids.length === 1 ? ids[0] : null,
      tavoliIds: JSON.stringify(ids),
    },
  })

  return NextResponse.json({ ok: true, appuntamentoId: app.id })
}

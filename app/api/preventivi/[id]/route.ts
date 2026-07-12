import { getAuthUser, getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmailConferma, sendEmailRifiuto } from '@/lib/email'
import { randomBytes } from 'crypto'

const LEAD_STATUS_MAP: Record<string, string> = {
  inviato: 'proposta',
  accettato: 'chiuso',
  rifiutato: 'nuovo',
}

function extractDatiEmail(preventivo: { items: string; note?: string | null }) {
  const items = JSON.parse(preventivo.items ?? '[]') as Array<{ descrizione?: string; coperti?: number; allergie?: string; occasione?: string }>
  const note = preventivo.note ?? ''
  const dataMatch = note.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)
  const oraMatch = note.match(/ORA_ISO:(\d{2}:\d{2})/)
  const copertiNote = note.match(/Coperti:\s*(\d+)/)
  const allergieNote = note.match(/Allergie:\s*([^.]+)/)
  const occasioneNote = note.match(/Occasione:\s*([^.]+)/)
  return {
    data: dataMatch?.[1],
    ora: oraMatch?.[1],
    coperti: items[0]?.coperti ?? (copertiNote ? parseInt(copertiNote[1]) : undefined),
    allergie: items[0]?.allergie ?? allergieNote?.[1]?.trim(),
    occasione: items[0]?.occasione ?? occasioneNote?.[1]?.trim(),
    servizio: items[0]?.descrizione,
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const data = await req.json()
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const preventivo = await prisma.preventivo.findFirst({ where: { id, userId: user.id } })
  if (!preventivo) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  // Gestione speciale: invio proposta con token
  if (data._azione === 'proposta') {
    const token = randomBytes(24).toString('hex')
    const { sendEmailProposta } = await import('@/lib/email')
    const dati = extractDatiEmail({ ...preventivo, ...data })
    await prisma.preventivo.update({
      where: { id },
      data: {
        status: 'inviato',
        tokenRisposta: token,
        messaggioProposta: data.messaggio ?? null,
        note: data.note ?? preventivo.note,
        items: data.items ?? preventivo.items,
      },
    })
    if (preventivo.leadId) {
      await prisma.lead.updateMany({ where: { id: preventivo.leadId, userId: user.id }, data: { status: 'proposta' } })
    }
    if (preventivo.clienteEmail) {
      await sendEmailProposta({
        clienteEmail: preventivo.clienteEmail,
        clienteNome: preventivo.clienteName,
        nomeLocale: user.nomeLocale ?? 'Il locale',
        tipo: preventivo.tipo,
        token,
        messaggio: data.messaggio,
        ...dati,
      })
    }
    return NextResponse.json({ ok: true })
  }

  const updateData: Record<string, unknown> = {}
  if (data.status !== undefined) updateData.status = data.status
  if (data.note !== undefined) updateData.note = data.note
  if (data.items !== undefined) updateData.items = typeof data.items === 'string' ? data.items : JSON.stringify(data.items)
  if (data.totale !== undefined) updateData.totale = data.totale
  if (data.clienteName !== undefined) updateData.clienteName = data.clienteName
  if (data.clienteEmail !== undefined) updateData.clienteEmail = data.clienteEmail
  if (data.tipo !== undefined) updateData.tipo = data.tipo
  if (data.tavoliIds !== undefined) updateData.tavoliIds = data.tavoliIds

  await prisma.preventivo.updateMany({ where: { id, userId: user.id }, data: updateData })

  // Sincronizza lead
  if (data.status && LEAD_STATUS_MAP[data.status] && preventivo.leadId) {
    const leadUpdate: Record<string, unknown> = { status: LEAD_STATUS_MAP[data.status] }
    // Se accettato, assicura che il lead sia visibile in pipeline (non cancellato)
    if (data.status === 'accettato') leadUpdate.cancellato = false
    await prisma.lead.updateMany({
      where: { id: preventivo.leadId, userId: user.id },
      data: leadUpdate,
    })
  }

  // Email accettato
  if (data.status === 'accettato' && preventivo.clienteEmail) {
    const dati = extractDatiEmail(preventivo)
    await sendEmailConferma({
      clienteEmail: preventivo.clienteEmail,
      clienteNome: preventivo.clienteName,
      nomeLocale: user.nomeLocale ?? 'Il locale',
      tipo: preventivo.tipo,
      ...dati,
    })
  }

  // Email rifiutato
  if (data.status === 'rifiutato' && preventivo.clienteEmail) {
    await sendEmailRifiuto({
      clienteEmail: preventivo.clienteEmail,
      clienteNome: preventivo.clienteName,
      nomeLocale: user.nomeLocale ?? 'Il locale',
      tipo: preventivo.tipo,
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  await prisma.preventivo.deleteMany({ where: { id, userId: user.id } })
  return NextResponse.json({ ok: true })
}

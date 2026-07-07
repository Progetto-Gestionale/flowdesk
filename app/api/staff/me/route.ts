import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token mancante' }, { status: 401 })

  const dipendente = await prisma.dipendente.findUnique({
    where: { token },
    include: {
      turni: { orderBy: { data: 'asc' } },
      richieste: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!dipendente) return NextResponse.json({ error: 'Token non valido' }, { status: 401 })
  if (dipendente.tokenExpiry && dipendente.tokenExpiry < new Date())
    return NextResponse.json({ error: 'Link scaduto' }, { status: 401 })

  return NextResponse.json({ dipendente })
}

export async function POST(req: Request) {
  // Invia richiesta (assenza o preferenza)
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token mancante' }, { status: 401 })

  const dipendente = await prisma.dipendente.findUnique({ where: { token } })
  if (!dipendente) return NextResponse.json({ error: 'Token non valido' }, { status: 401 })
  if (dipendente.tokenExpiry && dipendente.tokenExpiry < new Date())
    return NextResponse.json({ error: 'Link scaduto' }, { status: 401 })

  const { tipo, data, dataFine, note, oraInizio, oraFine } = await req.json()
  const richiesta = await prisma.richiestaDipendente.create({
    data: {
      dipendenteId: dipendente.id,
      tipo,
      data: data ? new Date(data) : null,
      dataFine: dataFine ? new Date(dataFine) : null,
      note,
      oraInizio: oraInizio || null,
      oraFine: oraFine || null,
    },
  })
  return NextResponse.json({ richiesta })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token mancante' }, { status: 401 })

  const dipendente = await prisma.dipendente.findUnique({ where: { token } })
  if (!dipendente) return NextResponse.json({ error: 'Token non valido' }, { status: 401 })
  if (dipendente.tokenExpiry && dipendente.tokenExpiry < new Date())
    return NextResponse.json({ error: 'Link scaduto' }, { status: 401 })

  const { id, tipo, data, dataFine, note, oraInizio, oraFine } = await req.json()
  const richiesta = await prisma.richiestaDipendente.findFirst({ where: { id, dipendenteId: dipendente.id } })
  if (!richiesta) return NextResponse.json({ error: 'Richiesta non trovata' }, { status: 404 })
  if (richiesta.status !== 'in_attesa') return NextResponse.json({ error: 'Non modificabile' }, { status: 403 })

  const updated = await prisma.richiestaDipendente.update({
    where: { id },
    data: { tipo, data: data ? new Date(data) : null, dataFine: dataFine ? new Date(dataFine) : null, note, oraInizio: oraInizio || null, oraFine: oraFine || null },
  })
  return NextResponse.json({ richiesta: updated })
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const richiestaId = url.searchParams.get('richiestaId')
  if (!token || !richiestaId) return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })

  const dipendente = await prisma.dipendente.findUnique({ where: { token } })
  if (!dipendente) return NextResponse.json({ error: 'Token non valido' }, { status: 401 })
  if (dipendente.tokenExpiry && dipendente.tokenExpiry < new Date())
    return NextResponse.json({ error: 'Link scaduto' }, { status: 401 })

  const richiesta = await prisma.richiestaDipendente.findFirst({ where: { id: richiestaId, dipendenteId: dipendente.id } })
  if (!richiesta) return NextResponse.json({ error: 'Richiesta non trovata' }, { status: 404 })
  // preferenza_orario sempre eliminabile; le altre solo se in_attesa
  if (richiesta.tipo !== 'preferenza_orario' && richiesta.status !== 'in_attesa')
    return NextResponse.json({ error: 'Non eliminabile' }, { status: 403 })

  await prisma.richiestaDipendente.delete({ where: { id: richiestaId } })
  return NextResponse.json({ ok: true })
}

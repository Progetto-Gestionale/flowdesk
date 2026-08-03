import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// I file caricati vivono nel DB in base64: niente storage esterno da configurare.
// Oltre questa soglia conviene un link esterno (Drive, Dropbox…).
const MAX_BYTE = 3 * 1024 * 1024

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  // `contenuto` è escluso di proposito: pesa MB e in lista non serve
  const documenti = await prisma.documentoPaziente.findMany({
    where: { pazienteId: id, userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, nome: true, url: true, tipo: true, mimeType: true, dimensione: true, createdAt: true },
  })

  return NextResponse.json({ documenti })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const paziente = await prisma.paziente.findFirst({ where: { id, userId: user.id } })
  if (!paziente) return NextResponse.json({ error: 'Paziente non trovato' }, { status: 404 })

  const { nome, url, tipo, contenuto, mimeType, dimensione } = await req.json()
  if (!nome?.trim()) return NextResponse.json({ error: 'Nome richiesto' }, { status: 400 })
  if (!contenuto && !url) return NextResponse.json({ error: 'Serve un file o un link' }, { status: 400 })

  // `contenuto` arriva come data URL dal browser: teniamo solo la parte base64
  const base64 = contenuto ? String(contenuto).split(',').pop() ?? '' : null
  if (base64) {
    const byte = Math.floor(base64.length * 3 / 4)
    if (byte > MAX_BYTE) {
      return NextResponse.json({ error: 'File troppo grande (max 3 MB)' }, { status: 413 })
    }
  }

  const documento = await prisma.documentoPaziente.create({
    data: {
      userId: user.id,
      pazienteId: id,
      nome: nome.trim(),
      url: base64 ? null : url,
      contenuto: base64,
      mimeType: base64 ? (mimeType || 'application/octet-stream') : null,
      dimensione: base64 ? (dimensione ?? null) : null,
      tipo: tipo || null,
    },
    select: { id: true, nome: true, url: true, tipo: true, mimeType: true, dimensione: true, createdAt: true },
  })

  return NextResponse.json({ documento })
}

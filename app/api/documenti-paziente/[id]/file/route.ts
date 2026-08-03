import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Serve il file caricato di un documento clinico. Protetta da auth: solo il
// professionista proprietario del paziente può scaricarlo.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const documento = await prisma.documentoPaziente.findFirst({
    where: { id, userId: user.id },
    select: { nome: true, contenuto: true, mimeType: true },
  })
  if (!documento?.contenuto) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  const buffer = Buffer.from(documento.contenuto, 'base64')
  const scarica = new URL(req.url).searchParams.get('download') === '1'

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': documento.mimeType ?? 'application/octet-stream',
      'Content-Length': String(buffer.length),
      'Content-Disposition': `${scarica ? 'attachment' : 'inline'}; filename="${encodeURIComponent(documento.nome)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

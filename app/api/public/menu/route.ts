import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/public/menu?publicId=xxx&tipo=locale|asporto
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const publicId = searchParams.get('publicId')
  const tipo = searchParams.get('tipo') ?? 'locale'
  if (!publicId) return NextResponse.json({ error: 'publicId mancante' }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { publicId },
    select: {
      id: true,
      nomeLocale: true,
      menuLogoUrl: true,
      menuColoreP: true,
      menuColoreS: true,
    },
  })
  if (!user) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const categorie = await prisma.menuCategoria.findMany({
    where: { userId: user.id, tipo },
    include: {
      piatti: {
        where: { disponibile: true },
        orderBy: { ordine: 'asc' },
      },
    },
    orderBy: { ordine: 'asc' },
  })

  // Controlla se esiste anche il menù asporto (per mostrare il tab)
  const hasAsporto = await prisma.menuCategoria.count({ where: { userId: user.id, tipo: 'asporto' } })
  const hasLocale = await prisma.menuCategoria.count({ where: { userId: user.id, tipo: 'locale' } })

  return NextResponse.json({
    nomeLocale: user.nomeLocale,
    menuLogoUrl: user.menuLogoUrl,
    menuColoreP: user.menuColoreP ?? '#4f46e5',
    menuColoreS: user.menuColoreS ?? '#ffffff',
    categorie,
    hasAsporto: hasAsporto > 0,
    hasLocale: hasLocale > 0,
  })
}

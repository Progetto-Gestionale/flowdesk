import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const publicId = searchParams.get('publicId')
  if (!publicId) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  const owner = await prisma.user.findUnique({ where: { publicId } })
  if (!owner) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  return NextResponse.json({
    nomeLocale: owner.nomeLocale,
    maxCoperti: owner.maxCoperti,
    orariApertura: owner.orariApertura,
    menuLogoUrl: owner.menuLogoUrl,
    menuColoreP: owner.menuColoreP,
  })
}

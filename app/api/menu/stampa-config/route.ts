import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { prisma } from '@/lib/prisma'

// Configurazione del menu stampabile (PDF), condivisa tra i dispositivi del locale.
// "dati" è una stringa JSON gestita dal client (config + layout piatti per tipo).

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  try {
    const row = await prisma.menuStampaConfig.findUnique({ where: { userId: user.id } })
    return NextResponse.json({ dati: row?.dati ?? null })
  } catch {
    return NextResponse.json({ dati: null })
  }
}

export async function PUT(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { dati } = (await req.json()) as { dati?: unknown }
  if (typeof dati !== 'string' || dati.length > 200_000) {
    return NextResponse.json({ error: 'dati non valido' }, { status: 400 })
  }
  try {
    await prisma.menuStampaConfig.upsert({
      where: { userId: user.id },
      create: { userId: user.id, dati },
      update: { dati },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[MENU-STAMPA-CONFIG] salvataggio fallito:', e)
    return NextResponse.json({ error: 'Salvataggio fallito' }, { status: 500 })
  }
}

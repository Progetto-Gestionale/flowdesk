import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { prisma } from '@/lib/prisma'
import { USD_TO_EUR, meseCorrente } from '@/lib/copilot/spesa'

// Totale della spesa Assistente AI del mese corrente per il locale loggato
// (somma di tutti i dispositivi che usano l'account).
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const mese = meseCorrente()
  try {
    const row = await prisma.copilotUsage.findUnique({
      where: { userId_mese: { userId: user.id, mese } },
    })
    const costoUsd = row?.costoUsd ?? 0
    return NextResponse.json({ mese, costoEur: costoUsd * USD_TO_EUR })
  } catch {
    // Tabella non ancora creata o DB non raggiungibile: contatore a zero.
    return NextResponse.json({ mese, costoEur: 0 })
  }
}

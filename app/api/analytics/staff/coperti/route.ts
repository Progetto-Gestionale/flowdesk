import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { attribuzioneCoperti } from '@/lib/copilot/staff/attribuzione'
import { baselineOrganico } from '@/lib/copilot/staff/baseline'

// Dato VISIBILE al titolare (tab Analytics · Personale): coperti serviti per
// dipendente nel mese scelto + baseline organico per giorno della settimana.
// Owner-only. Stesso motore della insight card e dell'assistente → numeri coerenti.
export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ora = new Date()
  const meseStr = searchParams.get('mese') ?? `${ora.getFullYear()}-${String(ora.getMonth() + 1).padStart(2, '0')}`
  const [year, month] = meseStr.split('-').map(Number)
  if (!year || !month) return NextResponse.json({ error: 'Mese non valido' }, { status: 400 })

  const from = new Date(year, month - 1, 1)
  const fine = new Date(year, month, 1)
  // Non conteggiare il futuro (mese in corso): fermati a inizio giornata odierna+1.
  const to = fine < ora ? fine : ora

  const [attribuzione, baseline] = await Promise.all([
    attribuzioneCoperti(user.id, from, to),
    baselineOrganico(user.id),
  ])

  return NextResponse.json({ mese: meseStr, attribuzione, baseline })
}

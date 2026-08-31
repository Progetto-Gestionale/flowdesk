import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { calcolaPeriodo } from '@/lib/contabilita/periodo'
import { riepilogoContabile } from '@/lib/contabilita/chiusuraGiorno'

// Conto economico gestionale + Semaforo per il periodo richiesto. Owner-only: gira
// dietro getAuthUser (Clerk = titolare); i dipendenti non raggiungono questa rotta.
export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const p = calcolaPeriodo(searchParams.get('periodo') ?? 'mese', searchParams.get('riferimento'))
  const r = await riepilogoContabile(user.id, p.inizio, p.fine)

  return NextResponse.json({ periodo: p.periodo, label: p.label, ...r })
}

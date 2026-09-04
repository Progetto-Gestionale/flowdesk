import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { calcolaPeriodo } from '@/lib/contabilita/periodo'
import { riepilogoContabile } from '@/lib/contabilita/chiusuraGiorno'
import { vistaCassa, semaforoCassa } from '@/lib/contabilita/cassa'

// Vista di CASSA semplificata + Semaforo per il periodo richiesto. Owner-only: gira
// dietro getAuthUser (Clerk = titolare); i dipendenti non raggiungono questa rotta.
export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const p = calcolaPeriodo(searchParams.get('periodo') ?? 'mese', searchParams.get('riferimento'))
  const r = await riepilogoContabile(user.id, p.inizio, p.fine)

  // Vista di cassa (incassi − personale − materie prime − costi fissi) e semaforo su di essa:
  // è ciò che mostra la pagina, non più il conto economico formale con IVA e imposte.
  const cassa = vistaCassa(r.conto)
  const semaforo = semaforoCassa(cassa.cassaPct)

  return NextResponse.json({ periodo: p.periodo, label: p.label, ...r, cassa, semaforo })
}

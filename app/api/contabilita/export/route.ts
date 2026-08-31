import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { calcolaPeriodo } from '@/lib/contabilita/periodo'
import { riepilogoContabile } from '@/lib/contabilita/chiusuraGiorno'
import { generaReportContabile } from '@/lib/contabilita/export'

// Report XLSX per il commercialista. Owner-only.
export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const p = calcolaPeriodo(searchParams.get('periodo') ?? 'mese', searchParams.get('riferimento'))
  const r = await riepilogoContabile(user.id, p.inizio, p.fine)

  const buffer = await generaReportContabile(r, {
    nomeLocale: user.nomeLocale || user.name || 'Locale',
    periodoLabel: p.label,
  })

  const nomeFile = `contabilita_${p.label.replace(/[^\w]+/g, '_')}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeFile}"`,
      'Cache-Control': 'no-store',
    },
  })
}

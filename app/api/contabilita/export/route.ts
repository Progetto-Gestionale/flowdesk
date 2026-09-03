import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { buildDatiReport, generaReportContabile } from '@/lib/contabilita/export'

// Report XLSX MENSILE per il commercialista. Owner-only. Il report copre sempre il MESE che
// contiene `riferimento` (default: mese corrente): è l'unità naturale della liquidazione IVA.
export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dati = await buildDatiReport(user.id, searchParams.get('riferimento'))
  const buffer = await generaReportContabile(dati)

  const nomeFile = `report_contabile_${dati.periodoFile.replace(/[^\w]+/g, '_')}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeFile}"`,
      'Cache-Control': 'no-store',
    },
  })
}

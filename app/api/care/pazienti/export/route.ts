import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import ExcelJS from 'exceljs'

// GET — lista pazienti come file .xlsx vero (non un CSV rinominato), così si
// apre in Excel con le colonne già larghe e le intestazioni formattate.
export async function GET(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  // Stessa ricerca della pagina: si esporta quello che si sta guardando
  const q = new URL(req.url).searchParams.get('q')?.trim()
  const filtro = q
    ? {
        OR: [
          { nome: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
          { telefono: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const pazienti = await prisma.paziente.findMany({
    where: { userId: user.id, cancellato: false, ...filtro },
    orderBy: { nome: 'asc' },
    include: { _count: { select: { sedute: true } } },
  })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Flowest Care'
  wb.created = new Date()
  const ws = wb.addWorksheet('Pazienti')

  ws.columns = [
    { header: 'Nome e cognome', key: 'nome', width: 28 },
    { header: 'Paziente da', key: 'da', width: 16 },
    { header: 'Numero sedute', key: 'sedute', width: 16 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Telefono', key: 'telefono', width: 18 },
  ]

  // Intestazione in blu brand, testo bianco
  const intestazione = ws.getRow(1)
  intestazione.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  intestazione.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F52FF' } }
  intestazione.alignment = { vertical: 'middle' }
  intestazione.height = 22

  for (const p of pazienti) {
    ws.addRow({
      nome: p.nome,
      // Data vera, non testo: in Excel resta ordinabile e filtrabile
      da: p.createdAt,
      sedute: p._count.sedute,
      email: p.email ?? '',
      telefono: p.telefono ?? '',
    })
  }

  ws.getColumn('da').numFmt = 'dd/mm/yyyy'
  ws.getColumn('sedute').alignment = { horizontal: 'center' }
  ws.autoFilter = { from: 'A1', to: `E${pazienti.length + 1}` }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await wb.xlsx.writeBuffer()
  const nomeFile = `pazienti_${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeFile}"`,
      'Cache-Control': 'no-store',
    },
  })
}

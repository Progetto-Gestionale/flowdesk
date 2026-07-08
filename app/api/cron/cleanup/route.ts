import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Chiamata ogni giorno alle 04:00 dalla cron Vercel
// Protetta dal CRON_SECRET in produzione
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const ora = new Date()
  let appAggiornati = 0
  let leadCancellati = 0
  let convEliminate = 0

  // 1. Segna come "completato" tutti gli appuntamenti confermati con data passata
  const risultato = await prisma.appuntamento.updateMany({
    where: { status: 'confermato', data: { lt: ora } },
    data: { status: 'completato' },
  })
  appAggiornati = risultato.count

  // 2. Archivia lead con status 'chiuso' da più di 30 giorni
  const trentaGorniFa = new Date(ora.getTime() - 30 * 24 * 60 * 60 * 1000)
  const leadDaArchiviare = await prisma.lead.findMany({
    where: { cancellato: false, status: 'chiuso', updatedAt: { lt: trentaGorniFa } },
    select: { id: true, email: true },
  })

  if (leadDaArchiviare.length > 0) {
    await prisma.lead.updateMany({
      where: { id: { in: leadDaArchiviare.map(l => l.id) } },
      data: { cancellato: true },
    })
    leadCancellati = leadDaArchiviare.length

    const emailDaEliminare = leadDaArchiviare.filter(l => l.email).map(l => l.email!)
    if (emailDaEliminare.length > 0) {
      const delRes = await prisma.conversazione.deleteMany({
        where: { clienteEmail: { in: emailDaEliminare } },
      })
      convEliminate = delRes.count
    }
  }

  return NextResponse.json({
    ok: true,
    appuntamentiCompletati: appAggiornati,
leadArchiviati: leadCancellati,
    conversazioniEliminate: convEliminate,
    eseguitoAlle: ora.toISOString(),
  })
}

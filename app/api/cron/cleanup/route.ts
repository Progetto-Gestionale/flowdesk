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
  let richiesteConcluse = 0
  let ordiniEliminati = 0

  // 1a. Auto-conferma ordini e delivery non ancora gestiti manualmente
  //     (status non in stati finali) con data passata
  await prisma.appuntamento.updateMany({
    where: {
      status: { notIn: ['confermato', 'pronto', 'completato', 'cancellato', 'no_show'] },
      data: { lt: ora },
      OR: [
        { servizio: { contains: 'asporto',  mode: 'insensitive' } },
        { servizio: { contains: 'ordine',   mode: 'insensitive' } },
        { servizio: { contains: 'delivery', mode: 'insensitive' } },
        { servizio: { contains: 'domicilio',mode: 'insensitive' } },
        { servizio: { contains: 'pizza',    mode: 'insensitive' } },
        { servizio: { contains: 'hamburger',mode: 'insensitive' } },
      ],
    },
    data: { status: 'confermato' },
  })

  // 1b. Segna come "completato" gli appuntamenti confermati già terminati (data + durata < ora)
  const tuttiConfermati = await prisma.appuntamento.findMany({
    where: { status: { in: ['confermato', 'pronto'] } },
    select: { id: true, data: true, durata: true },
  })
  const idsDaCompletare = tuttiConfermati
    .filter(a => new Date(a.data).getTime() + a.durata * 60000 < ora.getTime())
    .map(a => a.id)
  const risultato = await prisma.appuntamento.updateMany({
    where: { id: { in: idsDaCompletare } },
    data: { status: 'completato' },
  })
  appAggiornati = risultato.count

  // 1c. Propaga lo stato "concluso" alle richieste collegate agli appuntamenti terminati
  //     Viene eseguito dopo i passi 1a+1b per includere anche le nuove conclusioni appena create
  const appsConcluse = await prisma.appuntamento.findMany({
    where: {
      status: { in: ['completato', 'cancellato', 'no_show'] },
      note: { contains: 'Da richiesta #' },
    },
    select: { note: true, status: true, userId: true },
  })
  const statusMap: Record<string, string> = {
    completato: 'concluso_completato',
    cancellato: 'concluso_cancellato',
    no_show: 'concluso_no_show',
  }
  for (const a of appsConcluse) {
    if (!a.note) continue
    const match = a.note.match(/Da richiesta #(\d+)/)
    if (!match) continue
    const numero = parseInt(match[1])
    const nuovoStatus = statusMap[a.status]
    if (!nuovoStatus) continue
    const res = await prisma.preventivo.updateMany({
      where: {
        userId: a.userId,
        numero,
        status: { notIn: ['concluso_completato', 'concluso_cancellato', 'concluso_no_show'] },
      },
      data: { status: nuovoStatus },
    })
    richiesteConcluse += res.count
  }

  // 1d. Elimina ordini/delivery già completati nei giorni precedenti (punto 5)
  const inizioOggi = new Date(ora)
  inizioOggi.setHours(0, 0, 0, 0)
  const delRes = await prisma.appuntamento.deleteMany({
    where: {
      status: 'completato',
      data: { lt: inizioOggi },
      OR: [
        { servizio: { contains: 'asporto',  mode: 'insensitive' } },
        { servizio: { contains: 'ordine',   mode: 'insensitive' } },
        { servizio: { contains: 'delivery', mode: 'insensitive' } },
        { servizio: { contains: 'domicilio',mode: 'insensitive' } },
      ],
    },
  })
  ordiniEliminati = delRes.count

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
    richiesteConcluse,
    ordiniEliminati,
    leadArchiviati: leadCancellati,
    conversazioniEliminate: convEliminate,
    eseguitoAlle: ora.toISOString(),
  })
}

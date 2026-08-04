import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sincronizzaSeduta } from '@/lib/sedute'
import { creaNotifica } from '@/lib/notifiche'
import { romeWallTimeToDate } from '@/lib/romeTime'
import { utcToRoma } from '@/lib/careRichiesta'

// Chiusura automatica delle sedute di Flowest Care, appena passata la mezzanotte.
//
// Perché una cron separata da /api/cron/cleanup (che gira alle 04:00): quella
// serve ai ristoranti, che hanno prenotazioni a cavallo della mezzanotte e vanno
// chiuse più tardi. Qui invece la giornata dello studio finisce a mezzanotte, e
// il fisioterapista vuole trovare la cartella clinica già aggiornata al mattino.
//
// In vercel.json è schedulata alle 23:10 UTC, non alle 22:10: i cron di Vercel
// vanno in UTC e l'Italia è UTC+2 d'estate ma UTC+1 d'inverno. Alle 23:10 UTC
// siamo sempre DOPO la mezzanotte italiana (01:10 d'estate, 00:10 d'inverno),
// mai prima — che chiuderebbe la giornata mentre è ancora in corso.
// Il calcolo di "giornata chiusa" usa comunque l'ora di Roma, non quella del
// server, quindi l'anticipo estivo non cambia il risultato.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  // Mezzanotte italiana di oggi: tutto ciò che finisce prima appartiene a un giorno chiuso
  const inizioOggi = romeWallTimeToDate(utcToRoma(new Date()).data, '00:00')

  const utenti = await prisma.user.findMany({
    where: { verticale: 'care' },
    select: { id: true },
  })

  let completate = 0
  let recuperate = 0

  for (const u of utenti) {
    // 1. Appuntamenti confermati di giornate ormai passate → completati
    const daChiudere = await prisma.appuntamento.findMany({
      where: { userId: u.id, status: 'confermato', data: { lt: inizioOggi } },
      select: { id: true, pazienteId: true, data: true, servizio: true },
    })

    for (const app of daChiudere) {
      await prisma.appuntamento.update({ where: { id: app.id }, data: { status: 'completato' } })
      await sincronizzaSeduta({ ...app, userId: u.id, status: 'completato' })
    }
    completate += daChiudere.length

    // 2. Rete di sicurezza: appuntamenti già "completato" ma senza seduta in
    //    cartella (per esempio chiusi dalla cron generica delle 04:00).
    //    appuntamentoId è una colonna semplice, non una relazione: il confronto
    //    si fa qui, non con una query annidata.
    const completati = await prisma.appuntamento.findMany({
      where: { userId: u.id, status: 'completato', pazienteId: { not: null } },
      select: { id: true, pazienteId: true, data: true, servizio: true },
    })
    const giaInCartella = new Set(
      (await prisma.seduta.findMany({
        where: { userId: u.id, appuntamentoId: { not: null } },
        select: { appuntamentoId: true },
      })).map(s => s.appuntamentoId),
    )
    const orfani = completati.filter(a => !giaInCartella.has(a.id))
    for (const app of orfani) {
      await sincronizzaSeduta({ ...app, userId: u.id, status: 'completato' })
    }
    recuperate += orfani.length

    const totale = daChiudere.length + orfani.length
    if (totale > 0) {
      await creaNotifica(u.id, {
        tipo: 'seduta',
        titolo: `${totale} ${totale === 1 ? 'seduta chiusa' : 'sedute chiuse'} in automatico`,
        dettaglio: 'Le trovi nella cartella clinica dei pazienti',
        link: '/care/dashboard/pazienti',
      })
    }
  }

  return NextResponse.json({
    ok: true,
    seduteCompletate: completate,
    cartelleRecuperate: recuperate,
    eseguitoAlle: new Date().toISOString(),
  })
}

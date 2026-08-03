import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Offset (ms) di un fuso a un dato istante, indipendente dal fuso del server:
// entrambe le stringhe sono interpretate con lo stesso parser locale, così il
// fuso del server si annulla e resta solo lo scarto tra il fuso richiesto e UTC.
function tzOffsetMs(instant: number, tz: string): number {
  const asUTC = new Date(new Date(instant).toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  const asTz = new Date(new Date(instant).toLocaleString('en-US', { timeZone: tz })).getTime()
  return asTz - asUTC
}

// Converte un orario "da orologio" (es. 09:00 del 2026-08-03) inteso come ora
// di Europe/Rome nell'istante UTC corrispondente. Il server in produzione gira
// in UTC: senza questa conversione le 09:00 verrebbero salvate come 09:00 UTC
// = 11:00 a Roma (l'appuntamento risultava spostato di +2h in calendario).
function romeWallTimeToUTC(dateStr: string, ora: string): Date {
  const [Y, Mo, D] = dateStr.split('-').map(Number)
  const [h, m] = ora.split(':').map(Number)
  const naive = Date.UTC(Y, Mo - 1, D, h, m, 0, 0)
  const off = tzOffsetMs(naive, 'Europe/Rome')
  return new Date(naive - off)
}

export async function POST(req: Request) {
  const { publicId, tipoSedutaId, data, ora, nome, email, telefono, note } = await req.json()

  if (!publicId || !tipoSedutaId || !data || !ora || !nome) {
    return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
  }

  const user = await prisma.user.findFirst({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const tipoSeduta = await prisma.tipoSeduta.findFirst({ where: { id: tipoSedutaId, userId: user.id, attivo: true } })
  if (!tipoSeduta) return NextResponse.json({ error: 'Tipo di seduta non valido' }, { status: 400 })

  const dataOra = romeWallTimeToUTC(data, ora)

  // Ricontrolla che lo slot sia ancora libero (evita doppie prenotazioni in race condition)
  const fineNuovo = new Date(dataOra.getTime() + tipoSeduta.durata * 60000)
  const conflitto = await prisma.appuntamento.findFirst({
    where: {
      userId: user.id,
      status: { not: 'cancellato' },
      data: { lt: fineNuovo, gte: new Date(dataOra.getTime() - 6 * 3600000) },
    },
  })
  if (conflitto) {
    const fineConflitto = new Date(conflitto.data.getTime() + conflitto.durata * 60000)
    if (fineConflitto > dataOra) {
      return NextResponse.json({ error: 'Questo orario non è più disponibile', conflitto: true }, { status: 409 })
    }
  }

  // Trova o crea il paziente in base all'email
  let paziente = email
    ? await prisma.paziente.findFirst({ where: { userId: user.id, email: { equals: email, mode: 'insensitive' } } })
    : null
  if (!paziente) {
    paziente = await prisma.paziente.create({
      data: { userId: user.id, nome, email, telefono },
    })
  }

  const appuntamento = await prisma.appuntamento.create({
    data: {
      userId: user.id,
      clienteNome: nome,
      clienteEmail: email,
      servizio: tipoSeduta.nome,
      data: dataOra,
      durata: tipoSeduta.durata,
      note,
      pazienteId: paziente.id,
      tipoSedutaId: tipoSeduta.id,
      // La prenotazione online resta "in attesa": compare in Richieste e finisce
      // in calendario solo dopo che il professionista la accetta.
      status: 'in_attesa',
    },
  })

  return NextResponse.json({ ok: true, appuntamento })
}

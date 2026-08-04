import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { romaToUtc, nomeStudio, STATUS_IN_ATTESA } from '@/lib/careRichiesta'
import { sendEmailCareRichiestaRicevuta, sendEmailCareNuovaRichiesta } from '@/lib/email'
import { creaNotifica } from '@/lib/notifiche'

export async function POST(req: Request) {
  const { publicId, tipoSedutaId, data, ora, nome, email, telefono, note } = await req.json()

  if (!publicId || !tipoSedutaId || !data || !ora || !nome) {
    return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
  }

  const user = await prisma.user.findFirst({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const tipoSeduta = await prisma.tipoSeduta.findFirst({ where: { id: tipoSedutaId, userId: user.id, attivo: true } })
  if (!tipoSeduta) return NextResponse.json({ error: 'Tipo di seduta non valido' }, { status: 400 })

  const dataOra = romaToUtc(data, ora)

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
  } else if (telefono && !paziente.telefono) {
    paziente = await prisma.paziente.update({ where: { id: paziente.id }, data: { telefono } })
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
      status: STATUS_IN_ATTESA,
    },
  })

  const studio = nomeStudio(user)
  const datiEmail = { tipoSeduta: tipoSeduta.nome, data, ora, durata: tipoSeduta.durata }

  // Le email non devono far fallire la prenotazione se Resend è irraggiungibile
  await Promise.allSettled([
    sendEmailCareRichiestaRicevuta({ pazienteEmail: email, pazienteNome: nome, nomeStudio: studio, ...datiEmail }),
    sendEmailCareNuovaRichiesta({
      studioEmail: user.email,
      nomeStudio: studio,
      pazienteNome: nome,
      pazienteEmail: email,
      pazienteTelefono: telefono,
      note,
      ...datiEmail,
    }),
  ])

  await creaNotifica(user.id, {
    tipo: 'richiesta',
    titolo: `Nuova richiesta — ${nome}`,
    dettaglio: `${tipoSeduta.nome} · ${data} alle ${ora}`,
    link: '/care/dashboard/richieste',
  })

  return NextResponse.json({ ok: true, appuntamento })
}

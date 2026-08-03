import { getAuthUserId } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'
import { romaToUtc, utcToRoma, nomeStudio, STATUS_PROPOSTA } from '@/lib/careRichiesta'
import { sendEmailCareConferma, sendEmailCareAnnullata, sendEmailCareProposta } from '@/lib/email'

// PATCH — risposta del professionista a una richiesta (un Appuntamento in attesa).
// azione: 'conferma' | 'rifiuta' | 'proposta'
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const app = await prisma.appuntamento.findFirst({ where: { id, userId: user.id } })
  if (!app) return NextResponse.json({ error: 'Richiesta non trovata' }, { status: 404 })

  const { azione, data, ora, durata, tipoSedutaId, tipoSeduta, messaggio } = await req.json()
  const studio = nomeStudio(user)

  // Orario finale: quello scelto nel modal, altrimenti quello già richiesto
  const attuale = utcToRoma(app.data)
  const dataFinale = data || attuale.data
  const oraFinale = ora || attuale.ora

  const tipo = tipoSedutaId
    ? await prisma.tipoSeduta.findFirst({ where: { id: tipoSedutaId, userId: user.id } })
    : null
  const servizio = tipo?.nome || tipoSeduta || app.servizio || null
  const durataFinale = durata || tipo?.durata || app.durata

  const datiEmail = {
    pazienteEmail: app.clienteEmail,
    pazienteNome: app.clienteNome ?? 'paziente',
    nomeStudio: studio,
    tipoSeduta: servizio ?? undefined,
    data: dataFinale,
    ora: oraFinale,
    durata: durataFinale,
  }

  if (azione === 'conferma') {
    await prisma.appuntamento.update({
      where: { id },
      data: {
        status: 'confermato',
        data: romaToUtc(dataFinale, oraFinale),
        durata: durataFinale,
        servizio,
        tipoSedutaId: tipo?.id ?? app.tipoSedutaId,
        tokenRisposta: null,
        messaggioProposta: null,
      },
    })

    await sendEmailCareConferma({ ...datiEmail, indirizzo: user.indirizzo, messaggio: messaggio || null })
      .catch(e => console.error('[care] email conferma fallita', e))

    return NextResponse.json({ ok: true })
  }

  if (azione === 'rifiuta') {
    // Lo slot torna libero, ma la richiesta resta tracciata
    await prisma.appuntamento.update({
      where: { id },
      data: { status: 'cancellato', tokenRisposta: null, messaggioProposta: null },
    })

    await sendEmailCareAnnullata({ ...datiEmail, messaggio: messaggio || null })
      .catch(e => console.error('[care] email annullamento fallita', e))

    return NextResponse.json({ ok: true })
  }

  if (azione === 'proposta') {
    if (!app.clienteEmail) {
      return NextResponse.json({ error: 'Serve l\'email del paziente per inviare una proposta' }, { status: 400 })
    }
    if (!messaggio?.trim()) {
      return NextResponse.json({ error: 'Scrivi un messaggio per il paziente' }, { status: 400 })
    }

    const token = randomBytes(24).toString('hex')

    // Lo slot proposto resta occupato finché il paziente non risponde
    await prisma.appuntamento.update({
      where: { id },
      data: {
        status: STATUS_PROPOSTA,
        data: romaToUtc(dataFinale, oraFinale),
        durata: durataFinale,
        servizio,
        tipoSedutaId: tipo?.id ?? app.tipoSedutaId,
        tokenRisposta: token,
        messaggioProposta: messaggio,
      },
    })

    await sendEmailCareProposta({ ...datiEmail, token, messaggio })
      .catch(e => console.error('[care] email proposta fallita', e))

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
}

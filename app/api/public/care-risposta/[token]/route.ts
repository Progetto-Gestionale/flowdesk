import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { utcToRoma, nomeStudio, STATUS_PROPOSTA } from '@/lib/careRichiesta'
import { sendEmailCareConferma, sendEmailCareRispostaProposta } from '@/lib/email'

// POST — il paziente risponde dal link ricevuto per email alla proposta di un altro
// orario. Se accetta, l'appuntamento è confermato e finisce in calendario da solo.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { azione } = await req.json()

  if (azione !== 'accetta' && azione !== 'rifiuta') {
    return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
  }

  const app = await prisma.appuntamento.findUnique({ where: { tokenRisposta: token } })
  if (!app) return NextResponse.json({ error: 'Link non valido o già utilizzato' }, { status: 404 })
  if (app.status !== STATUS_PROPOSTA) {
    return NextResponse.json({ error: 'Questo link è già stato utilizzato' }, { status: 409 })
  }

  const user = await prisma.user.findUnique({ where: { id: app.userId } })
  if (!user) return NextResponse.json({ error: 'Errore interno' }, { status: 500 })

  const accettata = azione === 'accetta'
  const studio = nomeStudio(user)
  const { data, ora } = utcToRoma(app.data)

  await prisma.appuntamento.update({
    where: { id: app.id },
    data: { status: accettata ? 'confermato' : 'cancellato', tokenRisposta: null },
  })

  const datiSeduta = { tipoSeduta: app.servizio ?? undefined, data, ora, durata: app.durata }

  await Promise.allSettled([
    // Al paziente il riepilogo di quello che ha appena accettato
    accettata && sendEmailCareConferma({
      pazienteEmail: app.clienteEmail,
      pazienteNome: app.clienteNome ?? 'paziente',
      nomeStudio: studio,
      indirizzo: user.indirizzo,
      messaggio: app.messaggioProposta,
      ...datiSeduta,
    }),
    // Al professionista, in entrambi i casi: gli cambia il calendario
    sendEmailCareRispostaProposta({
      studioEmail: user.email,
      nomeStudio: studio,
      pazienteNome: app.clienteNome ?? 'Il paziente',
      pazienteEmail: app.clienteEmail,
      accettata,
      ...datiSeduta,
    }),
  ].filter(Boolean) as Promise<unknown>[])

  return NextResponse.json({ ok: true, azione: accettata ? 'accettato' : 'rifiutato' })
}

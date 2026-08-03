import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmailConferma, sendEmailRifiuto } from '@/lib/email'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { azione } = await req.json()

  const preventivo = await prisma.preventivo.findUnique({ where: { tokenRisposta: token } })
  if (!preventivo) return NextResponse.json({ error: 'Link non valido o già utilizzato' }, { status: 404 })
  if (preventivo.status !== 'inviato') return NextResponse.json({ error: 'Questo link è già stato utilizzato' }, { status: 409 })

  const user = await prisma.user.findUnique({ where: { id: preventivo.userId } })
  if (!user) return NextResponse.json({ error: 'Errore interno' }, { status: 500 })

  if (azione === 'accetta') {
    // Fix 3: aggiorna sia preventivo che lead ad "accettato/chiuso"
    await prisma.preventivo.update({
      where: { id: preventivo.id },
      data: { status: 'accettato', tokenRisposta: null },
    })
    if (preventivo.leadId) {
      await prisma.lead.updateMany({
        where: { id: preventivo.leadId, userId: user.id },
        data: { status: 'chiuso', cancellato: false },
      })
    }

    // Dati della proposta ricavati dalle note/righe del preventivo (usati sia per il calendario che per l'email)
    const items = JSON.parse(preventivo.items ?? '[]') as Array<{ descrizione?: string; coperti?: number; allergie?: string; occasione?: string; durata?: number }>
    const note = preventivo.note ?? ''
    const dataMatch = note.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)
    const oraMatch = note.match(/ORA_ISO:(\d{2}:\d{2})/)
    const copertiNote = note.match(/Coperti:\s*(\d+)/)
    const allergieNote = note.match(/Allergie:\s*([^.]+)/)
    const occasioneNote = note.match(/Occasione:\s*([^.]+)/)

    // Inserisci la prenotazione in calendario, come quando il titolare accetta dal gestionale.
    // Solo se ha una data e se non c'è già un appuntamento per questa richiesta (evita duplicati).
    if (dataMatch?.[1]) {
      const numStr = `#${String(preventivo.numero).padStart(3, '0')}`
      const giaInCalendario = await prisma.appuntamento.findFirst({
        where: { userId: user.id, note: { contains: `Da richiesta ${numStr}` } },
        select: { id: true },
      })
      if (!giaInCalendario) {
        const isTavolo = preventivo.tipo === 'tavolo'
        const ora = oraMatch?.[1] ?? (isTavolo ? '20:00' : '12:00')
        await prisma.appuntamento.create({
          data: {
            userId: user.id,
            clienteNome: preventivo.clienteName,
            clienteEmail: preventivo.clienteEmail,
            servizio: isTavolo ? 'Prenotazione tavolo' : (items[0]?.descrizione ?? preventivo.tipo),
            data: new Date(`${dataMatch[1]}T${ora}:00`),
            durata: items[0]?.durata ?? (isTavolo ? 90 : 15),
            coperti: items[0]?.coperti ?? (copertiNote ? parseInt(copertiNote[1]) : 1),
            allergie: items[0]?.allergie ?? allergieNote?.[1]?.trim() ?? null,
            occasione: items[0]?.occasione ?? occasioneNote?.[1]?.trim() ?? null,
            note: `Da richiesta ${numStr}`,
          },
        })
      }
    }

    // Email di conferma con i dati aggiornati dalla proposta
    if (preventivo.clienteEmail) {
      await sendEmailConferma({
        clienteEmail: preventivo.clienteEmail,
        clienteNome: preventivo.clienteName,
        nomeLocale: user.nomeLocale ?? 'Il locale',
        tipo: preventivo.tipo,
        // Questi dati riflettono le modifiche salvate nella proposta
        data: dataMatch?.[1],
        ora: oraMatch?.[1],
        coperti: items[0]?.coperti ?? (copertiNote ? parseInt(copertiNote[1]) : undefined),
        allergie: items[0]?.allergie ?? allergieNote?.[1]?.trim(),
        occasione: items[0]?.occasione ?? occasioneNote?.[1]?.trim(),
        servizio: items[0]?.descrizione,
        messaggioProposta: preventivo.messaggioProposta ?? undefined,
      })
    }
    return NextResponse.json({ ok: true, azione: 'accettato' })
  }

  if (azione === 'rifiuta') {
    await prisma.preventivo.update({
      where: { id: preventivo.id },
      data: { status: 'rifiutato', tokenRisposta: null },
    })
    if (preventivo.leadId) {
      await prisma.lead.updateMany({
        where: { id: preventivo.leadId, userId: user.id },
        data: { cancellato: true },
      })
    }
    if (preventivo.clienteEmail) {
      await sendEmailRifiuto({
        clienteEmail: preventivo.clienteEmail,
        clienteNome: preventivo.clienteName,
        nomeLocale: user.nomeLocale ?? 'Il locale',
        tipo: preventivo.tipo,
      })
    }
    return NextResponse.json({ ok: true, azione: 'rifiutato' })
  }

  return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
}

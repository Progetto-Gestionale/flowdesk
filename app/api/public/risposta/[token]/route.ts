import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmailConferma, sendEmailRifiuto } from '@/lib/email'
import { romeWallTimeToDate } from '@/lib/romeTime'
import { creaOrdineDaPreventivo, parseInfoOrdine } from '@/lib/ordineDaPreventivo'
import { ripristinaStockPreventivo } from '@/lib/stock'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { azione } = await req.json()

  const preventivo = await prisma.preventivo.findUnique({ where: { tokenRisposta: token } })
  if (!preventivo) return NextResponse.json({ error: 'Link non valido o già utilizzato' }, { status: 404 })
  if (preventivo.status !== 'inviato') return NextResponse.json({ error: 'Questo link è già stato utilizzato' }, { status: 409 })

  const user = await prisma.user.findUnique({ where: { id: preventivo.userId } })
  if (!user) return NextResponse.json({ error: 'Errore interno' }, { status: 500 })

  if (azione === 'accetta') {
    // Asporto/Delivery: la proposta accettata diventa un Ordine vero (non un appuntamento tavolo).
    const isOrdine = preventivo.tipo === 'asporto' || preventivo.tipo === 'delivery'

    // Creiamo l'ordine PRIMA di marcare accettato: se qualcosa va storto, il link resta
    // valido e il cliente può ritentare, invece di restare con una richiesta "accettata"
    // ma senza ordine in cucina. creaOrdineDaPreventivo è idempotente (niente doppioni).
    if (isOrdine) {
      try {
        await creaOrdineDaPreventivo(preventivo, user.id)
      } catch (e) {
        console.error('[risposta] creazione ordine fallita:', e)
        return NextResponse.json({ error: 'Non siamo riusciti a registrare l\'ordine. Riprova tra poco.' }, { status: 500 })
      }
    }

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
    let items: Array<{ descrizione?: string; coperti?: number; allergie?: string; occasione?: string; durata?: number }> = []
    try { const a = JSON.parse(preventivo.items ?? '[]'); if (Array.isArray(a)) items = a } catch {}
    const note = preventivo.note ?? ''
    const dataMatch = note.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)
    // L'ora può stare dentro DATA_ISO (prenotazioni pubbliche: DATA_ISO:YYYY-MM-DDThh:mm) oppure in ORA_ISO.
    const oraMatch = note.match(/DATA_ISO:\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/) ?? note.match(/ORA_ISO:(\d{2}:\d{2})/)
    const copertiNote = note.match(/Coperti:\s*(\d+)/)
    const allergieNote = note.match(/Allergie:\s*([^.]+)/)
    const occasioneNote = note.match(/Occasione:\s*([^.]+)/)

    // Prenotazione tavolo: inserisci in calendario, come quando il titolare accetta dal gestionale.
    // Solo se ha una data e se non c'è già un appuntamento per questa richiesta (evita duplicati).
    if (!isOrdine && dataMatch?.[1]) {
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
            // Orario italiano → istante UTC corretto (evita lo slittamento di +1/+2 sul server UTC).
            data: romeWallTimeToDate(dataMatch[1], ora),
            durata: items[0]?.durata ?? (isTavolo ? 90 : 15),
            coperti: items[0]?.coperti ?? (copertiNote ? parseInt(copertiNote[1]) : 1),
            allergie: items[0]?.allergie ?? allergieNote?.[1]?.trim() ?? null,
            occasione: items[0]?.occasione ?? occasioneNote?.[1]?.trim() ?? null,
            note: `Da richiesta ${numStr}`,
          },
        })
      }
    }

    // Email di conferma con i dati aggiornati dalla proposta. Best-effort: se l'invio
    // fallisce, l'ordine è comunque registrato e accettato → non facciamo fallire tutto.
    if (preventivo.clienteEmail) {
      try {
        const info = isOrdine ? parseInfoOrdine(preventivo.note) : null
        const cartItems = isOrdine ? (items as unknown as { nome: string; quantita: number; prezzo: number }[]) : undefined
        await sendEmailConferma({
          clienteEmail: preventivo.clienteEmail,
          clienteNome: preventivo.clienteName,
          nomeLocale: user.nomeLocale ?? 'Il locale',
          tipo: preventivo.tipo,
          // Questi dati riflettono le modifiche salvate nella proposta
          data: isOrdine ? info?.data : dataMatch?.[1],
          ora: isOrdine ? info?.ora : oraMatch?.[1],
          coperti: items[0]?.coperti ?? (copertiNote ? parseInt(copertiNote[1]) : undefined),
          allergie: items[0]?.allergie ?? allergieNote?.[1]?.trim(),
          occasione: items[0]?.occasione ?? occasioneNote?.[1]?.trim(),
          servizio: items[0]?.descrizione,
          messaggioProposta: preventivo.messaggioProposta ?? undefined,
          ...(isOrdine ? { items: cartItems, indirizzo: info?.indirizzo ?? null, totale: preventivo.totale } : {}),
        })
      } catch (e) {
        console.error('[risposta] invio email conferma fallito:', e)
      }
    }
    return NextResponse.json({ ok: true, azione: 'accettato' })
  }

  if (azione === 'rifiuta') {
    await prisma.preventivo.update({
      where: { id: preventivo.id },
      data: { status: 'rifiutato', tokenRisposta: null },
    })
    // Riaccredita le porzioni prenotate dalla richiesta asporto/delivery (una sola volta).
    await ripristinaStockPreventivo(preventivo)
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

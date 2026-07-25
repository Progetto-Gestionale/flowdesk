import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDipSession } from '@/lib/dipendenteAuth'
import { verifyQrToken } from '@/lib/timbratureToken'

export async function POST(req: Request) {
  try {
    const session = await getDipSession()
    if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { token } = await req.json()
    if (!token) return NextResponse.json({ error: 'Token mancante' }, { status: 400 })

    const payload = verifyQrToken(token)
    if (!payload) return NextResponse.json({ error: 'QR scaduto o non valido. Scannerizza di nuovo.' }, { status: 400 })

    // Verifica che il dipendente appartenga al titolare del QR
    const dip = await prisma.dipendente.findFirst({
      where: { id: session.dipendenteId, userId: payload.userId },
    })
    if (!dip) return NextResponse.json({ error: 'Accesso non autorizzato' }, { status: 403 })

    // Il titolare sceglie UNA modalità (fisso o ciclante): è valido solo il token di quella
    // modalità, così le due cose restano separate e non si creano conflitti (es. un vecchio
    // QR fisso stampato che continua a funzionare dopo il passaggio al ciclante).
    const titolare = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { qrTimbraturaFisso: true },
    })
    if (payload.fisso !== (titolare?.qrTimbraturaFisso ?? false)) {
      return NextResponse.json(
        { error: 'Questo QR non è più attivo. Usa il QR timbratura corrente.' },
        { status: 400 },
      )
    }

    // Determina tipo: se l'ultima timbratura è entrata → uscita, altrimenti entrata
    const ultima = await prisma.timbratura.findFirst({
      where: { dipendenteId: dip.id, userId: payload.userId },
      orderBy: { timestamp: 'desc' },
    })
    const tipo = ultima?.tipo === 'entrata' ? 'uscita' : 'entrata'

    const timbratura = await prisma.timbratura.create({
      data: { dipendenteId: dip.id, userId: payload.userId, tipo },
    })

    return NextResponse.json({ ok: true, tipo, timestamp: timbratura.timestamp })
  } catch (err) {
    console.error('[scan]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

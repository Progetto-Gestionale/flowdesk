import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'
import { comandePerOrdine, comandaEsempio } from '@/lib/comanda'
import { testoComanda } from '@/lib/escpos'

// Anteprima comande: renderizza in testo le comande di un ordine reale (per verificare il layout senza
// stampante), oppure una comanda d'esempio se non si passa ordineId.
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { ordineId } = await req.json().catch(() => ({}))

  if (!ordineId) {
    const c = comandaEsempio()
    return NextResponse.json({ anteprime: [{ reparto: c.reparto, testo: testoComanda(c) }] })
  }

  const ordine = await prisma.ordine.findFirst({
    where: { id: ordineId, userId: user.id },
    include: {
      user: { select: { reparti: true } },
      righe: { include: { piatto: { select: { allergeni: true } } } },
    },
  })
  if (!ordine) return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404 })

  const comande = comandePerOrdine(
    {
      id: ordine.id,
      tavolo: ordine.tavolo,
      tipo: ordine.tipo,
      clienteInfo: ordine.clienteInfo,
      note: ordine.note,
      createdAt: ordine.createdAt,
      righe: ordine.righe.map((r) => ({
        nome: r.nome,
        quantita: r.quantita,
        note: r.note,
        mandata: r.mandata,
        reparto: r.reparto,
        piatto: r.piatto ? { allergeni: r.piatto.allergeni } : null,
      })),
    },
    ordine.user.reparti,
  )

  return NextResponse.json({
    anteprime: comande.map((c) => ({ reparto: c.reparto, testo: testoComanda(c) })),
  })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const solo_oggi = searchParams.get('oggi') === '1'
  // futuri=1: include anche gli ordini asporto/delivery ancora da gestire indipendentemente
  // da createdAt (prenotati in anticipo per oggi o per giorni futuri), così ricompaiono nel
  // giorno giusto invece di sparire col filtro sulla data di creazione.
  const includiPendenti = searchParams.get('futuri') === '1'
  let dal: Date
  if (solo_oggi) {
    // cutoff serata: oggi alle 04:00 UTC (o ieri alle 04:00 se siamo prima delle 04:00)
    dal = new Date()
    dal.setUTCHours(4, 0, 0, 0)
    if (new Date().getUTCHours() < 4) dal.setUTCDate(dal.getUTCDate() - 1)
  } else {
    const giorni = parseInt(searchParams.get('giorni') ?? '90')
    dal = new Date()
    dal.setDate(dal.getDate() - giorni)
  }

  const where = solo_oggi && includiPendenti
    ? {
        userId: user.id,
        OR: [
          { createdAt: { gte: dal } },
          { tipo: { in: ['asporto', 'delivery'] }, status: { in: ['nuovo', 'aperto', 'pronto'] } },
        ],
      }
    : { userId: user.id, createdAt: { gte: dal } }

  const ordini = await prisma.ordine.findMany({
    where,
    include: { righe: { orderBy: { id: 'asc' } } }, // ordine stabile: le righe non "saltano" dopo un update
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ ordini })
}

// POST — il titolare inserisce a mano un ordine asporto/delivery (es. preso al telefono).
// L'ordine nasce con status 'nuovo' come quelli online, quindi va subito in cucina e compare
// nella board Ordini / Asporto & Delivery (o in "In arrivo" se prenotato per una data futura).
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { tipo, nome, telefono, indirizzo, data, ora, righe, note } = await req.json()
  if (!Array.isArray(righe) || righe.length === 0) {
    return NextResponse.json({ error: 'Ordine vuoto' }, { status: 400 })
  }

  const isDelivery = tipo === 'delivery'
  const totale = righe.reduce((s: number, r: { prezzo: number; quantita: number }) => s + (r.prezzo ?? 0) * (r.quantita ?? 0), 0)

  const clienteInfo = JSON.stringify({
    nome: nome?.trim() || null,
    telefono: telefono?.trim() || null,
    indirizzo: isDelivery ? (indirizzo?.trim() || null) : null,
    data: data || null,
    ora: ora || null,
  })

  const ordine = await prisma.ordine.create({
    data: {
      userId: user.id,
      tavolo: isDelivery ? 'Delivery' : 'Asporto',
      tipo: isDelivery ? 'delivery' : 'asporto',
      clienteInfo,
      totale,
      note: note?.trim() || null,
      status: 'nuovo',
      righe: {
        create: righe.map((r: { piattoId?: string | null; nome: string; prezzo: number; quantita: number; note?: string }) => ({
          piattoId: r.piattoId ?? null,
          nome: r.nome,
          prezzo: r.prezzo,
          quantita: r.quantita,
          note: r.note ?? '',
        })),
      },
    },
    include: { righe: true },
  })

  return NextResponse.json({ ok: true, ordine })
}

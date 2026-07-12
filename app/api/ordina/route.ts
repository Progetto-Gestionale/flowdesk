import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET — menu
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const publicId = searchParams.get('publicId')
  if (!publicId) return NextResponse.json({ error: 'publicId mancante' }, { status: 400 })
  const user = await prisma.user.findUnique({
    where: { publicId },
    include: {
      menuCategorie: {
        where: { tipo: 'locale' },
        orderBy: { ordine: 'asc' as const },
        include: {
          piatti: { where: { disponibile: true }, orderBy: { ordine: 'asc' as const } },
        },
      },
    },
  })
  if (!user) return NextResponse.json({ error: 'Locale non trovato' }, { status: 404 })
  return NextResponse.json({ user })
}

// POST — crea ordine
export async function POST(req: Request) {
  const { publicId, tavolo, righe, note } = await req.json()
  const user = await prisma.user.findUnique({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Locale non trovato' }, { status: 404 })

  // Trova il record tavolo
  const tavoloNum = parseInt(tavolo)
  const tavoloRecord = isNaN(tavoloNum) ? null : await prisma.tavolo.findFirst({
    where: { userId: user.id, numero: tavoloNum },
  })
  const tavoloId = tavoloRecord?.id ?? null
  const totale = righe.reduce((sum: number, r: any) => sum + r.prezzo * r.quantita, 0)

  // Cerca il gruppo attivo per questo tavolo (senza vincoli temporali — il conto è aperto fino a chiusura manuale)
  let gruppoId: string | null = null
  let tavoloLabel = tavolo

  if (tavoloId) {
    const oggi = new Date()
    const localOggi = new Date(oggi.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
    const dataStr = `${localOggi.getFullYear()}-${String(localOggi.getMonth() + 1).padStart(2, '0')}-${String(localOggi.getDate()).padStart(2, '0')}`

    const gruppo = await prisma.gruppoTavoli.findFirst({
      where: { userId: user.id, data: dataStr, tavoli: { some: { id: tavoloId } } },
    })
    if (gruppo) {
      gruppoId = gruppo.id
      tavoloLabel = `T${gruppo.label}`
    }
  }

  // Cerca un conto aperto per questo gruppo o per questo singolo tavolo
  const ordineAperto = await prisma.ordine.findFirst({
    where: gruppoId
      ? { gruppoId, status: 'aperto' }
      : { tavoloId, gruppoId: null, status: 'aperto' },
    orderBy: { createdAt: 'desc' },
    include: { righe: true },
  })

  if (ordineAperto) {
    await prisma.rigaOrdine.createMany({
      data: righe.map((r: any) => ({
        ordineId: ordineAperto.id,
        piattoId: r.piattoId, nome: r.nome, prezzo: r.prezzo,
        quantita: r.quantita, note: r.note ?? '',
      })),
    })
    const ordineAggiornato = await prisma.ordine.update({
      where: { id: ordineAperto.id },
      data: { totale: ordineAperto.totale + totale },
      include: { righe: true },
    })
    return NextResponse.json({ ordine: ordineAggiornato })
  }

  // Nessun conto aperto: ne apre uno nuovo
  const ordine = await prisma.ordine.create({
    data: {
      userId: user.id,
      tavolo: tavoloLabel,
      tavoloId,
      gruppoId,
      status: 'aperto',
      totale,
      note,
      righe: {
        create: righe.map((r: any) => ({
          piattoId: r.piattoId, nome: r.nome, prezzo: r.prezzo,
          quantita: r.quantita, note: r.note ?? '',
        })),
      },
    },
    include: { righe: true },
  })
  return NextResponse.json({ ordine })
}

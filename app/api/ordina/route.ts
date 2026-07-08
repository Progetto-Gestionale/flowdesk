import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  const v = h * 60 + m
  return v === 0 ? 1440 : v
}

// GET — menu
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const publicId = searchParams.get('publicId')
  if (!publicId) return NextResponse.json({ error: 'publicId mancante' }, { status: 400 })
  const user = await prisma.user.findUnique({
    where: { publicId },
    include: {
      menuCategorie: {
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

  // Cerca il gruppo attivo per questo tavolo nel turno corrente
  let gruppoId: string | null = null
  let tavoloLabel = tavolo

  if (tavoloId) {
    const oggi = new Date()
    const localOggi = new Date(oggi.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
    const dataStr = `${localOggi.getFullYear()}-${String(localOggi.getMonth() + 1).padStart(2, '0')}-${String(localOggi.getDate()).padStart(2, '0')}`
    const minutiOra = localOggi.getHours() * 60 + localOggi.getMinutes()

    // Recupera turni di servizio dell'utente
    let turnoAttivoId: string | null = null
    try {
      const turni: { id: string; oraInizio: string; oraFine: string }[] = JSON.parse(user.turniServizio ?? '[]')
      const turnoAttivo = turni.find(t => minutiOra >= toMinutes(t.oraInizio) && minutiOra < toMinutes(t.oraFine))
      turnoAttivoId = turnoAttivo?.id ?? null
    } catch {}

    // Cerca il gruppo per oggi che contiene questo tavolo
    const gruppo = await prisma.gruppoTavoli.findFirst({
      where: { userId: user.id, data: dataStr, tavoli: { some: { id: tavoloId } } },
    })

    if (gruppo) {
      // Se il gruppo ha un turnoId, verifica che l'ordine arrivi dentro le ore del turno
      let withinTurno = true
      if (gruppo.turnoId) {
        try {
          const turni: { id: string; oraInizio: string; oraFine: string }[] = JSON.parse(user.turniServizio ?? '[]')
          const turno = turni.find(t => t.id === gruppo.turnoId)
          if (turno) {
            const inizioT = toMinutes(turno.oraInizio)
            const fineT = toMinutes(turno.oraFine)
            withinTurno = inizioT > fineT
              ? (minutiOra >= inizioT || minutiOra < fineT)
              : (minutiOra >= inizioT && minutiOra < fineT)
          }
        } catch {}
      }

      if (withinTurno) {
        gruppoId = gruppo.id
        tavoloLabel = `T${gruppo.label}`
      }
    }
  }

  // Se il tavolo è in un gruppo attivo, aggiungi a ordine esistente
  if (gruppoId) {
    const ordineEsistente = await prisma.ordine.findFirst({
      where: { gruppoId, status: 'nuovo' },
      orderBy: { createdAt: 'desc' },
    })
    if (ordineEsistente) {
      await prisma.rigaOrdine.createMany({
        data: righe.map((r: any) => ({
          ordineId: ordineEsistente.id,
          piattoId: r.piattoId, nome: r.nome, prezzo: r.prezzo,
          quantita: r.quantita, note: r.note ?? '',
        })),
      })
      const ordineAggiornato = await prisma.ordine.update({
        where: { id: ordineEsistente.id },
        data: { totale: ordineEsistente.totale + totale },
        include: { righe: true },
      })
      return NextResponse.json({ ordine: ordineAggiornato })
    }
  }

  // Nessun ordine attivo: crea nuovo
  const ordine = await prisma.ordine.create({
    data: {
      userId: user.id,
      tavolo: tavoloLabel,
      tavoloId,
      gruppoId,
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

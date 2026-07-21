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
  let tavoloLabel = tavoloId ? `T${tavolo}` : tavolo

  if (tavoloId) {
    const oggi = new Date()
    const localOggi = new Date(oggi.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
    const dataStr = `${localOggi.getFullYear()}-${String(localOggi.getMonth() + 1).padStart(2, '0')}-${String(localOggi.getDate()).padStart(2, '0')}`

    const gruppo = await prisma.gruppoTavoli.findFirst({
      where: { userId: user.id, data: dataStr, tavoli: { some: { id: tavoloId } } },
    })
    if (gruppo) {
      // Buffer di 30 min dalla creazione del gruppo: i tavoli restano legati
      // anche se il turno finisce nel mentre (es. cameriere ha appena unito i tavoli)
      const gruppoAgeMin = (Date.now() - new Date(gruppo.createdAt).getTime()) / 60000
      const withinBuffer = gruppoAgeMin < 30

      let turnoAncoraAttivo = true
      if (gruppo.turnoId) {
        try {
          const turni: { id: string; oraInizio: string; oraFine: string }[] = JSON.parse((user as any).turniServizio ?? '[]')
          const turno = turni.find(t => t.id === gruppo.turnoId)
          if (turno) {
            const nowMin = localOggi.getHours() * 60 + localOggi.getMinutes()
            const [hs, ms] = turno.oraInizio.split(':').map(Number)
            const [hf, mf] = turno.oraFine.split(':').map(Number)
            const startMin = hs * 60 + ms
            let endMin = hf * 60 + mf
            if (endMin <= startMin) endMin += 24 * 60
            turnoAncoraAttivo = nowMin >= startMin && nowMin < endMin
          }
        } catch {}
      }

      const ultimoOrdine = await prisma.ordine.findFirst({
        where: { gruppoId: gruppo.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      })

      let legati = false
      if (ultimoOrdine && ultimoOrdine.status !== 'chiuso') {
        // Conto aperto: sempre legati, indipendentemente da turno e buffer
        legati = true
      } else if (withinBuffer) {
        // Entro 30 min dalla creazione: legati anche se il turno è finito
        legati = true
      } else {
        // Oltre il buffer e nessun conto aperto: legati solo se il turno è ancora in corso
        legati = turnoAncoraAttivo
      }
      // conto chiuso manualmente → legati rimane false (già coperto dall'else)

      if (legati) {
        gruppoId = gruppo.id
        tavoloLabel = `T${gruppo.label}`
      }
    }
  }

  // Ogni ordine è un SOTTOGRUPPO a sé: creiamo SEMPRE un nuovo Ordine, agganciato
  // allo stesso tavolo/gruppo. Il "conto" del tavolo = tutti gli Ordini aperti di quel
  // tavolo/gruppo; ciascun Ordine (ogni invio, es. da telefoni diversi) è un sottogruppo
  // pagabile singolarmente. Niente più fusione delle righe in un unico Ordine.
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

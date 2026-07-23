import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST pubblico — il cameriere invia un ordine per uno o più tavoli.
// body: { publicId, tavoli: number[], righe, note }
// Se i tavoli sono più di uno vengono legati in un GruppoTavoli (conti uniti),
// riusando la stessa logica del dashboard (/api/tavoli/unisci-conti).
export async function POST(req: Request) {
  const { publicId, tavoli, righe, note, coperti } = await req.json()

  const user = await prisma.user.findUnique({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Locale non trovato' }, { status: 404 })

  const numeri: number[] = Array.isArray(tavoli)
    ? tavoli.map((t: any) => parseInt(t)).filter((n: number) => !isNaN(n))
    : []
  if (numeri.length === 0) return NextResponse.json({ error: 'Nessun tavolo selezionato' }, { status: 400 })
  if (!Array.isArray(righe) || righe.length === 0) return NextResponse.json({ error: 'Ordine vuoto' }, { status: 400 })

  try {
    const tavoliRecord = await prisma.tavolo.findMany({
      where: { userId: user.id, numero: { in: numeri } },
      select: { id: true, numero: true },
    })
    if (tavoliRecord.length === 0) return NextResponse.json({ error: 'Tavoli non trovati' }, { status: 404 })

    const oggi = new Date()
    const localOggi = new Date(oggi.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
    const dataStr = `${localOggi.getFullYear()}-${String(localOggi.getMonth() + 1).padStart(2, '0')}-${String(localOggi.getDate()).padStart(2, '0')}`

    let gruppoId: string | null = null
    let tavoloLabel: string

    if (tavoliRecord.length >= 2) {
      // Lega i tavoli: riusa un gruppo di oggi se uno dei tavoli è già dentro, altrimenti creane uno
      const tavoliIds = tavoliRecord.map(t => t.id)
      const esistente = await prisma.gruppoTavoli.findFirst({
        where: { userId: user.id, data: dataStr, tavoli: { some: { id: { in: tavoliIds } } } },
      })
      if (esistente) {
        gruppoId = esistente.id
        await prisma.gruppoTavoli.update({
          where: { id: gruppoId },
          data: { tavoli: { connect: tavoliIds.map(id => ({ id })) } },
        })
      } else {
        const g = await prisma.gruppoTavoli.create({
          data: { userId: user.id, label: '', data: dataStr, tavoli: { connect: tavoliIds.map(id => ({ id })) } },
        })
        gruppoId = g.id
      }

      // Ricalcola la label dai tavoli effettivi del gruppo (es. "5+6+7")
      const tavoliGruppo = await prisma.tavolo.findMany({ where: { gruppoId }, select: { id: true, numero: true } })
      const label = tavoliGruppo.map(t => t.numero).sort((a, b) => a - b).join('+')
      await prisma.gruppoTavoli.update({ where: { id: gruppoId }, data: { label } })
      tavoloLabel = `T${label}`

      // Aggancia gli ordini aperti di questi tavoli al gruppo (restano sottogruppi separati)
      await prisma.ordine.updateMany({
        where: { userId: user.id, tavoloId: { in: tavoliGruppo.map(t => t.id) }, status: { notIn: ['chiuso'] } },
        data: { gruppoId, tavolo: `T${label}` },
      })
    } else {
      // Tavolo singolo: se fa già parte di un gruppo aperto di oggi, agganciati a quello
      const t = tavoliRecord[0]
      const gruppo = await prisma.gruppoTavoli.findFirst({
        where: { userId: user.id, data: dataStr, tavoli: { some: { id: t.id } } },
        select: { id: true, label: true },
      })
      if (gruppo) {
        gruppoId = gruppo.id
        tavoloLabel = `T${gruppo.label}`
      } else {
        tavoloLabel = `T${t.numero}`
      }
    }

    const totale = righe.reduce((sum: number, r: any) => sum + r.prezzo * r.quantita, 0)
    const tavoloId = tavoliRecord[0].id

    const ordine = await prisma.ordine.create({
      data: {
        userId: user.id,
        tavolo: tavoloLabel,
        tavoloId,
        gruppoId,
        status: 'aperto',
        totale,
        coperti: Number.isFinite(coperti) && coperti > 0 ? Math.floor(coperti) : null,
        note: note || null,
        righe: {
          create: righe.map((r: any) => ({
            piattoId: r.piattoId, nome: r.nome, prezzo: r.prezzo,
            quantita: r.quantita, note: r.note ?? '',
          })),
        },
      },
      include: { righe: true },
    })

    return NextResponse.json({ ok: true, ordine })
  } catch (e) {
    console.error('[CAMERIERE/ORDINA] errore:', e)
    return NextResponse.json({ error: "Impossibile inviare l'ordine. Riprova." }, { status: 500 })
  }
}

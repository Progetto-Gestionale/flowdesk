import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET pubblico — dati per la pagina camerieri: locale, menu (locale), tavoli con
// stato di occupazione (conto aperto) e gruppi (tavoli uniti) di oggi.
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
      sale: { orderBy: { ordine: 'asc' as const }, select: { id: true, nome: true } },
      tavoli: {
        orderBy: { numero: 'asc' as const },
        select: { id: true, numero: true, etichetta: true, salaId: true, posti: true },
      },
    },
  })
  if (!user) return NextResponse.json({ error: 'Locale non trovato' }, { status: 404 })

  // Tavoli occupati = quelli con almeno un ordine non chiuso
  const ordiniAperti = await prisma.ordine.findMany({
    where: { userId: user.id, status: { notIn: ['chiuso'] }, tavoloId: { not: null } },
    select: { tavoloId: true },
  })
  const occupatiSet = new Set(ordiniAperti.map(o => o.tavoloId))

  // Gruppi (tavoli uniti) di oggi
  const oggi = new Date()
  const localOggi = new Date(oggi.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
  const dataStr = `${localOggi.getFullYear()}-${String(localOggi.getMonth() + 1).padStart(2, '0')}-${String(localOggi.getDate()).padStart(2, '0')}`
  const gruppi = await prisma.gruppoTavoli.findMany({
    where: { userId: user.id, data: dataStr, tavoli: { some: {} } },
    select: { id: true, label: true, tavoli: { select: { id: true } } },
  })

  return NextResponse.json({
    nomeLocale: user.nomeLocale ?? 'Menu',
    menuLogoUrl: user.menuLogoUrl,
    menuColoreP: user.menuColoreP ?? '#4f46e5',
    pinAttivo: !!user.camerierePin,
    categorie: user.menuCategorie,
    sale: user.sale,
    tavoli: user.tavoli.map(t => ({ ...t, occupato: occupatiSet.has(t.id) })),
    gruppi: gruppi.map(g => ({ id: g.id, label: g.label, tavoliIds: g.tavoli.map(t => t.id) })),
  })
}

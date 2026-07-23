import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const periodo = searchParams.get('periodo') ?? 'settimana'

  const rifStr = searchParams.get('riferimento')
  const rif = rifStr ? new Date(rifStr) : new Date()

  const oggi = new Date()
  oggi.setUTCHours(0, 0, 0, 0)

  let from: Date, toEffettivo: Date
  if (periodo === 'anno') {
    const anno = rif.getUTCFullYear()
    from = new Date(Date.UTC(anno, 0, 1))
    const to = new Date(Date.UTC(anno + 1, 0, 1))
    toEffettivo = to > oggi ? oggi : to
  } else if (periodo === 'mese') {
    const anno = rif.getUTCFullYear()
    const mese = rif.getUTCMonth()
    from = new Date(Date.UTC(anno, mese, 1))
    const to = new Date(Date.UTC(anno, mese + 1, 1))
    toEffettivo = to > oggi ? oggi : to
  } else {
    const d = new Date(rif)
    d.setUTCHours(0, 0, 0, 0)
    const dow = d.getUTCDay()
    const diff = dow === 0 ? -6 : 1 - dow
    from = new Date(d)
    from.setUTCDate(d.getUTCDate() + diff)
    const to = new Date(from)
    to.setUTCDate(from.getUTCDate() + 7)
    toEffettivo = to > oggi ? oggi : to
  }

  const righe = await prisma.rigaOrdine.findMany({
    where: {
      ordine: {
        userId: user.id,
        createdAt: { gte: from, lt: toEffettivo },
      },
    },
    select: {
      nome: true,
      quantita: true,
      prezzo: true,
      piattoId: true,
      piatto: {
        select: {
          categoria: { select: { nome: true, ordine: true } },
        },
      },
    },
  })

  // Aggrega per piatto
  const piattoMap: Record<string, { nome: string; quantita: number; incasso: number; categoria: string; categoriaOrdine: number }> = {}
  for (const r of righe) {
    // Piatti eliminati hanno piattoId null: raggruppa per nome così le vendite
    // storiche restano distinte e non finiscono tutte in un'unica riga.
    const key = r.piattoId ?? `nome:${r.nome}`
    if (!piattoMap[key]) {
      piattoMap[key] = {
        nome: r.nome,
        quantita: 0,
        incasso: 0,
        categoria: r.piatto?.categoria?.nome ?? 'Altro',
        categoriaOrdine: r.piatto?.categoria?.ordine ?? 999,
      }
    }
    piattoMap[key].quantita += r.quantita
    piattoMap[key].incasso += r.prezzo * r.quantita
  }

  const piatti = Object.entries(piattoMap)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.quantita - a.quantita)

  // Raggruppa per categoria (ordinata)
  const catMap: Record<string, { nome: string; ordine: number; piatti: typeof piatti }> = {}
  for (const p of piatti) {
    if (!catMap[p.categoria]) catMap[p.categoria] = { nome: p.categoria, ordine: p.categoriaOrdine, piatti: [] }
    catMap[p.categoria].piatti.push(p)
  }
  const categorie = Object.values(catMap).sort((a, b) => a.ordine - b.ordine)

  const top5 = piatti.slice(0, 5)
  const bottom5 = piatti.length > 5 ? piatti.slice(-5).reverse() : []

  return NextResponse.json({ top5, bottom5, categorie, totale: piatti.length })
}

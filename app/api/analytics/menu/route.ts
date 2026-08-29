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
      foodCost: true, // snapshot del costo al momento dell'ordine → guadagno netto/margine
      piattoId: true,
      reparto: true, // snapshot al momento dell'ordine: robusto anche per piatti poi eliminati
      piatto: {
        select: {
          categoria: { select: { nome: true, ordine: true, reparto: true } },
        },
      },
    },
  })

  // Reparti considerati "bevande": esclusi dalla classifica top/bottom piatti (le bevande non sono
  // piatti preparati in cucina). Restano invece nella classifica per categoria.
  const REPARTI_BEVANDE = ['Bar']

  // Aggrega per piatto. incasso = lordo (prezzo×q). costo = food cost totale dallo snapshot
  // riga (solo dove presente). quantitaConCosto = pezzi con costo noto (per la copertura dati).
  const piattoMap: Record<string, { nome: string; quantita: number; incasso: number; costo: number; quantitaConCosto: number; categoria: string; categoriaOrdine: number; bevanda: boolean }> = {}
  for (const r of righe) {
    // Piatti eliminati hanno piattoId null: raggruppa per nome così le vendite
    // storiche restano distinte e non finiscono tutte in un'unica riga.
    const key = r.piattoId ?? `nome:${r.nome}`
    // Reparto della riga: prima lo snapshot (regge anche se il piatto è stato eliminato),
    // poi il reparto attuale della categoria come fallback.
    const rep = r.reparto ?? r.piatto?.categoria?.reparto ?? null
    const bev = !!rep && REPARTI_BEVANDE.includes(rep)
    if (!piattoMap[key]) {
      piattoMap[key] = {
        nome: r.nome,
        quantita: 0,
        incasso: 0,
        costo: 0,
        quantitaConCosto: 0,
        categoria: r.piatto?.categoria?.nome ?? 'Altro',
        categoriaOrdine: r.piatto?.categoria?.ordine ?? 999,
        bevanda: false,
      }
    }
    piattoMap[key].quantita += r.quantita
    piattoMap[key].incasso += r.prezzo * r.quantita
    if (r.foodCost != null) {
      piattoMap[key].costo += r.foodCost * r.quantita
      piattoMap[key].quantitaConCosto += r.quantita
    }
    if (bev) piattoMap[key].bevanda = true
  }

  // Arricchisce ogni piatto con netto, margine % e copertura del food cost.
  const piatti = Object.entries(piattoMap)
    .map(([id, v]) => {
      const netto = v.incasso - v.costo
      return {
        id,
        ...v,
        netto,
        margine: v.incasso > 0 ? (netto / v.incasso) * 100 : null,
        // copertura: quota di pezzi con food cost noto (1 = tutti). Se < 1 il netto è una stima.
        coperturaCosto: v.quantita > 0 ? v.quantitaConCosto / v.quantita : 0,
      }
    })
    .sort((a, b) => b.quantita - a.quantita)

  // Classifica migliori/peggiori: solo piatti, niente bevande (reparto Bar).
  const piattiClassifica = piatti.filter(p => !p.bevanda)

  // Raggruppa per categoria (ordinata)
  const catMap: Record<string, { nome: string; ordine: number; piatti: typeof piatti }> = {}
  for (const p of piatti) {
    if (!catMap[p.categoria]) catMap[p.categoria] = { nome: p.categoria, ordine: p.categoriaOrdine, piatti: [] }
    catMap[p.categoria].piatti.push(p)
  }
  const categorie = Object.values(catMap).sort((a, b) => a.ordine - b.ordine)

  const top5 = piattiClassifica.slice(0, 5)
  const bottom5 = piattiClassifica.length > 5 ? piattiClassifica.slice(-5).reverse() : []

  // Riepilogo redditività del periodo (tutti i piatti, bevande incluse).
  const incassoTot = piatti.reduce((s, p) => s + p.incasso, 0)
  const costoTot = piatti.reduce((s, p) => s + p.costo, 0)
  const incassoConCosto = piatti.reduce((s, p) => s + (p.quantita > 0 ? p.incasso * (p.quantitaConCosto / p.quantita) : 0), 0)
  const riepilogo = {
    incasso: incassoTot,
    costo: costoTot,
    netto: incassoTot - costoTot,
    // Food cost % calcolato solo sulla quota di incasso con costo noto (evita di diluire con le vendite senza costo).
    foodCostPerc: incassoConCosto > 0 ? (costoTot / incassoConCosto) * 100 : null,
    coperturaCosto: incassoTot > 0 ? incassoConCosto / incassoTot : 0,
  }

  return NextResponse.json({ top5, bottom5, categorie, totale: piatti.length, riepilogo })
}

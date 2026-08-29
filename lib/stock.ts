import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// Gestione del "counter live" delle porzioni (campo MenuPiatto.quantita).
// Solo i piatti con quantita != null sono gestiti; gli altri sono illimitati e ignorati.

export interface RigaStock { piattoId?: string | null; nome?: string | null; quantita?: number | null }

// Errore sollevato quando un ordine chiede più porzioni di quelle rimaste.
export class StockError extends Error {
  esauriti: string[]
  constructor(esauriti: string[]) {
    super('Alcuni piatti non sono più disponibili nella quantità richiesta.')
    this.name = 'StockError'
    this.esauriti = esauriti
  }
}

// Aggrega le righe per piatto (un ordine può avere lo stesso piatto in righe diverse).
function aggregaPerPiatto(righe: RigaStock[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of righe) {
    if (!r.piattoId) continue
    const q = Number(r.quantita) || 0
    if (q <= 0) continue
    m.set(r.piattoId, (m.get(r.piattoId) ?? 0) + q)
  }
  return m
}

// Decremento atomico dentro una transazione. Ogni updateMany è condizionale
// (quantita >= richiesta): se count === 0 il piatto è esaurito → StockError.
export async function decrementaStock(tx: Prisma.TransactionClient, righe: RigaStock[]): Promise<void> {
  const perPiatto = aggregaPerPiatto(righe)
  if (perPiatto.size === 0) return
  const gestiti = await tx.menuPiatto.findMany({
    where: { id: { in: [...perPiatto.keys()] }, quantita: { not: null } },
    select: { id: true, nome: true },
  })
  const esauriti: string[] = []
  for (const p of gestiti) {
    const need = perPiatto.get(p.id) ?? 0
    if (need <= 0) continue
    const res = await tx.menuPiatto.updateMany({
      where: { id: p.id, quantita: { gte: need } },
      data: { quantita: { decrement: need } },
    })
    if (res.count === 0) esauriti.push(p.nome)
  }
  if (esauriti.length > 0) throw new StockError(esauriti)
}

// Ripristina le porzioni (es. richiesta asporto/delivery rifiutata). Solo piatti gestiti.
export async function ripristinaStock(righe: RigaStock[]): Promise<void> {
  const perPiatto = aggregaPerPiatto(righe)
  if (perPiatto.size === 0) return
  const gestiti = await prisma.menuPiatto.findMany({
    where: { id: { in: [...perPiatto.keys()] }, quantita: { not: null } },
    select: { id: true },
  })
  for (const p of gestiti) {
    const q = perPiatto.get(p.id) ?? 0
    if (q > 0) await prisma.menuPiatto.update({ where: { id: p.id }, data: { quantita: { increment: q } } })
  }
}

// Ripristina le porzioni di una richiesta asporto/delivery, UNA SOLA VOLTA.
// La guardia atomica (updateMany where stockScalato:true) evita doppi ripristini
// se la stessa richiesta viene rifiutata/eliminata più volte o da flussi diversi.
export async function ripristinaStockPreventivo(prev: { id: string; items: string; stockScalato: boolean }): Promise<void> {
  if (!prev.stockScalato) return
  const reset = await prisma.preventivo.updateMany({ where: { id: prev.id, stockScalato: true }, data: { stockScalato: false } })
  if (reset.count === 0) return // già ripristinato altrove
  let righe: RigaStock[] = []
  try { const a = JSON.parse(prev.items ?? '[]'); if (Array.isArray(a)) righe = a } catch {}
  await ripristinaStock(righe)
}

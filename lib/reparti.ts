import { prisma } from '@/lib/prisma'

// Reparti / centri di produzione (Cucina, Bar, Pizzeria…). Ogni categoria del menu è assegnata a un
// reparto; la board Ordini instrada le righe al reparto giusto (la cucina vede i piatti, il bar le bevande).
export const DEFAULT_REPARTI = ['Cucina', 'Bar']

export function parseReparti(json?: string | null): string[] {
  if (!json) return [...DEFAULT_REPARTI]
  try {
    const a = JSON.parse(json)
    const list = Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean) : []
    return list.length ? list : [...DEFAULT_REPARTI]
  } catch {
    return [...DEFAULT_REPARTI]
  }
}

// Il reparto "di default" per le righe senza reparto (ordini vecchi, piatti senza categoria): il primo
// della lista del locale. Così gli ordini passati restano coerenti (finiscono nel reparto principale).
export function repartoDefault(reparti: string[]): string {
  return reparti[0] ?? 'Cucina'
}

// Mappa piattoId → reparto (nome), leggendo la categoria del piatto. Usata alla creazione dell'ordine
// per fare lo SNAPSHOT del reparto sulla riga: così l'instradamento non cambia se poi modifichi il menu.
export async function repartoPerPiatti(piattoIds: (string | null | undefined)[]): Promise<Record<string, string>> {
  const ids = [...new Set(piattoIds.filter((x): x is string => !!x))]
  if (ids.length === 0) return {}
  const piatti = await prisma.menuPiatto.findMany({
    where: { id: { in: ids } },
    select: { id: true, categoria: { select: { reparto: true } } },
  })
  const map: Record<string, string> = {}
  for (const p of piatti) if (p.categoria?.reparto) map[p.id] = p.categoria.reparto
  return map
}

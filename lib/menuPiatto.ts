// Normalizzatori dei campi "counter quantità" ed "etichetta" del piatto.
// Usati sia lato API (validazione input) sia dove serve coerenza.

// Colore di default dell'etichetta piatto (quando il commerciante non ne sceglie uno).
export const ETICHETTA_COLORE_DEFAULT = '#2563eb'

// Il piatto ha un counter attivo?
export function quantitaGestita(quantita: number | null | undefined): boolean {
  return quantita !== null && quantita !== undefined
}

// Va mostrata al cliente la rimanenza? Sì se: piatto gestito e (esaurito, oppure
// nessuna soglia impostata, oppure rimanenza <= soglia scelta dal commerciante).
export function mostraRimanenza(quantita: number | null | undefined, soglia: number | null | undefined): boolean {
  if (!quantitaGestita(quantita)) return false
  if ((quantita as number) <= 0) return true
  if (soglia === null || soglia === undefined) return true
  return (quantita as number) <= soglia
}

// Quantità rimanente gestita dal commerciante.
// null / '' / undefined → null (piatto NON gestito a quantità = illimitato).
// Numero → intero >= 0.
export function normQuantita(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return null
  return n < 0 ? 0 : n
}

// Soglia di visibilità del counter al cliente.
// null / '' → null (mostra sempre quando la quantità è gestita).
// Numero → intero >= 0 (mostra "Ne restano X" solo quando quantita <= soglia).
export function normSoglia(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return null
  return n < 0 ? 0 : n
}

// Food cost (costo di produzione della porzione, €).
// null / '' / undefined → null (non impostato). Numero → float >= 0.
export function normFoodCost(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
  if (!Number.isFinite(n)) return null
  return n < 0 ? 0 : n
}

// Aliquota IVA di vendita del piatto (override). Salvata come frazione (0.10 = 10%).
// null / '' / undefined → null (eredita: categoria → default del locale).
// Accetta sia la frazione (0.1) sia la percentuale digitata a mano (10 → 0.10). Clamp 0..1.
export function normAliquota(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  let n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
  if (!Number.isFinite(n)) return null
  if (n > 1) n = n / 100 // l'utente ha digitato una percentuale (es. 22 → 0.22)
  if (n < 0) n = 0
  if (n > 1) n = 1
  return n
}

// Testo dell'etichetta (es. "Best seller"). Trim, vuoto → null, max 40 caratteri.
export function normEtichetta(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.slice(0, 40)
}

// Colore dell'etichetta: accetta solo un hex #rgb / #rrggbb. Altrimenti null (default).
export function normColore(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return s
  return null
}

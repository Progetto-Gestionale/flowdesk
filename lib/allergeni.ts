// I 14 allergeni principali da dichiarare (Reg. UE 1169/2011, Allegato II).
// `key` = valore salvato nel DB (MenuPiatto.allergeni: string[]); `label` = testo mostrato.
export const ALLERGENI = [
  { key: 'glutine', label: 'Glutine' },
  { key: 'crostacei', label: 'Crostacei' },
  { key: 'uova', label: 'Uova' },
  { key: 'pesce', label: 'Pesce' },
  { key: 'arachidi', label: 'Arachidi' },
  { key: 'soia', label: 'Soia' },
  { key: 'latte', label: 'Latte e lattosio' },
  { key: 'frutta_a_guscio', label: 'Frutta a guscio' },
  { key: 'sedano', label: 'Sedano' },
  { key: 'senape', label: 'Senape' },
  { key: 'sesamo', label: 'Sesamo' },
  { key: 'solfiti', label: 'Anidride solforosa e solfiti' },
  { key: 'lupini', label: 'Lupini' },
  { key: 'molluschi', label: 'Molluschi' },
] as const

export type AllergeneKey = (typeof ALLERGENI)[number]['key']

export const ALLERGENE_LABEL: Record<string, string> = Object.fromEntries(ALLERGENI.map(a => [a.key, a.label]))

// I 14 allergeni principali da dichiarare (Reg. UE 1169/2011, Allegato II).
// `key` = valore salvato nel DB (MenuPiatto.allergeni: string[]); `label` = testo mostrato;
// `icon` = emoji decorativa (il testo resta comunque leggibile a norma).
export const ALLERGENI = [
  { key: 'glutine', label: 'Glutine', icon: '🌾' },
  { key: 'crostacei', label: 'Crostacei', icon: '🦐' },
  { key: 'uova', label: 'Uova', icon: '🥚' },
  { key: 'pesce', label: 'Pesce', icon: '🐟' },
  { key: 'arachidi', label: 'Arachidi', icon: '🥜' },
  { key: 'soia', label: 'Soia', icon: '🫛' },
  { key: 'latte', label: 'Latte e lattosio', icon: '🥛' },
  { key: 'frutta_a_guscio', label: 'Frutta a guscio', icon: '🌰' },
  { key: 'sedano', label: 'Sedano', icon: '🥬' },
  { key: 'senape', label: 'Senape', icon: '🟡' },
  { key: 'sesamo', label: 'Sesamo', icon: '🫓' },
  { key: 'solfiti', label: 'Anidride solforosa e solfiti', icon: '🍷' },
  { key: 'lupini', label: 'Lupini', icon: '🫘' },
  { key: 'molluschi', label: 'Molluschi', icon: '🦪' },
] as const

export type AllergeneKey = (typeof ALLERGENI)[number]['key']

export const ALLERGENE_LABEL: Record<string, string> = Object.fromEntries(ALLERGENI.map(a => [a.key, a.label]))
export const ALLERGENE_ICON: Record<string, string> = Object.fromEntries(ALLERGENI.map(a => [a.key, a.icon]))

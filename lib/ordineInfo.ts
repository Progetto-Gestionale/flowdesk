// Funzioni pure (niente prisma) per leggere/scrivere i dati di un ordine asporto/delivery salvato
// come Preventivo. Separate da lib/ordineDaPreventivo (che usa prisma) per essere importabili anche
// dai componenti client (es. il tab "Richieste in entrata").

export interface RigaPreventivo { piattoId?: string | null; nome: string; prezzo: number; quantita: number; note?: string | null }
export interface InfoOrdine { tipo?: string; indirizzo?: string | null; cap?: string | null; telefono?: string | null; lat?: number | null; lon?: number | null; noteCliente?: string | null; email?: string | null; data?: string; ora?: string }

// Estrae i dati di consegna dal campo note del preventivo (marker INFO:{...} + DATA_ISO per l'orario).
export function parseInfoOrdine(note?: string | null): InfoOrdine {
  const n = note ?? ''
  let info: InfoOrdine = {}
  const m = n.match(/INFO:(\{[\s\S]*\})/)
  if (m) { try { info = JSON.parse(m[1]) as InfoOrdine } catch {} }
  const dataMatch = n.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)
  const oraMatch = n.match(/DATA_ISO:\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/)
  return { ...info, data: info.data ?? dataMatch?.[1], ora: info.ora ?? oraMatch?.[1] }
}

// Costruisce la stringa note del preventivo a partire dai dati di consegna (usata in /api/public/ordina).
export function buildNoteOrdine(info: InfoOrdine, data: string, ora: string): string {
  return `DATA_ISO:${data}T${ora} INFO:${JSON.stringify(info)}`
}

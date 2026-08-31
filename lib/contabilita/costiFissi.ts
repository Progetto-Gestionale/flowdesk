// Costi fissi → rateo. Inseriti UNA volta con la loro periodicità; qui li normalizziamo
// a una quota giornaliera/periodo così il conto economico li spalma senza data-entry.

export interface CostoFissoLike {
  importoNetto: number
  aliquota: number
  periodicita: string // "mensile" | "trimestrale" | "annuale"
  attivo: boolean
}

// Importo netto normalizzato al MESE (base comune di confronto).
export function importoMensile(c: CostoFissoLike): number {
  if (!c.attivo) return 0
  switch (c.periodicita) {
    case 'annuale':
      return c.importoNetto / 12
    case 'trimestrale':
      return c.importoNetto / 3
    case 'mensile':
    default:
      return c.importoNetto
  }
}

// Totale mensile di tutti i costi fissi attivi (netto IVA).
export function totaleMensile(costi: CostoFissoLike[]): number {
  return costi.reduce((tot, c) => tot + importoMensile(c), 0)
}

// Quota giornaliera: convenzione 30 giorni/mese (come da progetto). Serve al break-even
// quotidiano e al livello 2 del "spendibile".
export function quotaGiornaliera(costi: CostoFissoLike[]): number {
  return totaleMensile(costi) / 30
}

// Quota da spalmare su un intervallo di N giorni (per il P&L di settimana/mese).
export function quotaPeriodo(costi: CostoFissoLike[], giorni: number): number {
  return quotaGiornaliera(costi) * giorni
}

// IVA a credito sui costi fissi del mese (utenze, servizi, canoni…): concorre alla
// liquidazione IVA. Usa l'importo normalizzato al mese.
export function ivaCreditoMensile(costi: CostoFissoLike[]): number {
  return costi.reduce((tot, c) => tot + importoMensile(c) * c.aliquota, 0)
}

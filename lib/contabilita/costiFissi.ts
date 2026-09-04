// Costi fissi → rateo. Inseriti UNA volta con la loro periodicità; qui li normalizziamo
// a una quota giornaliera/periodo così il conto economico li spalma senza data-entry.
//
// VISTA DI CASSA: conta quello che ESCE davvero dal conto, cioè il LORDO (IVA inclusa).
// Il campo `importoNetto` sul DB è storicamente il netto + `aliquota`; i costi inseriti da
// oggi salvano invece direttamente il lordo con aliquota 0. In entrambi i casi il lordo è
// `importoNetto * (1 + aliquota)` — regola uniforme che vale per i vecchi e i nuovi record,
// senza bisogno di migrare i dati.

export interface CostoFissoLike {
  importoNetto: number
  aliquota: number
  periodicita: string // "mensile" | "trimestrale" | "annuale"
  attivo: boolean
}

// Lordo di un singolo costo (quello che si paga davvero, IVA inclusa).
export function lordoCosto(importoNetto: number, aliquota: number): number {
  return importoNetto * (1 + aliquota)
}

// Netto normalizzato al MESE (base per il calcolo, ormai interno, dell'IVA a credito).
function nettoMensile(c: CostoFissoLike): number {
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

// Importo LORDO normalizzato al MESE (quello che entra nella vista di cassa).
export function importoMensile(c: CostoFissoLike): number {
  return lordoCosto(nettoMensile(c), c.aliquota)
}

// Totale mensile LORDO di tutti i costi fissi attivi.
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

// IVA a credito sui costi fissi del mese (utenze, servizi, canoni…). Non più mostrata nella
// vista di cassa (l'IVA a debito/credito si compensa in grosso modo), resta solo per calcoli
// interni. Usa il NETTO normalizzato al mese.
export function ivaCreditoMensile(costi: CostoFissoLike[]): number {
  return costi.reduce((tot, c) => tot + nettoMensile(c) * c.aliquota, 0)
}

// Motore IVA della Contabilità. Funzioni pure e testabili: nessun accesso al DB.
//
// Regola d'oro: i prezzi del menu (MenuPiatto.prezzo, RigaOrdine.prezzo, Ordine.totale)
// sono LORDI (quello che paga il cliente, IVA inclusa). Da lì si scorpora l'imponibile.
// L'IVA sugli acquisti è invece una partita di giro (credito) e NON entra nel food cost.

export const ALIQUOTA_VENDITA_DEFAULT = 0.1 // somministrazione al tavolo (cibo + bevande servite)

export interface Scorporo {
  imponibile: number // il vero incasso del ristorante (netto IVA)
  iva: number // IVA a debito verso lo Stato
}

// Scorpora l'IVA da un prezzo lordo. Es. scorpora(12, 0.10) → { imponibile: 10.91, iva: 1.09 }.
export function scorpora(lordo: number, aliquota: number): Scorporo {
  if (!lordo || lordo <= 0) return { imponibile: 0, iva: 0 }
  const imponibile = lordo / (1 + aliquota)
  return { imponibile, iva: lordo - imponibile }
}

// Risoluzione a cascata dell'aliquota di vendita di una riga d'ordine:
//   snapshot sulla riga → override sul piatto → override sulla categoria → default del locale.
// Il primo valore non-null/undefined vince. Così i piatti storici (snapshot null) usano
// comunque un'aliquota sensata e il ristoratore configura solo le eccezioni.
export function risolviAliquotaVendita(opts: {
  rigaAliquota?: number | null
  piattoAliquota?: number | null
  categoriaAliquota?: number | null
  defaultLocale?: number | null
}): number {
  return (
    opts.rigaAliquota ??
    opts.piattoAliquota ??
    opts.categoriaAliquota ??
    opts.defaultLocale ??
    ALIQUOTA_VENDITA_DEFAULT
  )
}

// Liquidazione IVA del periodo: quanto va davvero versato allo Stato.
// ivaNetta = IVA a debito (vendite) − IVA a credito (acquisti). Può essere negativa
// (credito d'imposta) nei periodi in cui si è comprato più di quanto si è venduto.
export function liquidazione(ivaDebito: number, ivaCredito: number): number {
  return ivaDebito - ivaCredito
}

// IVA a credito da una lista di righe fattura fornitori (imponibile × aliquota per riga).
// Presente già in F1 come funzione pura; le fatture reali arrivano in F3 (OCR bolle).
export function ivaCreditoDaRighe(righe: { prezzoNetto: number; aliquota: number }[]): number {
  return righe.reduce((tot, r) => tot + r.prezzoNetto * r.aliquota, 0)
}

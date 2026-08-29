// Fasce di consegna: il ristoratore definisce più fasce per distanza dal locale, ognuna con
// ordine minimo e preavviso minimo propri. Es: entro 5 km → min €15 e 30 min; entro 10 km → min €25 e 45 min.
// Modulo puro (niente prisma) → importabile anche dalle pagine pubbliche client.
export interface FasciaConsegna { kmMax: number; ordineMinimo: number; preavvisoMinuti: number }

// Legge le fasce dalle regole (JSON già parse). Retrocompatibilità: se non ci sono fasce ma è
// impostato il vecchio raggio/preavviso singolo, costruisce un'unica fascia equivalente.
export function parseFasce(regole: { fasceConsegna?: unknown; raggioConsegnaKm?: unknown; preavvisoOrdiniMinMinuti?: unknown } | null | undefined): FasciaConsegna[] {
  const raw = regole?.fasceConsegna
  let fasce: FasciaConsegna[] = []
  if (Array.isArray(raw)) {
    fasce = raw
      .map((f) => ({
        kmMax: Number((f as FasciaConsegna)?.kmMax) || 0,
        ordineMinimo: Number((f as FasciaConsegna)?.ordineMinimo) || 0,
        preavvisoMinuti: Number((f as FasciaConsegna)?.preavvisoMinuti) || 0,
      }))
      .filter((f) => f.kmMax > 0)
  }
  if (fasce.length === 0) {
    // Fallback dai valori legacy singoli (raggio + preavviso ordini)
    const km = Number(regole?.raggioConsegnaKm) || 0
    const pre = Number(regole?.preavvisoOrdiniMinMinuti) || 0
    if (km > 0 || pre > 0) fasce = [{ kmMax: km || 99999, ordineMinimo: 0, preavvisoMinuti: pre }]
  }
  return fasce.sort((a, b) => a.kmMax - b.kmMax)
}

// Trova la fascia applicabile a una distanza: la prima (in ordine di km crescenti) con kmMax >= distanza.
// null = oltre l'ultima fascia → indirizzo FUORI ZONA (solo quando ci sono fasce configurate; se
// non ce ne sono, il chiamante non applica alcun vincolo di distanza).
export function fasciaPerDistanza(fasce: FasciaConsegna[], km: number): FasciaConsegna | null {
  for (const f of fasce) if (km <= f.kmMax) return f
  return null
}

// Etichetta leggibile per un preavviso in minuti (es. 90 → "1h 30min").
export function labelPreavviso(min: number): string {
  if (min < 60) return `${min} minuti`
  if (min % 60 === 0) return `${min / 60} ${min / 60 === 1 ? 'ora' : 'ore'}`
  return `${Math.floor(min / 60)}h ${min % 60}min`
}

// Fasce di consegna: il ristoratore definisce più fasce per il delivery, ognuna con un criterio di zona
// (distanza in km dal locale — in LINEA D'ARIA — e/o elenco di CAP) e con ordine minimo e preavviso propri.
// Es: entro 5 km → min €15 e 30 min; entro 10 km → min €25 e 45 min; CAP 20144 → min €20.
// Modulo puro (niente prisma) → importabile anche dalle pagine pubbliche client.
export interface FasciaConsegna { kmMax: number; cap: string[]; ordineMinimo: number; preavvisoMinuti: number }

// Normalizza un CAP: stringa di 5 cifre, altrimenti '' (non valido).
export function normCap(v: unknown): string {
  const s = String(v ?? '').replace(/\D/g, '').slice(0, 5)
  return s.length === 5 ? s : ''
}

// Accetta i CAP come array oppure come stringa "62032, 62100" → lista di CAP validi, senza duplicati.
function parseCapList(raw: unknown): string[] {
  let arr: unknown[] = []
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === 'string') arr = raw.split(',')
  const out: string[] = []
  for (const x of arr) { const c = normCap(x); if (c && !out.includes(c)) out.push(c) }
  return out
}

// Legge le fasce dalle regole (JSON già parse). Retrocompatibilità: se non ci sono fasce ma è
// impostato il vecchio raggio/preavviso singolo, costruisce un'unica fascia equivalente.
export function parseFasce(regole: { fasceConsegna?: unknown; raggioConsegnaKm?: unknown; preavvisoOrdiniMinMinuti?: unknown } | null | undefined): FasciaConsegna[] {
  const raw = regole?.fasceConsegna
  let fasce: FasciaConsegna[] = []
  if (Array.isArray(raw)) {
    fasce = raw
      .map((f) => ({
        kmMax: Number((f as FasciaConsegna)?.kmMax) || 0,
        cap: parseCapList((f as { cap?: unknown })?.cap),
        ordineMinimo: Number((f as FasciaConsegna)?.ordineMinimo) || 0,
        preavvisoMinuti: Number((f as FasciaConsegna)?.preavvisoMinuti) || 0,
      }))
      // Una fascia è valida se ha almeno un criterio di zona (km o CAP).
      .filter((f) => f.kmMax > 0 || f.cap.length > 0)
  }
  if (fasce.length === 0) {
    // Fallback dai valori legacy singoli (raggio + preavviso ordini)
    const km = Number(regole?.raggioConsegnaKm) || 0
    const pre = Number(regole?.preavvisoOrdiniMinMinuti) || 0
    if (km > 0 || pre > 0) fasce = [{ kmMax: km || 99999, cap: [], ordineMinimo: 0, preavvisoMinuti: pre }]
  }
  // Ordine per km crescente: le fasce solo-CAP (km 0) restano in testa → il match esatto per CAP ha priorità.
  return fasce.sort((a, b) => a.kmMax - b.kmMax)
}

// Trova la fascia applicabile a un indirizzo. Per ogni fascia (in ordine) entrambi i criteri
// IMPOSTATI devono valere; un criterio vuoto non vincola:
//   - solo km  → conta la distanza (serve conoscerla)
//   - solo CAP → conta il CAP
//   - entrambi → distanza dentro il km E CAP nell'elenco
// km = null quando la distanza non è nota (es. locale senza posizione): le fasce con km non matchano,
// ma quelle solo-CAP sì. Restituisce null = nessuna fascia copre → indirizzo fuori zona.
export function fasciaPerIndirizzo(fasce: FasciaConsegna[], km: number | null | undefined, cap: string | null | undefined): FasciaConsegna | null {
  const capN = normCap(cap)
  for (const f of fasce) {
    const capOk = f.cap.length === 0 ? true : (!!capN && f.cap.includes(capN))
    const kmOk = f.kmMax <= 0 ? true : (km != null && km <= f.kmMax)
    if (capOk && kmOk) return f
  }
  return null
}

// Compat: match solo per distanza (ignora i CAP). Mantenuto per eventuali usi legacy.
export function fasciaPerDistanza(fasce: FasciaConsegna[], km: number): FasciaConsegna | null {
  for (const f of fasce) if (f.kmMax > 0 && km <= f.kmMax) return f
  return null
}

// Etichetta leggibile per un preavviso in minuti (es. 90 → "1h 30min").
export function labelPreavviso(min: number): string {
  if (min < 60) return `${min} minuti`
  if (min % 60 === 0) return `${min / 60} ${min / 60 === 1 ? 'ora' : 'ore'}`
  return `${Math.floor(min / 60)}h ${min % 60}min`
}

// Geocodifica indirizzi italiani via Nominatim (OpenStreetMap).
// Usata dalle pagine pubbliche di delivery per verificare l'indirizzo del cliente
// e calcolarne la distanza dal locale (controllo zona di consegna).

export type GeocodeResult = {
  lat: number
  lon: number
  postcode?: string
  raw: any
}

const BASE = 'https://nominatim.openstreetmap.org/search'
const HEADERS = { 'Accept-Language': 'it', 'User-Agent': 'Flowest/1.0' }

async function query(params: Record<string, string>): Promise<any[]> {
  const qs = new URLSearchParams({
    format: 'json',
    limit: '1',
    countrycodes: 'it',
    addressdetails: '1',
    ...params,
  })
  const res = await fetch(`${BASE}?${qs.toString()}`, { headers: HEADERS }).catch(() => null)
  if (!res || !res.ok) return []
  return (await res.json().catch(() => [])) as any[]
}

// Geocodifica robusta: prova prima con via+città+CAP (query strutturata, più precisa),
// poi senza CAP (spesso il CAP confonde Nominatim), infine in formato libero.
// Ritorna il primo risultato utile o null se nessun tentativo trova l'indirizzo.
export async function geocodaIndirizzo(
  via: string,
  cap: string,
  citta: string,
): Promise<GeocodeResult | null> {
  const v = via.trim()
  const c = citta.trim()
  const p = cap.trim()
  if (!v) return null

  const tentativi: Record<string, string>[] = [
    ...(p ? [{ street: v, city: c, postalcode: p }] : []),
    { street: v, city: c },
    { q: `${v}, ${c}, Italia` },
    ...(p ? [{ q: `${v}, ${p} ${c}, Italia` }] : []),
  ]

  for (const t of tentativi) {
    const r = await query(t)
    if (r && r.length > 0) {
      return {
        lat: parseFloat(r[0].lat),
        lon: parseFloat(r[0].lon),
        postcode: r[0]?.address?.postcode?.replace(/\s/g, ''),
        raw: r[0],
      }
    }
  }
  return null
}

// Distanza in km (formula dell'emisenoverso) tra due coordinate.
export function distanzaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

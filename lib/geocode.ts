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

export type Suggerimento = { l1: string; l2: string; via: string; cap: string; citta: string; lat: number; lon: number }

// Autocomplete indirizzi via Photon (OpenStreetMap, gratuito, senza chiave), pensato per il
// "scrivi e ti suggerisce". Restituisce suggerimenti già normalizzati e con coordinate precise.
// bias opzionale sulle coordinate del locale: fa uscire prima gli indirizzi vicini.
export async function cercaIndirizzi(q: string, biasLat?: number | null, biasLon?: number | null): Promise<Suggerimento[]> {
  if (q.trim().length < 3) return []
  const bias = biasLat != null && biasLon != null ? `&lat=${biasLat}&lon=${biasLon}` : ''
  // NB: Photon NON supporta più lang=it (accetta solo default/de/en/fr) e con lang=it risponde
  // con un errore → nessun suggerimento. 'default' restituisce i nomi locali (quindi italiani).
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=default&limit=5${bias}`
  const res = await fetch(url).catch(() => null)
  if (!res || !res.ok) return []
  const data = await res.json().catch(() => null)
  const feats = (data?.features ?? []) as any[]
  return feats
    .filter(f => String(f.properties?.countrycode ?? 'IT').toUpperCase() === 'IT') // solo Italia
    .map(f => {
      const p = f.properties ?? {}
      const strada = p.street ?? p.name ?? ''
      const via = [strada, p.housenumber ?? ''].filter(Boolean).join(' ')
      const citta = p.city ?? p.town ?? p.village ?? p.county ?? ''
      const cap = String(p.postcode ?? '').replace(/\s/g, '').slice(0, 5)
      const [lon, lat] = (f.geometry?.coordinates ?? [null, null]) as [number | null, number | null]
      return { l1: via || p.name || '', l2: [cap, citta].filter(Boolean).join(' '), via, cap, citta, lat: lat as number, lon: lon as number }
    })
    .filter(s => typeof s.lat === 'number' && typeof s.lon === 'number' && !!s.via)
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

// Calcolo degli slot prenotabili di Flowest Care.
// Funzioni pure (niente Prisma): le usano sia la disponibilità di un singolo
// giorno sia quella dell'intero mese, così le due non possono divergere.

export const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
export const STEP_MIN = 15

export type Fascia = [number, number] // minuti dalla mezzanotte: [inizio, fine)

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** "09:00-13:00, 15:00-18:00" → [[540,780],[900,1080]] */
export function parseRanges(raw: string | undefined | null): Fascia[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(r => {
    const [ini, fine] = r.split('-').map(s => s.trim())
    return [toMin(ini), toMin(fine)] as Fascia
  }).filter(([ini, fine]) => !isNaN(ini) && !isNaN(fine) && fine > ini)
}

/** Interseca due elenchi di fasce: serve a tenere un tipo di seduta dentro l'apertura. */
export function intersectRanges(a: Fascia[], b: Fascia[]): Fascia[] {
  const out: Fascia[] = []
  for (const [as, ae] of a) for (const [bs, be] of b) {
    const s = Math.max(as, bs), e = Math.min(ae, be)
    if (e > s) out.push([s, e])
  }
  return out
}

export function codiceGiorno(data: string): string {
  return GIORNI[new Date(`${data}T12:00:00Z`).getUTCDay()]
}

export interface VincoliTipo {
  giorni?: string | null // JSON array di codici giorno; vuoto = tutti
  orari?: string | null  // fasce consentite; vuoto = tutto l'orario di apertura
}

/**
 * Fasce apribili in un giorno: override della giornata se c'è, altrimenti il
 * template settimanale, poi ristrette ai vincoli del tipo di seduta.
 * Restituisce [] se quel giorno il servizio non è proponibile.
 */
export function fasceDelGiorno(opts: {
  data: string
  orariApertura?: string | null   // JSON { lun: "09:00-13:00", … }
  overrideSlots?: string | null   // JSON string[]; [] = chiuso
  tipo?: VincoliTipo | null
}): Fascia[] {
  const { data, orariApertura, overrideSlots, tipo } = opts

  let ranges: Fascia[]
  if (overrideSlots != null) {
    try {
      ranges = (JSON.parse(overrideSlots) as string[]).map(r => {
        const [ini, fine] = r.split('-').map(s => s.trim())
        return [toMin(ini), toMin(fine)] as Fascia
      })
    } catch { ranges = [] }
  } else {
    const orari = (() => { try { return JSON.parse(orariApertura ?? '{}') } catch { return {} } })() as Record<string, string>
    ranges = parseRanges(orari[codiceGiorno(data)])
  }

  if (tipo) {
    const giorniAmmessi: string[] = (() => {
      try { return tipo.giorni ? JSON.parse(tipo.giorni) : [] } catch { return [] }
    })()
    if (giorniAmmessi.length > 0 && !giorniAmmessi.includes(codiceGiorno(data))) return []
    const consentiti = parseRanges(tipo.orari)
    if (consentiti.length > 0) ranges = intersectRanges(ranges, consentiti)
  }

  return ranges
}

/** Data/ora di un appuntamento → fascia occupata, se cade nel giorno richiesto. */
export function fasciaOccupata(app: { data: Date; durata: number }, data: string): Fascia | null {
  const local = new Date(app.data.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
  const p = (n: number) => String(n).padStart(2, '0')
  const giorno = `${local.getFullYear()}-${p(local.getMonth() + 1)}-${p(local.getDate())}`
  if (giorno !== data) return null
  const start = local.getHours() * 60 + local.getMinutes()
  return [start, start + app.durata]
}

/** Ora italiana corrente, come { data, minuti }. */
export function adessoRoma(): { data: string; minuti: number } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    data: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
    minuti: now.getHours() * 60 + now.getMinutes(),
  }
}

/** Slot liberi di un giorno, saltando quelli già passati e quelli in conflitto. */
export function slotLiberi(opts: {
  data: string
  ranges: Fascia[]
  durata: number
  occupati: Fascia[]
  soloIlPrimo?: boolean // per sapere solo se il giorno è prenotabile
}): string[] {
  const { data, ranges, durata, occupati, soloIlPrimo } = opts
  const adesso = adessoRoma()
  const slots: string[] = []

  for (const [ini, fine] of ranges) {
    for (let t = ini; t + durata <= fine; t += STEP_MIN) {
      if (data === adesso.data && t <= adesso.minuti) continue
      if (data < adesso.data) continue
      if (occupati.some(([os, oe]) => t < oe && t + durata > os)) continue
      slots.push(toHHMM(t))
      if (soloIlPrimo) return slots
    }
  }
  return slots
}

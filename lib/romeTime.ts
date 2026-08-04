// Converte un orario "da parete" italiano (fuso Europe/Rome) nell'istante UTC corretto,
// come farebbe il browser di un utente in Italia con new Date('YYYY-MM-DDTHH:MM').
// Serve LATO SERVER (Vercel gira in UTC): lì new Date('2026-08-04T20:00') verrebbe interpretato
// come 20:00 UTC e mostrato alle 22:00 in Italia. Con questo helper 20:00 resta 20:00.

function romeOffsetMinutes(at: Date): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    timeZoneName: 'shortOffset',
  }).format(at)
  const m = s.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/)
  if (!m) return 0
  const sign = m[1].startsWith('-') ? -1 : 1
  const h = Math.abs(parseInt(m[1], 10))
  const min = m[2] ? parseInt(m[2], 10) : 0
  return sign * (h * 60 + min)
}

// dateStr: "YYYY-MM-DD", timeStr: "HH:MM" (interpretati come ora locale italiana).
export function romeWallTimeToDate(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const guess = new Date(Date.UTC(y, (mo || 1) - 1, d || 1, hh || 0, mm || 0))
  const off = romeOffsetMinutes(guess) // es. +120 in estate (CEST)
  return new Date(guess.getTime() - off * 60000)
}

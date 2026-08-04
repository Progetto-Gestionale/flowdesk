// Helper condivisi per le richieste di appuntamento di Flowest Care.
// In Care la richiesta è l'Appuntamento stesso con status 'in_attesa': non c'è un
// modello separato. Il professionista può confermarla, rifiutarla, oppure proporre
// un altro orario — in quest'ultimo caso l'appuntamento porta un tokenRisposta e
// passa a 'proposta_inviata' finché il paziente non risponde dall'email.

export const STATUS_IN_ATTESA = 'in_attesa'
export const STATUS_PROPOSTA = 'proposta_inviata'

// La conversione ora italiana → UTC vive in lib/romeTime.ts, usata anche da Food:
// una sola implementazione, così i due verticali non divergono sul fuso.
export { romeWallTimeToDate as romaToUtc } from '@/lib/romeTime'

/** Inverso di romaToUtc: da istante UTC a { data, ora } in ora italiana. */
export function utcToRoma(istante: Date): { data: string; ora: string } {
  const locale = new Date(istante.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    data: `${locale.getFullYear()}-${p(locale.getMonth() + 1)}-${p(locale.getDate())}`,
    ora: `${p(locale.getHours())}:${p(locale.getMinutes())}`,
  }
}

/** Nome dello studio come lo vede il paziente nelle email. */
export function nomeStudio(user: { nomeLocale?: string | null; name?: string | null }): string {
  return user.nomeLocale?.trim() || user.name?.trim() || 'Il tuo studio'
}

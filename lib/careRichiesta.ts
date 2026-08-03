// Helper condivisi per le richieste di appuntamento di Flowest Care.
// In Care la richiesta è l'Appuntamento stesso con status 'in_attesa': non c'è un
// modello separato. Il professionista può confermarla, rifiutarla, oppure proporre
// un altro orario — in quest'ultimo caso l'appuntamento porta un tokenRisposta e
// passa a 'proposta_inviata' finché il paziente non risponde dall'email.

export const STATUS_IN_ATTESA = 'in_attesa'
export const STATUS_PROPOSTA = 'proposta_inviata'

/** Scarto in ms fra il fuso richiesto e UTC in un dato istante, indipendente dal fuso del server. */
function tzOffsetMs(instant: number, tz: string): number {
  const asUTC = new Date(new Date(instant).toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  const asTz = new Date(new Date(instant).toLocaleString('en-US', { timeZone: tz })).getTime()
  return asTz - asUTC
}

/**
 * Converte un orario "da orologio" (es. 09:00 del 2026-08-03) inteso come ora di
 * Europe/Rome nell'istante UTC corrispondente. Il server in produzione gira in UTC:
 * senza questa conversione le 09:00 verrebbero salvate come 09:00 UTC = 11:00 a Roma.
 */
export function romaToUtc(data: string, ora: string): Date {
  const [anno, mese, giorno] = data.split('-').map(Number)
  const [ore, minuti] = ora.split(':').map(Number)
  const naive = Date.UTC(anno, mese - 1, giorno, ore, minuti, 0, 0)
  return new Date(naive - tzOffsetMs(naive, 'Europe/Rome'))
}

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

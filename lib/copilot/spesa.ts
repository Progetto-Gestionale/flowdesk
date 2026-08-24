// Utility condivise per la spesa dell'Assistente AI.

// Cambio approssimativo USD→EUR per mostrare la stima in euro (la fatturazione
// Anthropic è in dollari). Aggiornabile all'occorrenza.
export const USD_TO_EUR = 0.92

// Mese corrente "YYYY-MM" in fuso Europe/Rome (così il taglio del mese è locale).
export function meseCorrente(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 7)
}

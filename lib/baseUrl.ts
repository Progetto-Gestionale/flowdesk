// URL di base per i link assoluti nelle email e per i redirect.
// Priorità:
//   1. env esplicita (NEXT_PUBLIC_BASE_URL, o il vecchio NEXT_PUBLIC_APP_URL)
//   2. URL del deploy su Vercel (VERCEL_URL) → link sempre funzionante
//   3. dominio di produzione (se in produzione ma senza le variabili sopra)
//   4. localhost (solo in sviluppo)
// Così i link inviati in produzione non puntano mai a localhost, anche se le env non sono impostate.
export function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    (process.env.NODE_ENV === 'production' ? 'https://flowest.it' : 'http://localhost:3000')
  )
}

// Helper "serata": la giornata di servizio non finisce a mezzanotte ma alle 04:00 locali,
// così un ordine per l'01:00 appartiene ancora alla serata del giorno prima.

// Chiave serata (YYYY-MM-DD) di un istante, con taglio alle 04:00 locali.
export function serataKey(d: Date): string {
  const x = new Date(d)
  if (x.getHours() < 4) x.setDate(x.getDate() - 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// Serata corrente.
export function serataOggi(): string {
  return serataKey(new Date())
}

// Serata di un ordine asporto/delivery dai campi clienteInfo (data 'YYYY-MM-DD' + ora 'HH:MM').
export function serataOrdine(data?: string | null, ora?: string | null): string | null {
  if (!data) return null
  const [hh, mm] = (ora ?? '12:00').split(':').map(Number)
  const d = new Date(`${data}T00:00:00`)
  d.setHours(Number.isFinite(hh) ? hh : 12, Number.isFinite(mm) ? mm : 0, 0, 0)
  return serataKey(d)
}

// 'oggi' | 'futuro' | 'passato' rispetto alla serata corrente.
export function quandoServe(serata: string | null): 'oggi' | 'futuro' | 'passato' {
  if (!serata) return 'oggi'
  const oggi = serataOggi()
  return serata > oggi ? 'futuro' : serata < oggi ? 'passato' : 'oggi'
}

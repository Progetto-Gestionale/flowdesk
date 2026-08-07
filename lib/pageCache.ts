// Cache in-memory per la navigazione (stale-while-revalidate).
//
// Serve a mostrare SUBITO l'ultimo dato conosciuto di una pagina quando ci si torna,
// invece di rimostrare "Caricamento…" e attendere la rete. La pagina poi ricarica in
// background e aggiorna. È volutamente semplice: nessuna scadenza, nessuna libreria.
//
// - Vive per l'intera sessione SPA (in RAM). Un refresh completo del browser la azzera:
//   quindi al massimo si mostra un dato "vecchio" per la frazione di secondo che serve al
//   revalidate, mai un dato incoerente in modo persistente.
// - NON contiene dati sensibili a lungo termine né sostituisce il fetch: è solo un
//   "primo paint" ottimistico.
const store = new Map<string, unknown>()

export function getCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined
}

export function setCache<T>(key: string, value: T): void {
  store.set(key, value)
}

export function clearCache(key: string): void {
  store.delete(key)
}

// Costanti delle notifiche Care, senza dipendenze: le importano sia il server
// (lib/notifiche.ts, che usa Prisma) sia i componenti client.

/** Dopo quanti giorni una notifica si cancella da sola. */
export const GIORNI_CONSERVAZIONE = 7

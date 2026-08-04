import { prisma } from '@/lib/prisma'

// Notifiche di Flowest Care. Le crea chi esegue l'azione (API richieste,
// appuntamenti, sedute); la lettura e la pulizia stanno in /api/care/notifiche.

export type TipoNotifica = 'richiesta' | 'calendario' | 'seduta'

export { GIORNI_CONSERVAZIONE } from '@/lib/notificheConfig'

interface NuovaNotifica {
  tipo: TipoNotifica
  titolo: string
  dettaglio?: string | null
  link?: string | null
}

/**
 * Registra una notifica per il professionista. Non lancia mai: una notifica
 * persa non deve far fallire l'azione che l'ha generata (una prenotazione
 * confermata resta confermata anche se la notifica non si scrive).
 */
export async function creaNotifica(userId: string, n: NuovaNotifica): Promise<void> {
  try {
    await prisma.notifica.create({
      data: {
        userId,
        tipo: n.tipo,
        titolo: n.titolo,
        dettaglio: n.dettaglio ?? null,
        link: n.link ?? null,
      },
    })
  } catch (e) {
    console.error('[notifiche] creazione fallita', e)
  }
}

/**
 * Come creaNotifica, ma solo per gli utenti Care: serve nelle API condivise con
 * Food (appuntamenti, sedute), che non devono generare notifiche per i ristoranti.
 */
export async function creaNotificaCare(
  user: { id: string; verticale: string },
  n: NuovaNotifica,
): Promise<void> {
  if (user.verticale !== 'care') return
  await creaNotifica(user.id, n)
}

/** Data e ora italiane di un appuntamento, per il testo della notifica. */
export function descriviQuando(data: Date): string {
  return data.toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'short', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  })
}

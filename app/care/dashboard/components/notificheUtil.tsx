import { IconClipboard, IconCalendar, IconClock } from '@/app/components/icons'

export { GIORNI_CONSERVAZIONE } from '@/lib/notificheConfig'


export interface Notifica {
  id: string
  tipo: string
  titolo: string
  dettaglio?: string | null
  link?: string | null
  letta: boolean
  createdAt: string
}

export function iconaPerTipo(tipo: string) {
  if (tipo === 'calendario') return <IconCalendar />
  if (tipo === 'seduta') return <IconClock />
  return <IconClipboard />
}

export function fmtOra(iso: string) {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/** Chiave giorno in ora locale: serve sia a raggruppare sia a cancellare per sezione. */
export function chiaveGiorno(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function etichettaGiorno(chiave: string) {
  const oggi = chiaveGiorno(new Date().toISOString())
  const ieri = chiaveGiorno(new Date(Date.now() - 86400000).toISOString())
  if (chiave === oggi) return 'Oggi'
  if (chiave === ieri) return 'Ieri'
  return new Date(`${chiave}T12:00:00`).toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

/** Notifica creata dal client per far ricaricare subito la campanella. */
export function segnalaAggiornamento() {
  window.dispatchEvent(new Event('notifiche-aggiornate'))
}

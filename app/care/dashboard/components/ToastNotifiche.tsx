'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useNotifiche } from './NotificheProvider'
import { iconaPerTipo, type Notifica } from './notificheUtil'

const DURATA_MS = 6000

function Toast({ n, onChiudi }: { n: Notifica; onChiudi: () => void }) {
  // Ogni toast si toglie da solo; il timer riparte se cambia la notifica mostrata
  useEffect(() => {
    const t = setTimeout(onChiudi, DURATA_MS)
    return () => clearTimeout(t)
  }, [n.id, onChiudi])

  const contenuto = (
    <>
      <span className="w-8 h-8 shrink-0 rounded-lg bg-electric-blue/10 text-electric-blue flex items-center justify-center p-2">
        {iconaPerTipo(n.tipo)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-navy leading-snug">{n.titolo}</p>
        {n.dettaglio && <p className="text-xs text-ink-navy/45 mt-0.5 line-clamp-2">{n.dettaglio}</p>}
      </div>
    </>
  )

  return (
    <div
      role="status"
      className="animate-toast-in pointer-events-auto w-80 bg-white rounded-2xl border border-ink-navy/10 shadow-xl overflow-hidden">
      <div className="flex items-start gap-3 p-3.5">
        {n.link
          ? <Link href={n.link} onClick={onChiudi} className="flex items-start gap-3 flex-1 min-w-0">{contenuto}</Link>
          : <div className="flex items-start gap-3 flex-1 min-w-0">{contenuto}</div>}
        <button onClick={onChiudi} aria-label="Chiudi notifica"
          className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full text-ink-navy/25 hover:text-ink-navy/60 hover:bg-mist transition-colors text-sm leading-none">
          ✕
        </button>
      </div>
      {/* Barra che scorre: fa capire che il toast sparisce da solo */}
      <div className="h-0.5 bg-electric-blue/15">
        <div className="h-full bg-electric-blue"
          style={{ animation: `toast-barra ${DURATA_MS}ms linear forwards` }} />
      </div>
    </div>
  )
}

/**
 * Toast in alto a destra, sotto la TopBar. Compaiono appena arriva una notifica
 * nuova: subito per le azioni fatte qui dentro, entro pochi secondi per quelle
 * che arrivano da fuori (un paziente che prenota o risponde all'email).
 */
export default function ToastNotifiche() {
  const { daMostrare, scarta } = useNotifiche()

  if (daMostrare.length === 0) return null

  return (
    <div className="fixed top-16 right-5 z-[60] flex flex-col gap-2 pointer-events-none">
      {daMostrare.map(n => (
        <Toast key={n.id} n={n} onChiudi={() => scarta(n.id)} />
      ))}
    </div>
  )
}

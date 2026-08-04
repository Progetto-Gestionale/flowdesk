'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { IconBell, IconArrowRight } from '@/app/components/icons'
import { fmtOra, iconaPerTipo } from './notificheUtil'
import { useNotifiche } from './NotificheProvider'

// Campanella della TopBar: pallino blu quando c'è da leggere, e al click il
// riepilogo di oggi. Lo storico completo sta in /care/dashboard/notifiche.
export default function Campanella() {
  // Dati e polling stanno nel provider: qui si legge e basta
  const { notifiche, daLeggere, richiesteDaVerificare, ricarica } = useNotifiche()
  const [aperta, setAperta] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Chiusura cliccando fuori
  useEffect(() => {
    if (!aperta) return
    function fuori(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setAperta(false)
    }
    document.addEventListener('mousedown', fuori)
    return () => document.removeEventListener('mousedown', fuori)
  }, [aperta])

  const oggi = new Date().toDateString()
  const diOggi = notifiche.filter(n => new Date(n.createdAt).toDateString() === oggi)

  async function apri() {
    const prossimo = !aperta
    setAperta(prossimo)
    // Aprendo si azzera il pallino: le notifiche di oggi risultano viste
    if (prossimo && daLeggere > 0) {
      await fetch('/api/care/notifiche', { method: 'PATCH', credentials: 'include' }).catch(() => {})
      ricarica()
    }
  }

  return (
    <div className="relative" ref={box}>
      <button onClick={apri} aria-label="Notifiche"
        className="relative w-5 h-5 text-ink-navy/50 hover:text-ink-navy transition-colors block">
        <IconBell />
        {/* Giallo = ci sono richieste da accettare, ha la precedenza sul blu
            delle notifiche semplicemente non lette */}
        {(richiesteDaVerificare > 0 || daLeggere > 0) && (
          <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
            richiesteDaVerificare > 0 ? 'bg-zest-lime' : 'bg-electric-blue'}`} />
        )}
      </button>

      {aperta && (
        <div className="absolute right-0 top-8 w-80 bg-white rounded-2xl border border-ink-navy/10 shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-navy/8">
            <p className="text-sm font-bold text-ink-navy">Oggi</p>
          </div>

          {richiesteDaVerificare > 0 && (
            <Link href="/care/dashboard/richieste" onClick={() => setAperta(false)}
              className="flex items-center gap-2 px-4 py-2.5 bg-zest-lime/25 hover:bg-zest-lime/40 transition-colors border-b border-ink-navy/8">
              <span className="w-2 h-2 rounded-full bg-zest-lime ring-1 ring-ink-navy/20 shrink-0" />
              <p className="text-sm font-semibold text-ink-navy">
                {richiesteDaVerificare} {richiesteDaVerificare === 1 ? 'richiesta da accettare' : 'richieste da accettare'}
              </p>
            </Link>
          )}

          <div className="max-h-80 overflow-y-auto">
            {diOggi.length === 0 ? (
              <p className="text-sm text-ink-navy/35 text-center py-8">Nessuna notifica oggi</p>
            ) : (
              diOggi.map(n => (
                <Link key={n.id} href={n.link ?? '/care/dashboard/notifiche'} onClick={() => setAperta(false)}
                  className="flex gap-3 px-4 py-3 hover:bg-mist transition-colors border-b border-ink-navy/5 last:border-0">
                  <span className="w-7 h-7 shrink-0 rounded-lg bg-electric-blue/10 text-electric-blue flex items-center justify-center p-1.5">
                    {iconaPerTipo(n.tipo)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-navy leading-snug">{n.titolo}</p>
                    {n.dettaglio && <p className="text-xs text-ink-navy/45 mt-0.5">{n.dettaglio}</p>}
                  </div>
                  <span className="text-[11px] text-ink-navy/30 shrink-0">{fmtOra(n.createdAt)}</span>
                </Link>
              ))
            )}
          </div>

          <Link href="/care/dashboard/notifiche" onClick={() => setAperta(false)}
            className="flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-semibold text-electric-blue hover:bg-mist transition-colors border-t border-ink-navy/8">
            Vedi tutte <span className="w-3 h-3"><IconArrowRight /></span>
          </Link>
        </div>
      )}
    </div>
  )
}

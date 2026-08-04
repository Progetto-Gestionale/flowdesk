'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { IconBell, IconArrowRight } from '@/app/components/icons'
import { fmtOra, iconaPerTipo, type Notifica } from './notificheUtil'

// Campanella della TopBar: pallino blu quando c'è da leggere, e al click il
// riepilogo di oggi. Lo storico completo sta in /care/dashboard/notifiche.
export default function Campanella() {
  const [notifiche, setNotifiche] = useState<Notifica[]>([])
  const [daLeggere, setDaLeggere] = useState(0)
  const [aperta, setAperta] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  async function carica() {
    try {
      const res = await fetch('/api/care/notifiche', { credentials: 'include', cache: 'no-store' })
      if (!res.ok) return
      const d = await res.json()
      setNotifiche(d.notifiche ?? [])
      setDaLeggere(d.daLeggere ?? 0)
    } catch { /* la campanella non è critica: se fallisce resta com'è */ }
  }

  useEffect(() => {
    carica()
    const t = setInterval(carica, 30000)
    const aggiorna = () => carica()
    window.addEventListener('notifiche-aggiornate', aggiorna)
    return () => { clearInterval(t); window.removeEventListener('notifiche-aggiornate', aggiorna) }
  }, [])

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
      setDaLeggere(0)
      await fetch('/api/care/notifiche', { method: 'PATCH', credentials: 'include' }).catch(() => {})
      carica()
    }
  }

  return (
    <div className="relative" ref={box}>
      <button onClick={apri} aria-label="Notifiche"
        className="relative w-5 h-5 text-ink-navy/50 hover:text-ink-navy transition-colors block">
        <IconBell />
        {daLeggere > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-electric-blue ring-2 ring-white" />
        )}
      </button>

      {aperta && (
        <div className="absolute right-0 top-8 w-80 bg-white rounded-2xl border border-ink-navy/10 shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-navy/8">
            <p className="text-sm font-bold text-ink-navy">Oggi</p>
          </div>

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

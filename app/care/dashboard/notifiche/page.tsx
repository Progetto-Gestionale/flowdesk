'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconBell } from '@/app/components/icons'
import {
  chiaveGiorno, etichettaGiorno, fmtOra, iconaPerTipo, segnalaAggiornamento,
  GIORNI_CONSERVAZIONE, type Notifica,
} from '../components/notificheUtil'

export default function NotifichePage() {
  const [notifiche, setNotifiche] = useState<Notifica[]>([])
  const [loading, setLoading] = useState(true)

  async function carica() {
    const res = await fetch('/api/care/notifiche', { credentials: 'include', cache: 'no-store' })
    const d = await res.json()
    setNotifiche(d.notifiche ?? [])
    setLoading(false)
  }

  // Aprendo la pagina si considerano tutte viste: il pallino sulla campanella sparisce
  useEffect(() => {
    carica().then(() =>
      fetch('/api/care/notifiche', { method: 'PATCH', credentials: 'include' })
        .then(() => segnalaAggiornamento())
        .catch(() => {}),
    )
  }, [])

  async function elimina(query: string) {
    await fetch(`/api/care/notifiche${query}`, { method: 'DELETE', credentials: 'include' })
    await carica()
    segnalaAggiornamento()
  }

  // Raggruppate per giorno, mantenendo l'ordine dal più recente
  const gruppi: { giorno: string; items: Notifica[] }[] = []
  for (const n of notifiche) {
    const g = chiaveGiorno(n.createdAt)
    const ultimo = gruppi[gruppi.length - 1]
    if (ultimo?.giorno === g) ultimo.items.push(n)
    else gruppi.push({ giorno: g, items: [n] })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Notifiche</h1>
          <p className="text-ink-navy/50 mt-0.5">
            Si cancellano da sole dopo {GIORNI_CONSERVAZIONE} giorni
          </p>
        </div>
        {notifiche.length > 0 && (
          <button onClick={() => elimina('')}
            className="text-sm font-semibold text-ink-navy/50 hover:text-red-500 transition-colors">
            Cancella tutte
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : notifiche.length === 0 ? (
        <div className="bg-white border border-dashed border-ink-navy/15 rounded-xl p-12 text-center text-ink-navy/35">
          <div className="w-11 h-11 rounded-xl bg-mist flex items-center justify-center p-2.5 mx-auto mb-4">
            <IconBell />
          </div>
          <p className="font-medium">Nessuna notifica</p>
          <p className="text-sm mt-1">Qui finiscono richieste, appuntamenti e sedute appena si muovono</p>
        </div>
      ) : (
        <div className="space-y-6">
          {gruppi.map(g => (
            <div key={g.giorno}>
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wider">
                  {etichettaGiorno(g.giorno)}
                </p>
                <button onClick={() => elimina(`?giorno=${g.giorno}`)}
                  aria-label={`Cancella le notifiche di ${etichettaGiorno(g.giorno)}`}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-ink-navy/25 hover:text-red-500 hover:bg-red-50 transition-colors text-sm">
                  ✕
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-ink-navy/10 overflow-hidden">
                {g.items.map(n => (
                  <div key={n.id}
                    className="group flex items-center gap-3 px-4 py-3 border-b border-ink-navy/5 last:border-0 hover:bg-mist/60 transition-colors">
                    <span className="w-8 h-8 shrink-0 rounded-lg bg-electric-blue/10 text-electric-blue flex items-center justify-center p-2">
                      {iconaPerTipo(n.tipo)}
                    </span>

                    {n.link ? (
                      <Link href={n.link} className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-navy leading-snug">{n.titolo}</p>
                        {n.dettaglio && <p className="text-xs text-ink-navy/45 mt-0.5">{n.dettaglio}</p>}
                      </Link>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-navy leading-snug">{n.titolo}</p>
                        {n.dettaglio && <p className="text-xs text-ink-navy/45 mt-0.5">{n.dettaglio}</p>}
                      </div>
                    )}

                    <span className="text-[11px] text-ink-navy/30 shrink-0">{fmtOra(n.createdAt)}</span>
                    <button onClick={() => elimina(`?id=${n.id}`)} aria-label="Cancella notifica"
                      className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full text-ink-navy/20 hover:text-red-500 hover:bg-red-50 transition-colors text-sm opacity-0 group-hover:opacity-100 focus:opacity-100">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

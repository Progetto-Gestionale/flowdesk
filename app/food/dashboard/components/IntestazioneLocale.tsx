'use client'
import { useEffect, useState } from 'react'
import { getCache, setCache } from '@/lib/pageCache'

const INTESTAZIONE_CACHE_KEY = 'food:intestazione-locale' // cache navigazione (stale-while-revalidate)

interface Intestazione {
  nomeLocale: string | null
  menuLogoUrl: string | null
}

// Intestazione dell'overview: logo del locale (lo stesso caricato sul menu) a sinistra e
// nome del locale grande a destra. Dati da /api/settings (nomeLocale + menuLogoUrl).
export default function IntestazioneLocale() {
  const [dati, setDati] = useState<Intestazione | null>(null)

  useEffect(() => {
    const cached = getCache<Intestazione>(INTESTAZIONE_CACHE_KEY)
    if (cached) setDati(cached)
    fetch('/api/settings', { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return
        const v: Intestazione = { nomeLocale: d.nomeLocale ?? null, menuLogoUrl: d.menuLogoUrl ?? null }
        setDati(v)
        setCache(INTESTAZIONE_CACHE_KEY, v)
      })
      .catch(() => {})
  }, [])

  const nome = dati?.nomeLocale || 'Il tuo locale'

  return (
    <header className="flex items-center gap-4 sm:gap-5 shrink-0">
      {dati?.menuLogoUrl ? (
        <img
          src={dati.menuLogoUrl}
          alt={nome}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-ink-navy/10 shadow-sm shrink-0"
        />
      ) : (
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-ink-navy/5 border border-ink-navy/10 flex items-center justify-center text-3xl shrink-0">
          🍽️
        </div>
      )}
      <h1 className="text-2xl sm:text-3xl xl:text-4xl font-extrabold text-ink-navy truncate">{nome}</h1>
    </header>
  )
}

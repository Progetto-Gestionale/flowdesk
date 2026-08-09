'use client'
import { useEffect, useState } from 'react'
import { getCache, setCache } from '@/lib/pageCache'

const RESOCONTO_CACHE_KEY = 'food:resoconto-serata' // cache navigazione (stale-while-revalidate)

interface Serata {
  prenotazioniNum: number
  prenotazioniCoperti: number
  copertiConti: number
  incassoTavoli: number
  incassoOrdiniDelivery: number
  incassoTotale: number
  tavoliLiberi: number
  copertiLiberi: number
  tavoliTotali: number
}

const fmtEur = (n: number) => `€ ${n.toFixed(2)}`

export default function ResocontoSerata() {
  const [dati, setDati] = useState<Serata | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let attivo = true
    // Idrata subito dall'ultimo dato in cache (se c'è): niente flash di caricamento al ritorno.
    const cached = getCache<Serata>(RESOCONTO_CACHE_KEY)
    if (cached) { setDati(cached); setLoading(false) }
    const carica = () => {
      fetch('/api/analytics/serata', { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then((d: Serata | null) => { if (!attivo) return; setDati(d); if (d) setCache(RESOCONTO_CACHE_KEY, d) })
        .catch(() => {})
        .finally(() => { if (attivo) setLoading(false) })
    }
    carica()
    const iv = setInterval(carica, 60000) // aggiorna tavoli/coperti liberi ~ogni minuto
    return () => { attivo = false; clearInterval(iv) }
  }, [])

  // Incassi in cima (i due box più importanti a colpo d'occhio), poi tavoli/coperti/prenotazioni.
  const box: { label: string; value: string; sub: string; accent: string }[] = [
    {
      label: 'Incasso tavoli',
      value: dati ? fmtEur(dati.incassoTavoli) : '—',
      sub: 'conti chiusi',
      accent: 'text-emerald-600',
    },
    {
      label: 'Incasso ordini & delivery',
      value: dati ? fmtEur(dati.incassoOrdiniDelivery) : '—',
      sub: 'asporto + delivery',
      accent: 'text-emerald-600',
    },
    {
      label: 'Tavoli liberi ora',
      value: dati ? String(dati.tavoliLiberi) : '—',
      sub: dati ? `su ${dati.tavoliTotali} totali` : ' ',
      accent: 'text-electric-blue',
    },
    {
      label: 'Coperti liberi ora',
      value: dati ? String(dati.copertiLiberi) : '—',
      sub: 'posti disponibili',
      accent: 'text-electric-blue',
    },
    {
      label: 'Prenotazioni serata',
      value: dati ? String(dati.prenotazioniNum) : '—',
      sub: dati ? `${dati.prenotazioniNum === 1 ? '1 tavolo' : `${dati.prenotazioniNum} tavoli`} · ${dati.prenotazioniCoperti} coperti` : ' ',
      accent: 'text-electric-blue',
    },
    {
      label: 'Coperti serviti',
      value: dati ? String(dati.copertiConti) : '—',
      sub: 'dai conti chiusi',
      accent: 'text-ink-navy',
    },
  ]

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-lg font-bold text-ink-navy">Resoconto della serata</h2>
        {dati && (
          <span className="text-sm text-ink-navy/50">
            Incasso totale <strong className="text-ink-navy">{fmtEur(dati.incassoTotale)}</strong>
          </span>
        )}
      </div>
      {/* 3 colonne già da tablet (iPad) così tutti e 6 i box stanno in due righe, senza scorrere.
          Box meno alti (aspect 5/4) per far entrare entrambe le righe nell'altezza dello schermo. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {box.map(it => (
          <div
            key={it.label}
            className="bg-white border border-ink-navy/10 rounded-2xl shadow-sm p-3 sm:p-4 aspect-square sm:aspect-[5/4] flex flex-col text-center"
          >
            {/* Titolo in alto, separato da una riga orizzontale dai dati sottostanti */}
            <p className="text-xs sm:text-sm font-semibold text-ink-navy/45 uppercase tracking-wider leading-tight pb-2 sm:pb-3 border-b border-ink-navy/10">{it.label}</p>
            <div className="flex-1 flex flex-col items-center justify-center gap-1">
              <p className={`text-2xl sm:text-2xl xl:text-3xl font-extrabold tabular-nums leading-none break-words ${it.accent} ${loading ? 'opacity-30' : ''}`}>{it.value}</p>
              <p className="text-sm text-ink-navy/40">{it.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'

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
    const carica = () => {
      fetch('/api/analytics/serata', { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then((d: Serata | null) => { if (attivo) setDati(d) })
        .catch(() => {})
        .finally(() => { if (attivo) setLoading(false) })
    }
    carica()
    const iv = setInterval(carica, 60000) // aggiorna tavoli/coperti liberi ~ogni minuto
    return () => { attivo = false; clearInterval(iv) }
  }, [])

  const box: { label: string; value: string; sub: string; accent: string }[] = [
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
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {box.map(it => (
          <div
            key={it.label}
            className="bg-white border border-ink-navy/10 rounded-2xl shadow-sm p-4 aspect-square flex flex-col justify-between"
          >
            <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wider leading-tight">{it.label}</p>
            <div>
              <p className={`text-xl sm:text-2xl font-extrabold tabular-nums leading-none ${it.accent} ${loading ? 'opacity-30' : ''}`}>{it.value}</p>
              <p className="text-xs text-ink-navy/40 mt-1.5">{it.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

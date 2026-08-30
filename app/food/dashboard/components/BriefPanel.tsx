'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { IconBolt, IconArrowRight, IconRefresh } from '@/app/components/icons'
// SOLO tipi: `import type` viene cancellato in compilazione → l'SDK AI NON entra
// nel bundle client.
import type { Brief, BriefContext, Metric, Timeframe } from '@/lib/copilot/ai'

type Resp = { brief: Brief; context: BriefContext; spesaMese?: { costoEur: number } | null }

const TABS: { id: Timeframe; label: string }[] = [
  { id: 'daily', label: 'Oggi' },
  { id: 'weekly', label: 'Settimana' },
  { id: 'monthly', label: 'Mese' },
]

// I pulsanti-azione (Fase A, sola lettura) sono deep-link a sezioni reali.
const AZIONE_HREF: Record<string, string> = {
  apri_menu: '/food/dashboard/menu',
  apri_analytics: '/food/dashboard/analytics',
  apri_prenotazioni: '/food/dashboard/clienti/preventivi',
}

const SEMAFORO: Record<string, { dot: string; testo: string; sfondo: string }> = {
  green: { dot: 'bg-emerald-500', testo: 'text-emerald-700', sfondo: 'bg-emerald-50 border-emerald-200' },
  yellow: { dot: 'bg-amber-500', testo: 'text-amber-700', sfondo: 'bg-amber-50 border-amber-200' },
  red: { dot: 'bg-red-500', testo: 'text-red-700', sfondo: 'bg-red-50 border-red-200' },
}

const URGENZA: Record<string, string> = {
  high: 'border-red-300 text-red-700 hover:bg-red-50',
  medium: 'border-ink-navy/15 text-ink-navy hover:border-electric-blue hover:text-electric-blue',
  low: 'border-ink-navy/15 text-ink-navy/70 hover:border-electric-blue hover:text-electric-blue',
}

// Formatta un numero/valore per il display (i NUMERI li stampa il frontend dal
// context, non l'AI). EUR e % gestiti; interi con separatore italiano.
function formatValue(m: Metric): string {
  const v = m.value
  if (typeof v === 'string') return v
  const n = m.unit === 'EUR' || m.unit === '%' ? v : Math.round(v)
  const num = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: m.unit === 'EUR' ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n)
  if (m.unit === 'EUR') return `${num} €`
  if (m.unit === '%') return `${num}%`
  if (m.unit) return `${num} ${m.unit}`
  return num
}

export default function BriefPanel() {
  const router = useRouter()
  const [timeframe, setTimeframe] = useState<Timeframe>('daily')
  const [cache, setCache] = useState<Partial<Record<Timeframe, Resp>>>({})
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async (tf: Timeframe, forza = false) => {
    if (!forza && cache[tf]) return // già in cache: niente chiamata (risparmio)
    setLoading(true)
    setErrore(null)
    try {
      const res = await fetch('/api/copilot/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ timeframe: tf }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore nella generazione del brief.')
      setCache((c) => ({ ...c, [tf]: data as Resp }))
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di connessione.')
    } finally {
      setLoading(false)
    }
  }, [cache])

  useEffect(() => {
    void carica(timeframe)
  }, [timeframe, carica])

  const attuale = cache[timeframe]
  const brief = attuale?.brief
  const context = attuale?.context
  const sem = brief ? SEMAFORO[brief.status] ?? SEMAFORO.yellow : SEMAFORO.yellow

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6">
      {/* Intestazione + tab */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-[28%] bg-electric-blue flex items-center justify-center shrink-0 text-white">
          <span className="w-[20px] h-[20px]"><IconBolt /></span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold text-ink-navy leading-tight">Brief del locale</h1>
          <p className="text-xs text-ink-navy/50">Cosa sta succedendo e cosa conviene fare</p>
        </div>
        <button
          onClick={() => void carica(timeframe, true)}
          disabled={loading}
          className="w-9 h-9 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:border-electric-blue hover:text-electric-blue transition-colors flex items-center justify-center disabled:opacity-40"
          title="Rigenera"
          aria-label="Rigenera"
        >
          <span className={`w-[16px] h-[16px] ${loading ? 'animate-spin' : ''}`}><IconRefresh /></span>
        </button>
      </div>

      <div className="flex gap-1 mb-6 bg-mist rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTimeframe(t.id)}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${
              timeframe === t.id ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !attuale && (
        <div className="flex items-center gap-2 text-ink-navy/50 text-sm py-10 justify-center">
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-ink-navy/40 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-ink-navy/40 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-ink-navy/40 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          Sto analizzando i dati…
        </div>
      )}

      {errore && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
          {errore}
        </div>
      )}

      {brief && context && (
        <div className="space-y-6">
          {/* BLOCCO 1 — Semaforo + headline */}
          <div className={`rounded-2xl border px-4 py-4 flex items-start gap-3 ${sem.sfondo}`}>
            <span className={`w-3 h-3 rounded-full mt-1 shrink-0 ${sem.dot}`} />
            <p className={`text-sm font-semibold leading-relaxed ${sem.testo}`}>{brief.headline}</p>
          </div>

          {/* I NUMERI (dal context, non dal testo AI) */}
          <div className="space-y-4">
            {context.sections.map((s) => (
              <div key={s.key}>
                <p className="font-mono text-[10px] font-semibold text-ink-navy/40 uppercase tracking-wider mb-2">
                  {s.title}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {s.metrics.map((m) => (
                    <div key={m.key} className="rounded-xl border border-ink-navy/10 px-3 py-2">
                      <p className="text-[11px] text-ink-navy/50 leading-tight">{m.label}</p>
                      <p className="text-sm font-bold text-ink-navy tabular-nums mt-0.5">{formatValue(m)}</p>
                      {m.deltaLabel && (
                        <p
                          className={`text-[11px] mt-0.5 ${
                            m.delta != null && m.delta < 0 ? 'text-red-600' : m.delta != null && m.delta > 0 ? 'text-emerald-600' : 'text-ink-navy/40'
                          }`}
                        >
                          {m.deltaLabel}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* BLOCCO 2 — Il perché */}
          {brief.why.length > 0 && (
            <div>
              <p className="font-mono text-[10px] font-semibold text-ink-navy/40 uppercase tracking-wider mb-2">
                Perché
              </p>
              <div className="space-y-2">
                {brief.why.map((w, i) => (
                  <div key={i} className="rounded-xl bg-mist px-4 py-3">
                    <p className="text-sm font-semibold text-ink-navy">{w.title}</p>
                    <p className="text-sm text-ink-navy/70 leading-relaxed mt-0.5">{w.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BLOCCO 3 — Cosa fare */}
          {brief.actions.length > 0 && (
            <div>
              <p className="font-mono text-[10px] font-semibold text-ink-navy/40 uppercase tracking-wider mb-2">
                Cosa fare
              </p>
              <div className="flex flex-wrap gap-2">
                {brief.actions.map((a, i) => {
                  const href = AZIONE_HREF[a.id]
                  return (
                    <button
                      key={i}
                      onClick={() => href && router.push(href)}
                      disabled={!href}
                      className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                        URGENZA[a.urgency] ?? URGENZA.medium
                      }`}
                    >
                      {a.label}
                      <span className="w-[14px] h-[14px]"><IconArrowRight /></span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <p className="text-[10px] text-ink-navy/40 text-center pt-2">
            Analisi generata dall'AI sui tuoi dati. Verifica sempre prima di decisioni importanti.
          </p>
        </div>
      )}
    </div>
  )
}

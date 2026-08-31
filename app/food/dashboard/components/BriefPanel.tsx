'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { IconBolt, IconArrowRight, IconRefresh } from '@/app/components/icons'
// SOLO tipi: `import type` viene cancellato in compilazione → l'SDK AI NON entra
// nel bundle client.
import type { Brief, BriefContext, Metric, ProposedAction, Timeframe } from '@/lib/copilot/ai'

type Resp = { brief: Brief; context: BriefContext; spesaMese?: { costoEur: number } | null }

const TABS: { id: Timeframe; label: string }[] = [
  { id: 'daily', label: 'Oggi' },
  { id: 'weekly', label: 'Settimana' },
  { id: 'monthly', label: 'Mese' },
]

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

// I brief generati restano salvati nel browser (per-dispositivo) SENZA scadenza:
// una volta generato un periodo, resta finché non premi Rigenera. Niente TTL.
const STORAGE_KEY = 'food:copilot-brief'

function loadBrief(): Partial<Record<Timeframe, Resp>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<Record<Timeframe, Resp>>) : {}
  } catch {
    return {}
  }
}

function saveBrief(cache: Partial<Record<Timeframe, Resp>>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {}
}

// Callback opzionali per la pagina unica Copilota: le usa per sapere quale brief è
// attivo (così la chat sotto può passarne il timeframe) e per aggiornare il
// contatore spesa condiviso. Usato da solo (pagina /brief) i default non fanno nulla.
interface BriefPanelProps {
  onActive?: (timeframe: Timeframe, hasBrief: boolean) => void
  onSpesa?: (costoEur: number) => void
  embedded?: boolean // dentro la pagina unica: intestazione più sobria
}

export default function BriefPanel({ onActive, onSpesa, embedded }: BriefPanelProps = {}) {
  const router = useRouter()
  const [timeframe, setTimeframe] = useState<Timeframe>('daily')
  const [cache, setCache] = useState<Partial<Record<Timeframe, Resp>>>({})
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null)
  const [azioniEsito, setAzioniEsito] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const idratato = useRef(false)

  // Genera SEMPRE (usata sia dall'auto-load di un periodo mancante, sia dal tasto
  // Rigenera). Il risultato viene salvato e resta finché non lo rigeneri.
  const carica = useCallback(async (tf: Timeframe) => {
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
      if (typeof (data as Resp).spesaMese?.costoEur === 'number') onSpesa?.((data as Resp).spesaMese!.costoEur)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di connessione.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Idratazione una-tantum dai brief salvati (dopo il mount → niente mismatch SSR).
  useEffect(() => {
    const salvati = loadBrief()
    if (Object.keys(salvati).length) setCache(salvati)
    idratato.current = true
  }, [])

  // Persistenza a ogni cambio (mai l'oggetto vuoto iniziale, per non cancellare).
  useEffect(() => {
    if (idratato.current && Object.keys(cache).length > 0) saveBrief(cache)
  }, [cache])

  // Auto-generazione SOLO se il periodo scelto non ha già un brief salvato.
  useEffect(() => {
    if (!idratato.current) return
    if (cache[timeframe] || loading) return
    void carica(timeframe)
  }, [timeframe, cache, loading, carica])

  const attuale = cache[timeframe]
  const brief = attuale?.brief
  const context = attuale?.context

  // Comunica alla pagina unica quale brief è attivo (per la chat sotto).
  useEffect(() => {
    onActive?.(timeframe, !!cache[timeframe])
  }, [timeframe, cache, onActive])
  const sem = brief ? SEMAFORO[brief.status] ?? SEMAFORO.yellow : SEMAFORO.yellow

  // Esegue un'azione proposta. Il "come" viene dal context (fidato), non dall'AI:
  // 'link' naviga; 'sposta_in_cima' scrive sul DB DOPO conferma esplicita.
  async function eseguiAzione(a: ProposedAction) {
    const def = context?.allowedActions.find((x) => x.id === a.id)
    if (!def) return
    if (def.kind !== 'sposta_in_cima') {
      if (def.target?.href) router.push(def.target.href)
      return
    }
    const piattoId = def.target?.piattoId
    const nome = def.target?.piattoNome ?? 'questo piatto'
    if (!piattoId) return
    if (!window.confirm(`Mettere "${nome}" in cima al suo menu? Cambia solo l'ordine, non prezzo o disponibilità.`)) return
    setAzioneInCorso(a.id)
    try {
      const res = await fetch('/api/copilot/azioni/sposta-in-cima', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ piattoId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Azione non riuscita.')
      setAzioniEsito((e) => ({ ...e, [a.id]: { ok: true, msg: `Fatto: "${data.nome}" è ora in cima al menu.` } }))
    } catch (err) {
      setAzioniEsito((e) => ({ ...e, [a.id]: { ok: false, msg: err instanceof Error ? err.message : 'Errore, riprova.' } }))
    } finally {
      setAzioneInCorso(null)
    }
  }

  return (
    <div className={embedded ? 'w-full' : 'max-w-3xl mx-auto w-full px-4 sm:px-6 py-6'}>
      {/* Intestazione + tab */}
      <div className="flex items-center gap-3 mb-5">
        {!embedded && (
          <>
            <div className="w-9 h-9 rounded-[28%] bg-electric-blue flex items-center justify-center shrink-0 text-white">
              <span className="w-[20px] h-[20px]"><IconBolt /></span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-extrabold text-ink-navy leading-tight">Brief del locale</h1>
              <p className="text-xs text-ink-navy/50">Cosa sta succedendo e cosa conviene fare</p>
            </div>
          </>
        )}
        {embedded && <p className="flex-1 font-mono text-[10px] font-semibold text-ink-navy/40 uppercase tracking-wider">Brief del locale</p>}
        <button
          onClick={() => void carica(timeframe)}
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
              <div className="flex flex-col gap-2">
                {brief.actions.map((a, i) => {
                  const def = context.allowedActions.find((x) => x.id === a.id)
                  const esito = azioniEsito[a.id]
                  const inCorso = azioneInCorso === a.id
                  const scrive = def?.kind === 'sposta_in_cima'
                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <button
                        onClick={() => eseguiAzione(a)}
                        disabled={inCorso || !def || (esito?.ok ?? false)}
                        className={`inline-flex items-center gap-1.5 self-start text-sm font-medium px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                          URGENZA[a.urgency] ?? URGENZA.medium
                        }`}
                      >
                        {inCorso ? 'Attendi…' : a.label}
                        <span className="w-[14px] h-[14px]">{scrive ? <IconBolt /> : <IconArrowRight />}</span>
                      </button>
                      {esito && (
                        <p className={`text-[11px] ${esito.ok ? 'text-emerald-600' : 'text-red-600'}`}>{esito.msg}</p>
                      )}
                    </div>
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

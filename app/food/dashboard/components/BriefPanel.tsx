'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { IconBolt, IconArrowRight, IconRefresh } from '@/app/components/icons'
// SOLO tipi: `import type` viene cancellato in compilazione → l'SDK AI NON entra
// nel bundle client.
import type { Brief, BriefContext, Metric, ProposedAction, Timeframe } from '@/lib/copilot/ai'

type Resp = { brief: Brief; context: BriefContext; generatedAt?: string; spesaMese?: { costoEur: number } | null }

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

// Etichetta leggibile del PERIODO a cui si riferisce il brief. Il brief usa finestre
// mobili GIÀ CHIUSE: daily = ieri, weekly = ultimi 7 giorni fino a ieri, monthly =
// ultimi 30 giorni fino a ieri. Mostrarlo toglie l'ambiguità ("a che settimana si
// riferisce?"). period.start/period.end sono "YYYY-MM-DD".
function formatPeriodo(timeframe: Timeframe, period?: { start: string; end: string }): string | null {
  if (!period?.start || !period?.end) return null
  const parse = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, (m ?? 1) - 1, d ?? 1)
  }
  const giorno = (dt: Date, conAnno = false) =>
    dt.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', ...(conAnno ? { year: 'numeric' } : {}) })
  const start = parse(period.start)
  const end = parse(period.end)
  if (timeframe === 'daily') return `Ieri, ${giorno(end, true)}`
  const prefisso = timeframe === 'weekly' ? 'Ultimi 7 giorni' : 'Ultimi 30 giorni'
  return `${prefisso} · ${giorno(start)} – ${giorno(end, true)}`
}

// "Generato stamattina alle 7:30" / "Generato alle 14:05" / "Generato ieri alle …".
// Dà fiducia: il titolare sa quanto è fresco il brief che sta guardando.
function formatGenerato(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
  const giornoGen = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  if (giornoGen === oggi) {
    const mattino = d.getHours() < 12
    return `Generato ${mattino ? 'stamattina' : 'oggi'} alle ${ora}`
  }
  return `Generato il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: 'Europe/Rome' })} alle ${ora}`
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
  // Periodi già sincronizzati col server in questa sessione: evita GET ripetuti,
  // ma garantisce ALMENO un fetch del pronto anche se la cache locale è vecchia
  // (così il brief del mattino sostituisce quello del giorno prima).
  const sincronizzati = useRef<Set<Timeframe>>(new Set())

  // RIGENERA (POST): ricalcola il brief e lo salva lato server. Usata dal tasto
  // Rigenera e come fallback quando non c'è ancora nulla di pronto. Costa (AI).
  const rigenera = useCallback(async (tf: Timeframe) => {
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
  }, [onSpesa])

  // CARICA IL PRONTO (GET): recupera il brief già generato dal cron del mattino
  // (o dall'ultima rigenerazione). Nessun costo AI. Se non c'è nulla di salvato,
  // ripiega su una generazione on-demand.
  const caricaPronto = useCallback(async (tf: Timeframe) => {
    setLoading(true)
    setErrore(null)
    try {
      const res = await fetch(`/api/copilot/brief?timeframe=${tf}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore nel caricamento del brief.')
      if (data.brief) {
        setCache((c) => ({ ...c, [tf]: data as Resp }))
        setLoading(false)
      } else {
        // Niente di pronto per questo periodo → generalo ora.
        await rigenera(tf)
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di connessione.')
      setLoading(false)
    }
  }, [rigenera])

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

  // Una volta per periodo e per sessione, sincronizza col server: recupera il
  // brief pronto (cron del mattino o ultima rigenerazione). La cache locale serve
  // solo al paint istantaneo; la verità è lato server. Se il server non ha nulla,
  // caricaPronto ripiega su una generazione on-demand.
  useEffect(() => {
    if (!idratato.current) return
    if (loading) return
    if (sincronizzati.current.has(timeframe)) return
    sincronizzati.current.add(timeframe)
    void caricaPronto(timeframe)
  }, [timeframe, loading, caricaPronto])

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

    // 'link' (o assente): semplice navigazione, nessuna scrittura.
    if (!def.kind || def.kind === 'link') {
      if (def.target?.href) router.push(def.target.href)
      return
    }

    // Azioni di SCRITTURA: conferma esplicita, poi POST alla rotta dedicata.
    const nome = def.target?.piattoNome ?? 'questo piatto'
    const piattoId = def.target?.piattoId
    if (!piattoId) return
    let endpoint: string
    let body: Record<string, unknown>

    if (def.kind === 'sposta_in_cima') {
      if (!window.confirm(`Mettere "${nome}" in cima al suo menu? Cambia solo l'ordine, non prezzo o disponibilità.`)) return
      endpoint = '/api/copilot/azioni/sposta-in-cima'
      body = { piattoId }
    } else if (def.kind === 'cambia_prezzo') {
      // Prezzo modificabile prima di applicare: l'AI propone, il titolare decide la cifra.
      const suggerito = def.target?.prezzoSuggerito ?? def.target?.prezzoAttuale ?? 0
      const attuale = def.target?.prezzoAttuale
      const input = window.prompt(
        `Nuovo prezzo per "${nome}"${attuale != null ? ` (attuale ${attuale}€)` : ''}. Puoi modificarlo prima di confermare:`,
        String(suggerito),
      )
      if (input == null) return
      const nuovoPrezzo = Number(input.replace(',', '.'))
      if (!Number.isFinite(nuovoPrezzo) || nuovoPrezzo <= 0) {
        setAzioniEsito((e) => ({ ...e, [a.id]: { ok: false, msg: 'Prezzo non valido.' } }))
        return
      }
      endpoint = '/api/copilot/azioni/cambia-prezzo'
      body = { piattoId, nuovoPrezzo }
    } else if (def.kind === 'imposta_disponibilita') {
      // L'AI propone di segnare un piatto esaurito o di rimetterlo disponibile.
      const disponibile = def.target?.disponibile ?? false
      const verbo = disponibile ? 'rimettere disponibile' : 'segnare come esaurito'
      if (!window.confirm(`Vuoi ${verbo} "${nome}"?`)) return
      endpoint = '/api/copilot/azioni/disponibilita'
      body = { piattoId, disponibile }
    } else if (def.kind === 'imposta_aliquota') {
      // L'AI propone un'aliquota IVA di vendita per il piatto (es. alcolici in asporto).
      const aliquota = def.target?.aliquota
      if (aliquota == null) return
      if (!window.confirm(`Impostare l'aliquota IVA di "${nome}" al ${Math.round(aliquota * 100)}%?`)) return
      endpoint = '/api/copilot/azioni/aliquota-piatto'
      body = { piattoId, aliquota }
    } else {
      return
    }

    setAzioneInCorso(a.id)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Azione non riuscita.')
      let msg: string
      if (def.kind === 'cambia_prezzo') {
        msg = `Fatto: "${data.nome}" ora costa ${data.prezzoNuovo}€ (era ${data.prezzoVecchio}€).`
      } else if (def.kind === 'imposta_disponibilita') {
        msg = `Fatto: "${data.nome}" è ora ${data.disponibile ? 'di nuovo disponibile' : 'segnato come esaurito'}.`
      } else if (def.kind === 'imposta_aliquota') {
        msg = `Fatto: aliquota di "${data.nome}" impostata al ${data.aliquota != null ? Math.round(data.aliquota * 100) + '%' : 'valore di default'}.`
      } else {
        msg = `Fatto: "${data.nome}" è ora in cima al menu.`
      }
      setAzioniEsito((e) => ({ ...e, [a.id]: { ok: true, msg } }))
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
          onClick={() => void rigenera(timeframe)}
          disabled={loading}
          className="w-9 h-9 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:border-electric-blue hover:text-electric-blue transition-colors flex items-center justify-center disabled:opacity-40"
          title="Rigenera"
          aria-label="Rigenera"
        >
          <span className={`w-[16px] h-[16px] ${loading ? 'animate-spin' : ''}`}><IconRefresh /></span>
        </button>
      </div>

      <div className="flex gap-1 mb-2 bg-mist rounded-xl p-1 w-fit">
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

      {/* Periodo di riferimento: toglie l'ambiguità su "a quale settimana/mese si riferisce" (punto 1). */}
      <p className="text-xs text-ink-navy/45 mb-6">
        {formatPeriodo(timeframe, brief?.meta?.period ?? context?.period) ?? ' '}
      </p>

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
            <div className="min-w-0">
              <p className={`text-sm font-semibold leading-relaxed ${sem.testo}`}>{brief.headline}</p>
              {formatGenerato(attuale?.generatedAt) && (
                <p className={`text-[11px] mt-1 ${sem.testo} opacity-60`}>{formatGenerato(attuale?.generatedAt)}</p>
              )}
            </div>
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
                  const scrive = def?.kind === 'sposta_in_cima' || def?.kind === 'cambia_prezzo' || def?.kind === 'imposta_disponibilita' || def?.kind === 'imposta_aliquota'
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

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconBolt, IconArrowRight, IconRefresh, IconBot } from '@/app/components/icons'
// SOLO tipi: `import type` sparisce in compilazione → l'SDK AI non entra nel bundle client.
import type { Brief, BriefContext, Metric, ProposedAction } from '@/lib/copilot/ai'

// Risposta di /api/copilot/copilota. I NUMERI arrivano sempre (gratis); il verdetto
// (brief) può essere assente e generabile su richiesta.
type Numeri = { sections: BriefContext['sections']; statusHint: Brief['status'] | null; period: { start: string; end: string }; allowedActions: BriefContext['allowedActions'] }
type Resp = {
  brief: Brief | null
  numeri: Numeri
  label: string
  corrente: boolean
  cached?: boolean
  generatedAt?: string
  generabile?: boolean
  rigenerabile?: boolean
  vuoto?: boolean
  budget?: boolean
  spesaMese?: { costoEur: number } | null
}

const PERIODI: { id: string; label: string }[] = [
  { id: 'oggi', label: 'Oggi' },
  { id: 'settimana', label: 'Settimana' },
  { id: 'mese', label: 'Mese' },
  { id: 'anno', label: 'Anno' },
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

function formatValue(m: Metric): string {
  const v = m.value
  if (typeof v === 'string') return v
  const n = m.unit === 'EUR' || m.unit === '%' ? v : Math.round(v)
  const num = new Intl.NumberFormat('it-IT', { minimumFractionDigits: m.unit === 'EUR' ? 2 : 0, maximumFractionDigits: 2 }).format(n)
  if (m.unit === 'EUR') return `${num} €`
  if (m.unit === '%') return `${num}%`
  if (m.unit) return `${num} ${m.unit}`
  return num
}

// MOTORE DI RILEVANZA: riordina le sezioni per priorità (gravità/azionabilità/contesto).
// Niente si nasconde — cambia solo cosa viene prima. `focus` (da dove entri) dà una spinta.
function ordinaSezioni(sections: BriefContext['sections'], statusHint: string | null, periodo: string, focus?: string): BriefContext['sections'] {
  const red = statusHint === 'red'
  const has = (sec: BriefContext['sections'][number], k: string) => sec.metrics.some((m) => m.key === k)
  const base: Record<string, number> = periodo === 'oggi'
    ? { prenotazioni: 50, organico: 46, vendite: 42, economia: 38, menu: 34 }
    : { economia: 50, vendite: 46, menu: 42, organico: 38, prenotazioni: 34 }
  const score = (sec: BriefContext['sections'][number]) => {
    let s = base[sec.key] ?? 20
    if (focus === 'contabilita' && sec.key === 'economia') s += 200 // entri dalla contabilità
    if (focus === 'personale' && sec.key === 'organico') s += 200 // entri dal personale
    if (sec.key === 'menu' && has(sec, 'menu_in_perdita')) s += 100
    if (sec.key === 'economia' && red) s += 80
    if (sec.key === 'economia' && (has(sec, 'labor_non_tracciato') || has(sec, 'costi_fissi_mancanti') || has(sec, 'bolle_mancanti'))) s += 25
    if (sec.key === 'organico' && has(sec, 'organico_verdetto')) s += 35
    if (sec.key === 'menu' && has(sec, 'menu_palla_al_piede')) s += 20
    if (sec.key === 'prenotazioni' && periodo === 'oggi') s += 20
    return s
  }
  return sections.map((sec, i) => ({ sec, i, s: score(sec) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.sec)
}

// Navigazione dei periodi passati (coerente con la pagina Contabilità).
function spostaRiferimento(rif: Date, periodo: string, dir: 1 | -1): Date {
  const d = new Date(rif)
  if (periodo === 'settimana') d.setDate(d.getDate() + dir * 7)
  else if (periodo === 'anno') d.setFullYear(d.getFullYear() + dir)
  else if (periodo === 'oggi') d.setDate(d.getDate() + dir)
  else d.setMonth(d.getMonth() + dir)
  return d
}
function isCorrentePeriodo(rif: Date, periodo: string): boolean {
  const now = new Date()
  if (periodo === 'anno') return rif.getFullYear() === now.getFullYear()
  if (periodo === 'mese') return rif.getFullYear() === now.getFullYear() && rif.getMonth() === now.getMonth()
  if (periodo === 'settimana') {
    const lun = (d: Date) => { const x = new Date(d); const g = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - g); return x.getTime() }
    return lun(rif) === lun(now)
  }
  return rif.toDateString() === now.toDateString()
}

function formatGenerato(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
  const giornoGen = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  if (giornoGen === oggi) return `Generato oggi alle ${ora}`
  return `Generato il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: 'Europe/Rome' })} alle ${ora}`
}

interface Props {
  initialPeriodo?: string
  initialRiferimento?: string
  focus?: string // 'contabilita' | 'personale' — da dove sei entrato
  onSpesa?: (eur: number) => void
  onScope?: (periodo: string, riferimento: string) => void // per agganciare la chat
}

export default function CopilotaSurface({ initialPeriodo, initialRiferimento, focus, onSpesa, onScope }: Props) {
  const router = useRouter()
  const [periodo, setPeriodo] = useState(initialPeriodo && PERIODI.some((p) => p.id === initialPeriodo) ? initialPeriodo : 'oggi')
  const [riferimento, setRiferimento] = useState<Date>(initialRiferimento ? new Date(initialRiferimento) : new Date())
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null)
  const [azioniEsito, setAzioniEsito] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const scopeRef = useRef<(p: string, r: string) => void>(() => {})
  scopeRef.current = onScope ?? (() => {})

  const carica = useCallback(async (genera: boolean) => {
    if (genera) setGenerating(true); else setLoading(true)
    try {
      const url = `/api/copilot/copilota?periodo=${periodo}&riferimento=${riferimento.toISOString()}${genera ? '&genera=1' : ''}`
      const res = await fetch(url, { credentials: 'include' })
      const d = (await res.json()) as Resp
      if (res.ok) {
        setData(d)
        if (typeof d.spesaMese?.costoEur === 'number') onSpesa?.(d.spesaMese.costoEur)
      }
    } catch { /* silenzioso: la pagina resta usabile */ } finally {
      setLoading(false); setGenerating(false)
    }
  }, [periodo, riferimento, onSpesa])

  useEffect(() => { void carica(false) }, [carica])
  useEffect(() => { scopeRef.current(periodo, riferimento.toISOString()) }, [periodo, riferimento])

  const isCorrente = isCorrentePeriodo(riferimento, periodo)
  const brief = data?.brief ?? null
  const numeri = data?.numeri ?? null
  const sem = brief ? SEMAFORO[brief.status] ?? SEMAFORO.yellow : SEMAFORO.yellow

  async function eseguiAzione(a: ProposedAction) {
    const def = numeri?.allowedActions.find((x) => x.id === a.id)
    if (!def) return
    if (!def.kind || def.kind === 'link') { if (def.target?.href) router.push(def.target.href); return }
    const nome = def.target?.piattoNome ?? 'questo piatto'
    const piattoId = def.target?.piattoId
    if (!piattoId) return
    let endpoint: string
    let body: Record<string, unknown>
    if (def.kind === 'sposta_in_cima') {
      if (!window.confirm(`Mettere "${nome}" in cima al suo menu?`)) return
      endpoint = '/api/copilot/azioni/sposta-in-cima'; body = { piattoId }
    } else if (def.kind === 'cambia_prezzo') {
      const suggerito = def.target?.prezzoSuggerito ?? def.target?.prezzoAttuale ?? 0
      const attuale = def.target?.prezzoAttuale
      const input = window.prompt(`Nuovo prezzo per "${nome}"${attuale != null ? ` (attuale ${attuale}€)` : ''}:`, String(suggerito))
      if (input == null) return
      const nuovoPrezzo = Number(input.replace(',', '.'))
      if (!Number.isFinite(nuovoPrezzo) || nuovoPrezzo <= 0) { setAzioniEsito((e) => ({ ...e, [a.id]: { ok: false, msg: 'Prezzo non valido.' } })); return }
      endpoint = '/api/copilot/azioni/cambia-prezzo'; body = { piattoId, nuovoPrezzo }
    } else if (def.kind === 'imposta_disponibilita') {
      const disponibile = def.target?.disponibile ?? false
      if (!window.confirm(`Vuoi ${disponibile ? 'rimettere disponibile' : 'segnare come esaurito'} "${nome}"?`)) return
      endpoint = '/api/copilot/azioni/disponibilita'; body = { piattoId, disponibile }
    } else if (def.kind === 'imposta_aliquota') {
      const aliquota = def.target?.aliquota
      if (aliquota == null) return
      if (!window.confirm(`Impostare l'aliquota IVA di "${nome}" al ${Math.round(aliquota * 100)}%?`)) return
      endpoint = '/api/copilot/azioni/aliquota-piatto'; body = { piattoId, aliquota }
    } else { return }
    setAzioneInCorso(a.id)
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Azione non riuscita.')
      const msg = def.kind === 'cambia_prezzo' ? `Fatto: "${d.nome}" ora costa ${d.prezzoNuovo}€ (era ${d.prezzoVecchio}€).`
        : def.kind === 'imposta_disponibilita' ? `Fatto: "${d.nome}" è ora ${d.disponibile ? 'di nuovo disponibile' : 'segnato come esaurito'}.`
          : def.kind === 'imposta_aliquota' ? `Fatto: aliquota di "${d.nome}" impostata.`
            : `Fatto: "${d.nome}" è ora in cima al menu.`
      setAzioniEsito((e) => ({ ...e, [a.id]: { ok: true, msg } }))
    } catch (err) {
      setAzioniEsito((e) => ({ ...e, [a.id]: { ok: false, msg: err instanceof Error ? err.message : 'Errore, riprova.' } }))
    } finally { setAzioneInCorso(null) }
  }

  const renderSezione = (s: BriefContext['sections'][number], evidenza: boolean) => (
    <div key={s.key}>
      <p className={`font-mono text-[10px] font-semibold uppercase tracking-wider mb-2 ${evidenza ? 'text-electric-blue' : 'text-ink-navy/40'}`}>{s.title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {s.metrics.map((m) => (
          <div key={m.key} className={`rounded-xl border border-ink-navy/10 px-3 py-2 ${evidenza ? 'bg-mist' : 'bg-white'}`}>
            <p className="text-[11px] text-ink-navy/50 leading-tight">{m.label}</p>
            <p className="text-sm font-bold text-ink-navy tabular-nums mt-0.5">{formatValue(m)}</p>
            {m.deltaLabel && (
              <p className={`text-[11px] mt-0.5 ${m.delta != null && m.delta < 0 ? 'text-red-600' : m.delta != null && m.delta > 0 ? 'text-emerald-600' : 'text-ink-navy/40'}`}>{m.deltaLabel}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  const ordered = numeri ? ordinaSezioni(numeri.sections, numeri.statusHint, periodo, focus) : []
  const nPrimary = Math.min(2, ordered.length)
  const primary = ordered.slice(0, nPrimary)
  const rest = ordered.slice(nPrimary)

  return (
    <div className="w-full">
      {/* Selettore periodo + navigazione passato */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="inline-flex bg-mist rounded-xl p-1">
          {PERIODI.map((p) => (
            <button key={p.id} onClick={() => { setPeriodo(p.id); setRiferimento(new Date()) }}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${periodo === p.id ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1 ml-auto">
          <button onClick={() => setRiferimento(spostaRiferimento(riferimento, periodo, -1))}
            className="w-8 h-8 rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:text-ink-navy hover:border-ink-navy/30 flex items-center justify-center" aria-label="Periodo precedente">‹</button>
          <span className="text-xs font-semibold text-ink-navy/70 px-2 min-w-[92px] text-center tabular-nums">{data?.label ?? '…'}</span>
          <button onClick={() => { if (!isCorrente) setRiferimento(spostaRiferimento(riferimento, periodo, 1)) }} disabled={isCorrente}
            className="w-8 h-8 rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:text-ink-navy hover:border-ink-navy/30 flex items-center justify-center disabled:opacity-30" aria-label="Periodo successivo">›</button>
          <button onClick={() => void carica(true)} disabled={loading || generating}
            className="w-8 h-8 rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:text-electric-blue hover:border-electric-blue flex items-center justify-center disabled:opacity-40 ml-1" title="Rigenera" aria-label="Rigenera">
            <span className={`w-[15px] h-[15px] ${generating ? 'animate-spin' : ''}`}><IconRefresh /></span>
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-ink-navy/50 text-sm py-10 justify-center">
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-ink-navy/40 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-ink-navy/40 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-ink-navy/40 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          Sto analizzando i dati…
        </div>
      ) : numeri ? (
        <div className="space-y-5">
          {/* VERDETTO (hero) o stato on-demand */}
          {brief ? (
            <div className={`rounded-2xl border px-4 py-4 ${sem.sfondo}`}>
              <div className="flex items-start gap-3">
                <span className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${sem.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] font-semibold leading-relaxed ${sem.testo}`}>{brief.headline}</p>
                  {formatGenerato(data?.generatedAt) && <p className={`text-[11px] mt-1 ${sem.testo} opacity-60`}>{formatGenerato(data?.generatedAt)}{data?.rigenerabile ? ' · aggiornabile' : ''}</p>}
                  {brief.why.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {brief.why.map((w, i) => (
                        <div key={i} className="rounded-xl bg-white/60 border border-white/50 px-3 py-2">
                          <p className="text-xs font-semibold text-ink-navy">{w.title}</p>
                          <p className="text-[13px] text-ink-navy/70 leading-relaxed mt-0.5">{w.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {brief.actions.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {brief.actions.map((a, i) => {
                        const def = numeri.allowedActions.find((x) => x.id === a.id)
                        const esito = azioniEsito[a.id]
                        const inCorso = azioneInCorso === a.id
                        const scrive = def?.kind === 'sposta_in_cima' || def?.kind === 'cambia_prezzo' || def?.kind === 'imposta_disponibilita' || def?.kind === 'imposta_aliquota'
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <button onClick={() => eseguiAzione(a)} disabled={inCorso || !def || (esito?.ok ?? false)}
                              className={`inline-flex items-center gap-1.5 self-start text-sm font-medium px-3 py-2 rounded-lg border bg-white/70 transition-colors disabled:opacity-50 ${URGENZA[a.urgency] ?? URGENZA.medium}`}>
                              {inCorso ? 'Attendi…' : a.label}
                              <span className="w-[14px] h-[14px]">{scrive ? <IconBolt /> : <IconArrowRight />}</span>
                            </button>
                            {esito && <p className={`text-[11px] ${esito.ok ? 'text-emerald-600' : 'text-red-600'}`}>{esito.msg}</p>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-ink-navy/10 bg-mist px-4 py-4">
              {data?.vuoto ? (
                <p className="text-sm text-ink-navy/60">Nessun venduto in questo periodo: niente da interpretare. I numeri sono qui sotto.</p>
              ) : data?.budget ? (
                <p className="text-sm text-ink-navy/60">Tetto di spesa AI del mese raggiunto: per ora niente nuovi verdetti. I numeri restano qui sotto.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-ink-navy/60 leading-relaxed">Nessuna analisi AI salvata per <b className="text-ink-navy">{data?.label}</b>. Generala quando ti serve — i numeri qui sotto sono già pronti, gratis.</p>
                  <button onClick={() => void carica(true)} disabled={generating}
                    className="self-start text-xs font-semibold px-3 py-2 rounded-lg bg-electric-blue text-white hover:bg-electric-blue/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50">
                    <span className="w-3.5 h-3.5"><IconBot /></span>{generating ? 'Genero…' : `Genera analisi AI per ${data?.label ?? 'questo periodo'}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SEZIONI — riordinate per rilevanza. Le prime due in evidenza, il resto sotto. */}
          {primary.length > 0 && <div className="space-y-4">{primary.map((s) => renderSezione(s, true))}</div>}
          {rest.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px bg-ink-navy/10 flex-1" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-navy/35 shrink-0">Il resto, sempre qui</span>
                <span className="h-px bg-ink-navy/10 flex-1" />
              </div>
              <div className="space-y-4">{rest.map((s) => renderSezione(s, false))}</div>
            </>
          )}

          <p className="text-[10px] text-ink-navy/40 text-center pt-1">I numeri li calcola il codice; il verdetto lo scrive l&apos;AI. Verifica sempre prima di decisioni importanti.</p>
        </div>
      ) : (
        <p className="text-sm text-ink-navy/40 py-8 text-center">Nessun dato per questo periodo.</p>
      )}
    </div>
  )
}

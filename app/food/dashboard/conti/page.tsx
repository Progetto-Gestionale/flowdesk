'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getCache, setCache } from '@/lib/pageCache'
import { Skeleton, SkeletonCards } from '@/app/components/Skeleton'

// Cache navigazione (solo vista "oggi", il caso caldo): al ritorno mostra subito l'ultimo dato noto.
const CONTI_CACHE_KEY = 'food:conti:oggi'

interface RigaOrdine { id: string; nome: string; quantita: number; prezzo: number; note?: string | null; quantitaPagata?: number }
interface Ordine {
  id: string; tavolo: string; tavoloId: string | null; gruppoId: string | null
  totale: number; note: string | null; status: string; createdAt: string; closedAt?: string | null
  tipo: string; righe: RigaOrdine[]; clienteInfo?: string | null; coperti?: number | null
}
interface Piatto { id: string; nome: string; prezzo: number; descrizione?: string | null }
interface Categoria { id: string; nome: string; piatti: Piatto[] }

const fmt = (n: number) => `€${n.toFixed(2)}`

// Un "conto" = tutti gli Ordini aperti dello stesso tavolo o gruppo di tavoli.
// Ogni Ordine è un "sottogruppo" (un invio del cliente) pagabile singolarmente.
const contoKey = (o: Ordine) => o.gruppoId ?? o.tavoloId ?? o.tavolo
interface Conto { key: string; label: string; tavoloId: string | null; gruppoId: string | null; ordini: Ordine[]; totale: number }
function raggruppaConti(list: Ordine[]): Conto[] {
  const map = new Map<string, Conto>()
  for (const o of list) {
    const key = contoKey(o)
    let c = map.get(key)
    if (!c) { c = { key, label: o.tavolo, tavoloId: o.tavoloId, gruppoId: o.gruppoId, ordini: [], totale: 0 }; map.set(key, c) }
    c.ordini.push(o)
    c.totale += o.totale
  }
  return [...map.values()]
}

// Per i conti CHIUSI: ogni "sessione" del tavolo è un conto separato. Se un tavolo viene
// chiuso e poi rioccupato, gli ordini condividono lo stesso tavoloId ma NON devono finire
// nello stesso conto: un ordine creato DOPO la chiusura precedente apre una nuova sessione.
function raggruppaContiChiusi(list: Ordine[]): Conto[] {
  const perTavolo = new Map<string, Ordine[]>()
  for (const o of list) {
    const key = contoKey(o)
    if (!perTavolo.has(key)) perTavolo.set(key, [])
    perTavolo.get(key)!.push(o)
  }
  const conti: Conto[] = []
  for (const [key, ords] of perTavolo) {
    const sorted = [...ords].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    let sessione: Ordine[] = []
    let chiusuraConto = 0 // closedAt dell'ultima chiusura conto ('chiuso') della sessione
    const chiudi = () => {
      if (!sessione.length) return
      const first = sessione[0]
      conti.push({
        key: `${key}-${conti.length}`, label: first.tavolo,
        tavoloId: first.tavoloId, gruppoId: first.gruppoId,
        ordini: sessione, totale: sessione.reduce((s, o) => s + o.totale, 0),
      })
    }
    for (const o of sorted) {
      if (sessione.length && chiusuraConto && +new Date(o.createdAt) > chiusuraConto) {
        chiudi(); sessione = []; chiusuraConto = 0
      }
      sessione.push(o)
      if (o.status === 'chiuso' && o.closedAt) chiusuraConto = Math.max(chiusuraConto, +new Date(o.closedAt))
    }
    chiudi()
  }
  return conti
}

function getSerataKey(createdAt: string): string {
  const d = new Date(createdAt)
  if (d.getUTCHours() < 4) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
function todayKey() { return getSerataKey(new Date().toISOString()) }
function prevDay(k: string) { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) }
function nextDay(k: string) { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
function fmtGiorno(key: string) {
  const today = todayKey()
  if (key === today) return 'Oggi'
  if (key === prevDay(today)) return 'Ieri'
  return new Date(key + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Modal modifica ordine ───────────────────────────────────────────────────
function ModificaModal({ ordine, onClose, onOrdineUpdated }: {
  ordine: Ordine
  onClose: () => void
  onOrdineUpdated: (o: Ordine) => void
}) {
  const [righe, setRighe] = useState<RigaOrdine[]>([...ordine.righe])
  const [totale, setTotale] = useState(ordine.totale)
  const [categorie, setCategorie] = useState<Categoria[]>([])
  const [search, setSearch] = useState('')
  const [sezioneMenu, setSezioneMenu] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/menu/categorie', { credentials: 'include' })
      .then(r => r.json()).then(d => setCategorie(d.categorie ?? [])).catch(() => {})
  }, [])

  // Chiamata API in background. NON sovrascrive lo stato locale (evita flicker e risposte fuori
  // sequenza con i click rapidi): lo stato ottimistico è la verità, il polling dei Conti riconcilia.
  function callApi(method: string, body: object): Promise<any> {
    return fetch(`/api/ordini/${ordine.id}/riga`, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()).catch(() => ({}))
  }

  // Applica subito le nuove righe: aggiorna modal + totale + lista dietro (all'istante, niente attesa).
  function propaga(nuoveRighe: RigaOrdine[]) {
    const tot = nuoveRighe.reduce((s, r) => s + r.prezzo * r.quantita, 0)
    setRighe(nuoveRighe)
    setTotale(tot)
    onOrdineUpdated({ ...ordine, righe: nuoveRighe, totale: tot })
  }

  function rimuovi(rigaId: string) {
    if (rigaId.startsWith('tmp-')) return // riga appena aggiunta, non ancora confermata dal server
    propaga(righe.filter(r => r.id !== rigaId))
    callApi('DELETE', { rigaId })
  }

  function cambiaQ(rigaId: string, delta: number) {
    const riga = righe.find(r => r.id === rigaId)
    if (!riga || rigaId.startsWith('tmp-')) return
    const nq = riga.quantita + delta
    if (nq <= 0) { rimuovi(rigaId); return }
    propaga(righe.map(r => r.id === rigaId ? { ...r, quantita: nq } : r))
    callApi('PATCH', { rigaId, quantita: nq })
  }

  async function aggiungi(p: Piatto) {
    // Ottimistico: il piatto compare SUBITO con un id temporaneo, poi rimpiazzo l'id con quello reale.
    const tmpId = 'tmp-' + Date.now() + Math.random().toString(36).slice(2)
    const conNuova = [...righe, { id: tmpId, nome: p.nome, prezzo: p.prezzo, quantita: 1 }]
    propaga(conNuova)
    const data = await callApi('POST', { piattoId: p.id, nome: p.nome, prezzo: p.prezzo, quantita: 1 })
    const serverRighe = (data?.ordine?.righe as RigaOrdine[] | undefined) ?? []
    const reale = serverRighe.find(sr => !conNuova.some(r => r.id === sr.id)) // la riga nuova = quella non ancora nota
    if (reale) setRighe(prev => prev.map(r => r.id === tmpId ? { ...r, id: reale.id } : r))
  }

  const piattiFiltrati = search.trim()
    ? categorie.flatMap(c => c.piatti.filter(p => p.nome.toLowerCase().includes(search.toLowerCase())))
    : null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink-navy/8 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold text-ink-navy">Modifica — {ordine.tavolo}</h3>
            <p className="text-xs text-ink-navy/40 mt-0.5">
              {ordine.status === 'chiuso' ? 'Ordine chiuso' : 'Ordine aperto'} · modifiche salvate automaticamente
            </p>
          </div>
          <button onClick={onClose} className="text-ink-navy/30 hover:text-ink-navy/60 text-xl font-bold leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Righe attuali */}
          <div className="divide-y divide-ink-navy/6">
            {righe.length === 0 && <p className="px-5 py-4 text-sm text-ink-navy/30 text-center">Ordine vuoto</p>}
            {righe.map(r => (
              <div key={r.id} className="flex items-center gap-2 px-5 py-3">
                <span className="flex-1 text-sm text-ink-navy truncate">{r.nome}</span>
                {r.note && <span className="text-xs text-ink-navy/35 shrink-0">({r.note})</span>}
                <span className="text-sm text-ink-navy/50 shrink-0 w-14 text-right">{fmt(r.prezzo * r.quantita)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => cambiaQ(r.id, -1)} disabled={r.id.startsWith('tmp-')}
                    className="w-6 h-6 rounded-full bg-ink-navy/8 hover:bg-ink-navy/15 text-ink-navy font-bold text-sm flex items-center justify-center disabled:opacity-40">−</button>
                  <span className="w-5 text-center text-sm font-semibold text-ink-navy">{r.quantita}</span>
                  <button onClick={() => cambiaQ(r.id, +1)} disabled={r.id.startsWith('tmp-')}
                    className="w-6 h-6 rounded-full bg-ink-navy/8 hover:bg-ink-navy/15 text-ink-navy font-bold text-sm flex items-center justify-center disabled:opacity-40">+</button>
                </div>
                <button onClick={() => rimuovi(r.id)} disabled={r.id.startsWith('tmp-')}
                  className="text-red-400 hover:text-red-600 text-base font-bold disabled:opacity-40 w-5 text-center">✕</button>
              </div>
            ))}
          </div>

          {/* Sezione aggiungi dal menu */}
          <div className="border-t border-ink-navy/8">
            <button onClick={() => { setSezioneMenu(v => !v); setTimeout(() => searchRef.current?.focus(), 100) }}
              className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-mist transition-colors">
              <span className="text-sm font-semibold text-electric-blue">+ Aggiungi dal menu</span>
              <span className={`ml-auto text-ink-navy/30 text-xs transition-transform ${sezioneMenu ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {sezioneMenu && (
              <div className="px-5 pb-4 space-y-3">
                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Cerca piatto…"
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />

                {piattiFiltrati ? (
                  // Risultati ricerca flat
                  <div className="flex flex-wrap gap-1.5">
                    {piattiFiltrati.length === 0 && <p className="text-xs text-ink-navy/30">Nessun risultato</p>}
                    {piattiFiltrati.map(p => (
                      <button key={p.id} onClick={() => aggiungi(p)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-electric-blue/8 hover:bg-electric-blue/15 text-electric-blue text-xs font-semibold transition-colors active:scale-95">
                        {p.nome}
                        <span className="text-electric-blue/60">{fmt(p.prezzo)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  // Menu per categorie
                  <div className="space-y-3">
                    {categorie.map(cat => cat.piatti.length > 0 && (
                      <div key={cat.id}>
                        <p className="text-[10px] font-semibold text-ink-navy/40 uppercase tracking-wider mb-1.5">{cat.nome}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cat.piatti.map(p => (
                            <button key={p.id} onClick={() => aggiungi(p)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-electric-blue/8 hover:bg-electric-blue/15 text-electric-blue text-xs font-semibold transition-colors active:scale-95">
                              {p.nome}
                              <span className="text-electric-blue/60">{fmt(p.prezzo)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ink-navy/8 flex items-center justify-between shrink-0">
          <span className="text-sm font-bold text-ink-navy">{fmt(totale)}</span>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90 transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mini calendario ─────────────────────────────────────────────────────────
function MiniCalendar({ value, max, onChange, onClose }: {
  value: string; max: string; onChange: (d: string) => void; onClose: () => void
}) {
  const [viewYear, setViewYear] = useState(() => parseInt(value.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => parseInt(value.slice(5, 7)) - 1)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const maxDate = new Date(max + 'T12:00:00Z')
  const giorni = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
  const mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

  const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1))
  const lastDay = new Date(Date.UTC(viewYear, viewMonth + 1, 0))
  // start from Monday (0=Mon)
  let startDow = firstDay.getUTCDay() - 1; if (startDow < 0) startDow = 6
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= lastDay.getUTCDate(); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear
    if (new Date(Date.UTC(nextY, nextM, 1)) > maxDate) return
    setViewMonth(nextM); if (viewMonth === 11) setViewYear(y => y + 1)
  }

  function select(day: number) {
    const k = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (k > max) return
    onChange(k); onClose()
  }

  const canNextMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 1)) <= maxDate

  return (
    <div ref={ref} className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 bg-white rounded-2xl border border-ink-navy/10 shadow-xl p-3 w-64">
      {/* header mese */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-sm">‹</button>
        <span className="text-xs font-bold text-ink-navy">{mesi[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} disabled={!canNextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-sm disabled:opacity-30">›</button>
      </div>
      {/* intestazione giorni */}
      <div className="grid grid-cols-7 mb-1">
        {giorni.map((g, i) => (
          <span key={i} className="text-center text-[10px] font-semibold text-ink-navy/30 py-0.5">{g}</span>
        ))}
      </div>
      {/* celle */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />
          const k = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isSelected = k === value
          const isToday = k === max
          const isFuture = k > max
          return (
            <button key={i} onClick={() => select(day)} disabled={isFuture}
              className={`h-8 w-full rounded-lg text-xs font-medium transition-colors disabled:opacity-25 disabled:cursor-not-allowed
                ${isSelected ? 'bg-electric-blue text-white font-bold' : isToday ? 'bg-electric-blue/10 text-electric-blue font-bold' : 'hover:bg-mist text-ink-navy'}`}>
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Pagina ──────────────────────────────────────────────────────────────────
export default function ContiPage() {
  const [tutti, setTutti] = useState<Ordine[]>([])
  const [chiudendo, setChiudendo] = useState<string | null>(null)
  const [copertiModal, setCopertiModal] = useState<Ordine | null>(null)
  const [copertiValue, setCopertiValue] = useState(2)            // coperti REALI del tavolo → chiusura + ANALYTICS
  const [copertiRomana, setCopertiRomana] = useState(2)          // divisore "paga alla romana" → SOLO calcolo, mai salvato
  const [copertiTotale, setCopertiTotale] = useState(0)          // totale del conto da chiudere
  const [modalStep, setModalStep] = useState<'scelta' | 'romana'>('scelta')
  const [pagatiRomana, setPagatiRomana] = useState<Set<number>>(new Set()) // coperti che hanno pagato
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [chiusiAperti, setChiusiAperti] = useState(false)
  const [dataFiltro, setDataFiltro] = useState(todayKey)
  const [filtroTipo, setFiltroTipo] = useState<'tavolo' | 'asporto' | 'delivery'>('tavolo')
  const [calOpen, setCalOpen] = useState(false)
  const [modificando, setModificando] = useState<Ordine | null>(null)
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set()) // id sottogruppi spuntati
  const [modUnione, setModUnione] = useState(false)                      // modalità "unisci conti"
  const [contiDaUnire, setContiDaUnire] = useState<Set<string>>(new Set())

  const isOggi = dataFiltro === todayKey()

  const fetchOrdini = useCallback(async () => {
    const url = isOggi ? '/api/ordini?oggi=1' : '/api/ordini?giorni=90'
    const res = await fetch(url, { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setTutti(data.ordini ?? [])
  }, [isOggi])

  const primoMount = useRef(true)
  useEffect(() => {
    // Solo al primissimo mount su "oggi": idrata dalla cache → niente "Caricamento…" al ritorno.
    const cached = primoMount.current && isOggi ? getCache<Ordine[]>(CONTI_CACHE_KEY) : undefined
    primoMount.current = false
    if (cached) { setTutti(cached); setLoading(false) }
    else setLoading(true)
    fetchOrdini().finally(() => setLoading(false))
    if (!isOggi) return
    const iv = setInterval(fetchOrdini, 15000)
    return () => clearInterval(iv)
  }, [fetchOrdini, isOggi])

  // Write-through: tiene allineata la cache della vista "oggi" all'ultimo stato (incluse le modifiche ottimistiche).
  useEffect(() => {
    if (loading || !isOggi) return
    setCache<Ordine[]>(CONTI_CACHE_KEY, tutti)
  }, [loading, isOggi, tutti])

  const ordini = isOggi ? tutti : tutti.filter(o => getSerataKey(o.createdAt) === dataFiltro)
  const isTavolo = (o: Ordine) => o.tipo === 'tavolo' || o.tavoloId != null || o.gruppoId != null
  // Per i tavoli il conto resta aperto finché non è 'chiuso' (i sottogruppi 'pagato' e
  // 'consegnato' restano visibili nel conto). Per asporto/delivery 'consegnato' = concluso;
  // 'non_consegnato' (non consegnato / non ritirato) = conto concluso ma NON incassato.
  const isDone = (o: Ordine) => isTavolo(o) ? o.status === 'chiuso' : (o.status === 'consegnato' || o.status === 'chiuso' || o.status === 'non_consegnato')
  const isPagato = (o: Ordine) => o.status === 'pagato'
  // Unità pagate di una voce: se il sottogruppo è 'pagato' tutte, altrimenti quantitaPagata (0..quantita).
  const unitaPagate = (o: Ordine, r: RigaOrdine) => isPagato(o) ? r.quantita : Math.min(r.quantitaPagata ?? 0, r.quantita)
  const rigaTuttaPagata = (o: Ordine, r: RigaOrdine) => unitaPagate(o, r) >= r.quantita
  // Rimanente da incassare di un sottogruppo: somma delle UNITÀ non ancora pagate.
  const restanteSottogruppo = (o: Ordine) => isPagato(o) ? 0 : o.righe.reduce((s, r) => s + (r.quantita - unitaPagate(o, r)) * r.prezzo, 0)
  const matchesFiltro = (o: Ordine) => {
    if (filtroTipo === 'tavolo') return isTavolo(o)
    if (filtroTipo === 'delivery') return o.tipo === 'delivery'
    return !isTavolo(o) && o.tipo !== 'delivery' // asporto
  }
  const aperti = ordini.filter(o => !isDone(o) && matchesFiltro(o))
  const chiusi = ordini.filter(o => isDone(o) && matchesFiltro(o))
  const countAperti = {
    tavolo: new Set(ordini.filter(o => !isDone(o) && isTavolo(o)).map(contoKey)).size,
    asporto: ordini.filter(o => !isDone(o) && !isTavolo(o) && o.tipo !== 'delivery').length,
    delivery: ordini.filter(o => !isDone(o) && o.tipo === 'delivery').length,
  }
  const totaleAperti = aperti.reduce((s, o) => s + o.totale, 0)
  // Gli ordini non consegnati/non ritirati sono conclusi ma non incassati → esclusi dal totale.
  const totaleChiusi = chiusi.reduce((s, o) => s + (o.status === 'non_consegnato' ? 0 : o.totale), 0)
  // Per i tavoli raggruppo i sottogruppi in conti; asporto/delivery restano card singole
  const contiAperti = filtroTipo === 'tavolo' ? raggruppaConti(aperti) : []
  // Anche i conti chiusi restano raggruppati: i sottogruppi devono stare dentro lo stesso conto, non separati
  const contiChiusi = filtroTipo === 'tavolo' ? raggruppaContiChiusi(chiusi) : []

  function aggiorna(updated: Ordine) {
    setTutti(prev => prev.map(x => x.id === updated.id ? updated : x))
    if (modificando?.id === updated.id) setModificando(updated)
  }

  // Apre il modal di chiusura conto (step "scelta": coperti + Chiudi/Paga alla romana).
  // copertiIniziali = coperti già impostati (dal cameriere all'apertura del tavolo); modificabili.
  function apriChiusura(o: Ordine, totale: number, copertiIniziali = 2) {
    setCopertiModal(o)
    setCopertiValue(copertiIniziali > 0 ? copertiIniziali : 2)
    setCopertiTotale(totale)
    setModalStep('scelta')
    setPagatiRomana(new Set())
  }

  // Coperti REALI del tavolo (step 'scelta'): usati per chiudere il conto e per le ANALYTICS.
  function cambiaCoperti(delta: number) {
    setCopertiValue(v => Math.max(1, v + delta))
  }

  // Divisore della "paga alla romana" (step 'romana'): SOLO per il calcolo di quanto paga ognuno,
  // NON viene mai salvato né usato dalle statistiche. Tiene coerenti le spunte "pagato".
  function cambiaCopertiRomana(delta: number) {
    setCopertiRomana(v => {
      const nv = Math.max(1, v + delta)
      setPagatiRomana(prev => new Set([...prev].filter(i => i < nv)))
      return nv
    })
  }

  async function chiudiConto(o: Ordine, coperti: number) {
    setCopertiModal(null)
    setChiudendo(o.id)
    setTutti(prev => prev.map(x => x.id === o.id ? { ...x, status: 'chiuso' } : x))
    try {
      await fetch('/api/tavoli/chiudi-conto', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tavoloId: o.tavoloId, gruppoId: o.gruppoId, coperti }),
      })
    } finally {
      setChiudendo(null)
      fetchOrdini()
    }
  }

  function toggleSel(id: string) {
    setSelezionati(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // Segna i sottogruppi selezionati come "pagati": restano nel conto con badge Pagato,
  // il conto resta aperto finché non lo si chiude tutto insieme.
  async function pagaSelezionati(conto: Conto) {
    const daPagare = conto.ordini.filter(o => selezionati.has(o.id) && !isDone(o) && !isPagato(o))
    if (daPagare.length === 0) return
    const ids = daPagare.map(o => o.id)
    setChiudendo(conto.key)
    setTutti(prev => prev.map(x => ids.includes(x.id) ? { ...x, status: 'pagato' } : x))
    setSelezionati(prev => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n })
    try {
      await Promise.all(ids.map(id => fetch(`/api/ordini/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pagato' }),
      })))
    } finally {
      setChiudendo(null)
      fetchOrdini()
    }
  }

  // Annulla il "pagato" di un sottogruppo (in caso di errore): torna aperto e non incassato.
  // Lo riportiamo a 'consegnato' (servito ma da pagare) così non ricompare in cucina.
  async function annullaPagato(o: Ordine) {
    setChiudendo(o.id)
    setTutti(prev => prev.map(x => x.id === o.id ? { ...x, status: 'consegnato' } : x))
    try {
      await fetch(`/api/ordini/${o.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'consegnato' }),
      })
    } finally {
      setChiudendo(null)
      fetchOrdini()
    }
  }

  // Imposta quante unità di una voce sono pagate (0..quantita). Aiuto cassa per dividere per piatto.
  // Aggiornamento OTTIMISTICO e nessun refetch: la modifica è immediata (niente lag né righe che
  // "saltano"); il valore è persistito e il polling periodico riconcilia comunque.
  async function setPagate(o: Ordine, r: RigaOrdine, n: number) {
    const nuovo = Math.max(0, Math.min(r.quantita, n))
    setTutti(prev => prev.map(x => x.id === o.id
      ? { ...x, righe: x.righe.map(rr => rr.id === r.id ? { ...rr, quantitaPagata: nuovo } : rr) }
      : x))
    try {
      await fetch(`/api/righe/${r.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantitaPagata: nuovo }),
      })
    } catch { /* riconcilia il prossimo polling */ }
  }

  function toggleUnione(key: string) {
    setContiDaUnire(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // Unisce i conti selezionati (reciproco: unisce anche i tavoli in un GruppoTavoli)
  async function unisciConti() {
    const conti = contiAperti.filter(c => contiDaUnire.has(c.key))
    const tavoliIds = [...new Set(conti.flatMap(c => c.ordini.map(o => o.tavoloId).filter(Boolean)))] as string[]
    if (tavoliIds.length < 2) return
    setModUnione(false); setContiDaUnire(new Set())
    await fetch('/api/tavoli/unisci-conti', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tavoliIds }),
    })
    fetchOrdini()
  }

  // Scioglie un conto già unito: i tavoli tornano separati, gli ordini restano aperti
  async function sciogliConto(gruppoId: string) {
    setChiudendo(gruppoId)
    try {
      await fetch('/api/tavoli/sciogli-conto', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gruppoId }),
      })
    } finally {
      setChiudendo(null)
      fetchOrdini()
    }
  }

  async function segnaPronte(o: Ordine) {
    setChiudendo(o.id)
    setTutti(prev => prev.map(x => x.id === o.id ? { ...x, status: 'consegnato' } : x))
    try {
      await fetch(`/api/ordini/${o.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'consegnato' }),
      })
    } finally {
      setChiudendo(null)
      fetchOrdini()
    }
  }

  // Asporto non ritirato / delivery non consegnato → conto concluso ma non incassato.
  async function segnaNonConsegnato(o: Ordine) {
    setChiudendo(o.id)
    setTutti(prev => prev.map(x => x.id === o.id ? { ...x, status: 'non_consegnato' } : x))
    try {
      await fetch(`/api/ordini/${o.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'non_consegnato' }),
      })
    } finally {
      setChiudendo(null)
      fetchOrdini()
    }
  }

  async function eliminaOrdine(o: Ordine) {
    setTutti(prev => prev.filter(x => x.id !== o.id))
    setConfermaElimina(null)
    await fetch(`/api/ordini/${o.id}`, { method: 'DELETE', credentials: 'include' })
    fetchOrdini()
  }

  function OrdineCard({ o }: { o: Ordine }) {
    const aperto = !isDone(o)
    const nonConsegnato = o.status === 'non_consegnato'
    const ora = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

    // etichetta tipo (solo asporto/delivery; i tavoli mostrano già il nome tavolo)
    const badge = isTavolo(o) ? null : o.tipo === 'delivery' ? 'Delivery' : 'Asporto'
    // per asporto/delivery mostra il nome cliente dell'ordine invece di "Asporto"/"Delivery"
    const label = isTavolo(o)
      ? o.tavolo
      : (() => { try { return JSON.parse(o.clienteInfo ?? '{}').nome || o.tavolo } catch { return o.tavolo } })()

    return (
      <div className={`bg-white border rounded-xl overflow-hidden shadow-sm ${nonConsegnato ? 'border-red-300' : 'border-ink-navy/10'}`}>
        {nonConsegnato && (
          <div className="px-4 py-2 bg-red-500 text-white text-center">
            <p className="text-xs font-bold uppercase tracking-wide">{o.tipo === 'delivery' ? 'Non consegnato' : 'Non ritirato'}</p>
          </div>
        )}
        <div className={`px-4 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-ink-navy/8 ${aperto ? 'bg-white' : 'bg-mist'}`}>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${aperto ? 'text-ink-navy' : 'text-ink-navy/50'}`}>{label}</span>
            {badge && aperto && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-ink-navy/10 text-ink-navy/60">
                {badge}
              </span>
            )}
            <span className={`text-xs font-semibold ${aperto ? 'text-ink-navy/50' : 'text-ink-navy/35'}`}>{ora}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className={`text-sm ${aperto ? 'text-ink-navy/70' : 'text-ink-navy/40'}`}>{fmt(o.totale)}</span>
            <button onClick={() => setModificando(o)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:bg-white/60 transition-colors">
              Modifica
            </button>
            {aperto && (
              isTavolo(o) ? (
                <button onClick={() => apriChiusura(o, o.totale, o.coperti ?? 2)} disabled={chiudendo === o.id}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 disabled:opacity-40 transition-colors">
                  {chiudendo === o.id ? '…' : 'Chiudi'}
                </button>
              ) : (
                <>
                  <button onClick={() => segnaNonConsegnato(o)} disabled={chiudendo === o.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors">
                    {o.tipo === 'delivery' ? 'Non consegnato' : 'Non ritirato'}
                  </button>
                  <button onClick={() => segnaPronte(o)} disabled={chiudendo === o.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 disabled:opacity-40 transition-colors">
                    {chiudendo === o.id ? '…' : 'Chiudi conto'}
                  </button>
                </>
              )
            )}
            {!aperto && (
              confermaElimina === o.id ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setConfermaElimina(null)} className="text-xs px-2 py-1 rounded-lg border border-ink-navy/15 text-ink-navy/50">No</button>
                  <button onClick={() => eliminaOrdine(o)} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-semibold">Sì</button>
                </div>
              ) : (
                <button onClick={() => setConfermaElimina(o.id)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors">
                  Elimina
                </button>
              )
            )}
          </div>
        </div>
        <div className={`divide-y divide-ink-navy/6 ${!aperto ? 'opacity-60' : ''}`}>
          {o.righe.map(r => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-ink-navy w-5 shrink-0 text-center">{r.quantita}×</span>
                <span className="text-sm font-semibold text-ink-navy truncate">{r.nome}</span>
                {r.note && <span className="text-xs text-ink-navy/35 truncate">({r.note})</span>}
              </div>
              <span className="text-sm text-ink-navy/50 shrink-0">{fmt(r.prezzo * r.quantita)}</span>
            </div>
          ))}
          {o.righe.length === 0 && <p className="px-4 py-3 text-sm text-ink-navy/30">Nessuna voce</p>}
        </div>
      </div>
    )
  }

  // Un sottogruppo dentro un conto (un singolo Ordine), con checkbox di selezione.
  // In un conto chiuso: niente checkbox/pagamento, solo Modifica/Elimina in stile storico.
  function SottogruppoCard({ o, index, totali, chiuso }: { o: Ordine; index: number; totali: number; chiuso?: boolean }) {
    const ora = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const sel = selezionati.has(o.id)
    const pagato = isPagato(o)
    return (
      <div className={`px-4 py-3 transition-colors ${chiuso || pagato ? 'opacity-60' : sel ? 'bg-electric-blue/[0.04]' : ''}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className={`flex items-center gap-2 select-none min-w-0 ${chiuso || pagato || modUnione ? '' : 'cursor-pointer'}`}>
            {!chiuso && !pagato && !modUnione && (
              <input type="checkbox" checked={sel} onChange={() => toggleSel(o.id)}
                className="w-4 h-4 shrink-0 rounded border-ink-navy/30 text-electric-blue focus:ring-electric-blue/40" />
            )}
            {totali > 1 && <span className="text-[11px] font-bold text-electric-blue bg-electric-blue/10 px-2 py-0.5 rounded-full shrink-0">Sottogruppo {index}</span>}
            {pagato && !chiuso && (
              <span className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Pagato</span>
                <button type="button" onClick={(e) => { e.preventDefault(); annullaPagato(o) }} disabled={chiudendo === o.id}
                  className="text-[11px] font-semibold text-ink-navy/45 hover:text-red-500 underline disabled:opacity-40 transition-colors">
                  annulla
                </button>
              </span>
            )}
            <span className="text-xs text-ink-navy/40 shrink-0">{ora}</span>
          </label>
          <div className="flex items-center gap-2 shrink-0">
            {/* Totale del sottogruppo solo con più voci: con una sola voce coincide con
                il prezzo della riga (mostrato sotto) → sarebbe la stessa cifra due volte */}
            {o.righe.length > 1 && <span className="text-sm text-ink-navy/60">{fmt(o.totale)}</span>}
            {chiuso ? (
              confermaElimina === o.id ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setConfermaElimina(null)} className="text-xs px-2 py-1 rounded-lg border border-ink-navy/15 text-ink-navy/50">No</button>
                  <button onClick={() => eliminaOrdine(o)} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-semibold">Sì</button>
                </div>
              ) : (
                <>
                  <button onClick={() => setModificando(o)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:bg-mist transition-colors">Modifica</button>
                  <button onClick={() => setConfermaElimina(o.id)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors">Elimina</button>
                </>
              )
            ) : (!pagato && !modUnione && (
              <button onClick={() => setModificando(o)}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:bg-mist transition-colors">Modifica</button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-ink-navy/6 pl-6">
          {o.righe.map(r => {
            const pagate = unitaPagate(o, r)
            const tutta = rigaTuttaPagata(o, r)
            // Controllo per riga solo su un sottogruppo aperto e non già interamente pagato.
            const interattiva = !chiuso && !pagato && !modUnione
            return (
              <div key={r.id} className="flex items-center justify-between py-1.5 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-ink-navy w-5 shrink-0 text-center">{r.quantita}×</span>
                  <span className={`text-sm truncate ${tutta ? 'text-ink-navy/35 line-through' : 'text-ink-navy'}`}>{r.nome}</span>
                  {r.note && <span className="text-xs text-ink-navy/35 truncate">({r.note})</span>}
                  {pagate > 0 && !tutta && (
                    <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0">{pagate}/{r.quantita} pagate</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm ${tutta ? 'text-ink-navy/30 line-through' : 'text-ink-navy/50'}`}>{fmt(r.prezzo * r.quantita)}</span>
                  {interattiva && (pagate === 0 ? (
                    <button onClick={() => setPagate(o, r, 1)}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-electric-blue/30 text-electric-blue hover:bg-electric-blue/10 transition-colors">Paga</button>
                  ) : (
                    <span className="flex items-center gap-1">
                      <button onClick={() => setPagate(o, r, pagate - 1)}
                        className="w-5 h-5 rounded-full border border-ink-navy/20 text-ink-navy/60 text-sm font-bold leading-none flex items-center justify-center hover:bg-mist transition-colors">−</button>
                      <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full text-center">{tutta ? 'Pagata' : `${pagate}/${r.quantita}`}</span>
                      {!tutta && (
                        <button onClick={() => setPagate(o, r, pagate + 1)}
                          className="w-5 h-5 rounded-full bg-electric-blue text-white text-sm font-bold leading-none flex items-center justify-center hover:bg-electric-blue/90 transition-colors">+</button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
          {o.righe.length === 0 && <p className="py-1.5 text-sm text-ink-navy/30">Nessuna voce</p>}
        </div>
      </div>
    )
  }

  // Un conto = intestazione (tavolo/gruppo + totale) con dentro i sottogruppi e le azioni di pagamento.
  // chiuso=true → conto già chiuso: stessa struttura raggruppata ma smorzata e senza azioni di pagamento/unione.
  function ContoBlock({ conto, chiuso }: { conto: Conto; chiuso?: boolean }) {
    const n = conto.ordini.length
    const pagatiN = conto.ordini.filter(isPagato).length
    const selezionatiConto = conto.ordini.filter(o => selezionati.has(o.id))
    const selN = selezionatiConto.length
    const selTot = selezionatiConto.reduce((s, o) => s + o.totale, 0)
    const inUnione = contiDaUnire.has(conto.key)
    return (
      <div className={`bg-white border rounded-xl overflow-hidden shadow-sm ${inUnione ? 'border-electric-blue ring-1 ring-electric-blue/30' : 'border-ink-navy/10'}`}>
        {/* Intestazione conto */}
        <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-ink-navy/8 bg-mist">
          <label className={`flex items-center gap-2 ${!chiuso && modUnione ? 'cursor-pointer' : ''} select-none`}>
            {!chiuso && modUnione && (
              <input type="checkbox" checked={inUnione} onChange={() => toggleUnione(conto.key)}
                className="w-4 h-4 shrink-0 rounded border-ink-navy/30 text-electric-blue focus:ring-electric-blue/40" />
            )}
            <span className={`text-sm font-bold ${chiuso ? 'text-ink-navy/50' : 'text-ink-navy'}`}>{conto.label}</span>
            <span className="text-xs text-ink-navy/40">
              {n} {n === 1 ? 'sottogruppo' : 'sottogruppi'}
              {pagatiN > 0 && <span className="text-green-600 font-semibold"> · {pagatiN} pagat{pagatiN === 1 ? 'o' : 'i'}</span>}
            </span>
          </label>
          {/* Con un solo sottogruppo il totale del conto coincide con quello del sottogruppo (mostrato sotto):
              lo nascondo per non ripetere la stessa cifra due volte. */}
          {n > 1 && <span className={`text-sm font-bold ${chiuso ? 'text-ink-navy/50' : 'text-ink-navy'}`}>{fmt(conto.totale)}</span>}
        </div>

        {/* Sottogruppi */}
        <div className="divide-y divide-ink-navy/8">
          {conto.ordini.map((o, i) => (
            <SottogruppoCard key={o.id} o={o} index={i + 1} totali={n} chiuso={chiuso} />
          ))}
        </div>

        {/* Azioni pagamento (nascoste se conto chiuso o in modalità unione) */}
        {!chiuso && !modUnione && (
          <div className="px-4 py-3 border-t border-ink-navy/8 flex items-center justify-end gap-2 flex-wrap">
            {conto.gruppoId && (
              <button onClick={() => sciogliConto(conto.gruppoId!)} disabled={chiudendo === conto.key}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:bg-mist disabled:opacity-40 transition-colors mr-auto">
                {chiudendo === conto.key ? '…' : 'Sciogli conto'}
              </button>
            )}
            {selN > 0 && (
              <button onClick={() => pagaSelezionati(conto)} disabled={chiudendo === conto.key}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-electric-blue text-white hover:bg-electric-blue/90 disabled:opacity-40 transition-colors">
                {chiudendo === conto.key ? '…' : `Paga selezionati (${selN}) · ${fmt(selTot)}`}
              </button>
            )}
            <button onClick={() => apriChiusura(conto.ordini[0], conto.ordini.reduce((s, o) => s + restanteSottogruppo(o), 0), Math.max(0, ...conto.ordini.map(o => o.coperti ?? 0)) || 2)}
              disabled={chiudendo === conto.ordini[0].id}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 disabled:opacity-40 transition-colors">
              Chiudi conto {n > 1 ? '(tutto)' : ''}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (loading) return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <Skeleton className="h-8 w-32" />
      <SkeletonCards count={4} />
    </div>
  )

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-navy">Conti</h1>
          {isOggi && <p className="text-sm text-ink-navy/40 mt-0.5">Aggiornamento automatico ogni 15s</p>}
        </div>
        <button onClick={fetchOrdini} className="text-xs text-electric-blue hover:underline font-medium">Aggiorna</button>
      </div>

      {/* Navigazione giorni */}
      <div className="flex items-center gap-2">
        <button onClick={() => { setDataFiltro(prevDay(dataFiltro)); setChiusiAperti(false) }}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:bg-mist transition-colors text-sm">‹</button>
        <div className="flex-1 flex justify-center relative">
          <button
            onClick={() => setCalOpen(v => !v)}
            className="text-sm font-semibold text-ink-navy py-1 px-3 rounded-lg border border-ink-navy/10 bg-white hover:bg-mist transition-colors select-none whitespace-nowrap">
            {fmtGiorno(dataFiltro)}
            <span className="ml-1.5 text-ink-navy/30 text-xs">▾</span>
          </button>
          {calOpen && (
            <MiniCalendar
              value={dataFiltro}
              max={todayKey()}
              onChange={d => { setDataFiltro(d); setChiusiAperti(false) }}
              onClose={() => setCalOpen(false)}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isOggi && (
            <button onClick={() => { setDataFiltro(todayKey()); setChiusiAperti(false) }}
              className="text-xs text-electric-blue font-semibold px-2.5 py-1.5 rounded-lg border border-electric-blue/25 hover:bg-electric-blue/10 transition-colors">
              Oggi
            </button>
          )}
          <button onClick={() => { setDataFiltro(nextDay(dataFiltro)); setChiusiAperti(false) }}
            disabled={dataFiltro >= todayKey()}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:bg-mist disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm">›</button>
        </div>
      </div>

      {/* Filtro tipo */}
      <div className="flex gap-1 bg-mist rounded-xl p-1 w-fit">
        {(['tavolo', 'asporto', 'delivery'] as const).map(t => {
          const count = countAperti[t]
          return (
            <button key={t} onClick={() => setFiltroTipo(t)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${filtroTipo === t ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {count > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filtroTipo === t ? 'bg-electric-blue text-white' : 'bg-ink-navy/10 text-ink-navy/50'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Unisci conti (solo tavoli, con 2+ conti aperti) */}
      {isOggi && filtroTipo === 'tavolo' && contiAperti.length >= 2 && (
        <div className="flex items-center gap-2 flex-wrap">
          {!modUnione ? (
            <button onClick={() => setModUnione(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-electric-blue/25 text-electric-blue hover:bg-electric-blue/10 transition-colors">
              Unisci conti
            </button>
          ) : (
            <>
              <button onClick={unisciConti} disabled={contiDaUnire.size < 2}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-electric-blue text-white hover:bg-electric-blue/90 disabled:opacity-40 transition-colors">
                Unisci{contiDaUnire.size >= 2 ? ` ${contiDaUnire.size} conti` : ''}
              </button>
              <button onClick={() => { setModUnione(false); setContiDaUnire(new Set()) }}
                className="text-xs px-3 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:bg-mist transition-colors">
                Annulla
              </button>
              <span className="text-xs text-ink-navy/40">Spunta 2+ conti da unire</span>
            </>
          )}
        </div>
      )}

      {/* Aperti */}
      {isOggi && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-semibold text-ink-navy/50 uppercase tracking-wider">
              In corso
            </h2>
            {totaleAperti > 0 && <span className="text-xs text-ink-navy/40">{fmt(totaleAperti)} in sospeso</span>}
          </div>
          {aperti.length === 0 ? (
            <div className="bg-white border border-ink-navy/10 rounded-xl p-6 text-center text-ink-navy/30 text-sm">
              Nessun ordine in corso — arriveranno qui non appena il cliente ordina
            </div>
          ) : filtroTipo === 'tavolo' ? (
            <div className="space-y-3">{contiAperti.map(c => <ContoBlock key={c.key} conto={c} />)}</div>
          ) : (
            <div className="space-y-3">{aperti.map(o => <OrdineCard key={o.id} o={o} />)}</div>
          )}
        </div>
      )}

      {/* Pronti / Storico */}
      {chiusi.length > 0 && (
        <div>
          {isOggi ? (
            <button onClick={() => setChiusiAperti(v => !v)} className="w-full flex items-center gap-3 py-2 text-left">
              <span className="text-sm font-semibold text-ink-navy/50 uppercase tracking-wider">
                {filtroTipo === 'tavolo' ? 'Conti chiusi' : 'Pronti questa serata'} <span className="font-normal normal-case text-ink-navy/35">({filtroTipo === 'tavolo' ? contiChiusi.length : chiusi.length})</span>
              </span>
              <span className="text-xs text-ink-navy/40">{fmt(totaleChiusi)}</span>
              <span className={`ml-auto text-ink-navy/30 transition-transform ${chiusiAperti ? 'rotate-180' : ''}`}>▾</span>
            </button>
          ) : (
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold text-ink-navy/50 uppercase tracking-wider capitalize">
                {fmtGiorno(dataFiltro)} <span className="font-normal text-ink-navy/35">({filtroTipo === 'tavolo' ? contiChiusi.length + contiAperti.length : chiusi.length + aperti.length})</span>
              </h2>
              <span className="text-xs text-ink-navy/40">{fmt(totaleChiusi + totaleAperti)}</span>
            </div>
          )}
          {(!isOggi || chiusiAperti) && (
            filtroTipo === 'tavolo'
              ? <div className="space-y-3 mt-2">{contiChiusi.map(c => <ContoBlock key={c.key} conto={c} chiuso />)}</div>
              : <div className="space-y-3 mt-2">{chiusi.map(o => <OrdineCard key={o.id} o={o} />)}</div>
          )}
        </div>
      )}
      {!isOggi && aperti.length > 0 && <div className="space-y-3">{aperti.map(o => <OrdineCard key={o.id} o={o} />)}</div>}
      {ordini.length === 0 && !loading && (
        <div className="bg-white border border-ink-navy/10 rounded-xl p-8 text-center text-ink-navy/30 text-sm">
          Nessun ordine per {fmtGiorno(dataFiltro).toLowerCase()}
        </div>
      )}

      {modificando && (
        <ModificaModal ordine={modificando} onClose={() => setModificando(null)} onOrdineUpdated={aggiorna} />
      )}

      {copertiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-navy/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs mx-4">
            {modalStep === 'scelta' ? (
              <>
                <h3 className="text-base font-bold text-ink-navy mb-1">Chiudi {copertiModal.tavolo}</h3>
                <p className="text-sm text-ink-navy/50 mb-5">Quanti coperti al tavolo?</p>
                <div className="flex items-center justify-center gap-4 mb-6">
                  <button onClick={() => cambiaCoperti(-1)}
                    className="w-10 h-10 rounded-xl border border-ink-navy/15 text-ink-navy/60 text-xl font-bold hover:bg-mist transition-colors flex items-center justify-center">−</button>
                  <span className="text-4xl font-bold text-ink-navy w-12 text-center">{copertiValue}</span>
                  <button onClick={() => cambiaCoperti(1)}
                    className="w-10 h-10 rounded-xl border border-ink-navy/15 text-ink-navy/60 text-xl font-bold hover:bg-mist transition-colors flex items-center justify-center">+</button>
                </div>
                <p className="text-[11px] text-ink-navy/45 text-center -mt-3 mb-4 leading-snug">
                  ℹ️ Questi coperti verranno usati per le statistiche (analytics).
                </p>
                <div className="space-y-2">
                  <button onClick={() => chiudiConto(copertiModal, copertiValue)}
                    className="w-full py-2.5 bg-ink-navy text-white rounded-xl text-sm font-semibold hover:bg-ink-navy/80 transition-colors">
                    Chiudi conto
                  </button>
                  <button onClick={() => { setCopertiRomana(copertiValue); setPagatiRomana(new Set()); setModalStep('romana') }}
                    className="w-full py-2.5 bg-electric-blue text-white rounded-xl text-sm font-semibold hover:bg-electric-blue/90 transition-colors">
                    Paga alla romana
                  </button>
                  <button onClick={() => setCopertiModal(null)}
                    className="w-full py-2 text-ink-navy/50 text-sm font-semibold hover:text-ink-navy/70 transition-colors">
                    Annulla
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-ink-navy mb-1">Paga alla romana</h3>
                <p className="text-sm text-ink-navy/50 mb-4">{fmt(copertiTotale)} diviso {copertiRomana} coperti</p>
                <div className="flex items-center justify-center gap-4 mb-2">
                  <button onClick={() => cambiaCopertiRomana(-1)}
                    className="w-9 h-9 rounded-xl border border-ink-navy/15 text-ink-navy/60 text-lg font-bold hover:bg-mist transition-colors flex items-center justify-center">−</button>
                  <div className="text-center w-28">
                    <span className="block text-2xl font-bold text-ink-navy">{fmt(copertiTotale / copertiRomana)}</span>
                    <span className="text-xs text-ink-navy/45">a testa · {copertiRomana} coperti</span>
                  </div>
                  <button onClick={() => cambiaCopertiRomana(1)}
                    className="w-9 h-9 rounded-xl border border-ink-navy/15 text-ink-navy/60 text-lg font-bold hover:bg-mist transition-colors flex items-center justify-center">+</button>
                </div>
                <p className="text-[11px] text-ink-navy/40 text-center mb-3 leading-snug">
                  Solo per dividere il conto — non cambia i coperti usati dalle statistiche.
                </p>
                <div className="max-h-52 overflow-y-auto -mx-1 px-1 mb-3 space-y-1.5">
                  {Array.from({ length: copertiRomana }, (_, i) => {
                    const pagato = pagatiRomana.has(i)
                    return (
                      <button key={i} onClick={() => setPagatiRomana(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${pagato ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-ink-navy/15 text-ink-navy/70 hover:bg-mist'}`}>
                        <span className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] ${pagato ? 'bg-green-500 text-white' : 'border border-ink-navy/25'}`}>{pagato ? '✓' : ''}</span>
                          Coperto {i + 1}
                        </span>
                        <span>{fmt(copertiTotale / copertiRomana)}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between text-sm mb-3 px-1">
                  <span className="text-ink-navy/60 font-medium">Pagato {pagatiRomana.size}/{copertiRomana}</span>
                  <span className="font-bold text-ink-navy">{fmt(copertiTotale / copertiRomana * pagatiRomana.size)} di {fmt(copertiTotale)}</span>
                </div>
                <div className="space-y-2">
                  <button onClick={() => chiudiConto(copertiModal, copertiValue)}
                    className="w-full py-2.5 bg-ink-navy text-white rounded-xl text-sm font-semibold hover:bg-ink-navy/80 transition-colors">
                    Chiudi conto
                  </button>
                  <button onClick={() => setModalStep('scelta')}
                    className="w-full py-2 text-ink-navy/50 text-sm font-semibold hover:text-ink-navy/70 transition-colors">
                    Indietro
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

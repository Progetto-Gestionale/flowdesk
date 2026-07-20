'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface RigaOrdine { id: string; nome: string; quantita: number; prezzo: number; note?: string | null }
interface Ordine {
  id: string; tavolo: string; tavoloId: string | null; gruppoId: string | null
  totale: number; note: string | null; status: string; createdAt: string
  tipo: string; righe: RigaOrdine[]; clienteInfo?: string | null
}
interface Piatto { id: string; nome: string; prezzo: number; descrizione?: string | null }
interface Categoria { id: string; nome: string; piatti: Piatto[] }

const fmt = (n: number) => `€${n.toFixed(2)}`

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
  const [salvando, setSalvando] = useState<string | null>(null) // id operazione in corso
  const [categorie, setCategorie] = useState<Categoria[]>([])
  const [search, setSearch] = useState('')
  const [sezioneMenu, setSezioneMenu] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/menu/categorie', { credentials: 'include' })
      .then(r => r.json()).then(d => setCategorie(d.categorie ?? [])).catch(() => {})
  }, [])

  async function callApi(method: string, body: object) {
    const res = await fetch(`/api/ordini/${ordine.id}/riga`, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (data.ordine) {
      const nuoveRighe = data.ordine.righe ?? righe
      setRighe(nuoveRighe)
      setTotale(data.ordine.totale)
      onOrdineUpdated({ ...ordine, righe: nuoveRighe, totale: data.ordine.totale })
    }
  }

  async function rimuovi(rigaId: string) {
    setSalvando(rigaId)
    setRighe(prev => prev.filter(r => r.id !== rigaId))
    await callApi('DELETE', { rigaId })
    setSalvando(null)
  }

  async function cambiaQ(rigaId: string, delta: number) {
    const riga = righe.find(r => r.id === rigaId)
    if (!riga) return
    if (riga.quantita + delta <= 0) { rimuovi(rigaId); return }
    setSalvando(rigaId)
    setRighe(prev => prev.map(r => r.id === rigaId ? { ...r, quantita: r.quantita + delta } : r))
    await callApi('PATCH', { rigaId, quantita: riga.quantita + delta })
    setSalvando(null)
  }

  async function aggiungi(p: Piatto) {
    setSalvando('add-' + p.id)
    await callApi('POST', { piattoId: p.id, nome: p.nome, prezzo: p.prezzo, quantita: 1 })
    setSalvando(null)
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
                  <button onClick={() => cambiaQ(r.id, -1)} disabled={!!salvando}
                    className="w-6 h-6 rounded-full bg-ink-navy/8 hover:bg-ink-navy/15 text-ink-navy font-bold text-sm flex items-center justify-center disabled:opacity-40">−</button>
                  <span className="w-5 text-center text-sm font-semibold text-ink-navy">{r.quantita}</span>
                  <button onClick={() => cambiaQ(r.id, +1)} disabled={!!salvando}
                    className="w-6 h-6 rounded-full bg-ink-navy/8 hover:bg-ink-navy/15 text-ink-navy font-bold text-sm flex items-center justify-center disabled:opacity-40">+</button>
                </div>
                <button onClick={() => rimuovi(r.id)} disabled={!!salvando}
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
                      <button key={p.id} onClick={() => aggiungi(p)} disabled={salvando === 'add-' + p.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-electric-blue/8 hover:bg-electric-blue/15 text-electric-blue text-xs font-semibold transition-colors disabled:opacity-50">
                        {salvando === 'add-' + p.id ? '…' : p.nome}
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
                            <button key={p.id} onClick={() => aggiungi(p)} disabled={salvando === 'add-' + p.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-electric-blue/8 hover:bg-electric-blue/15 text-electric-blue text-xs font-semibold transition-colors disabled:opacity-50">
                              {salvando === 'add-' + p.id ? '…' : p.nome}
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
  const [copertiValue, setCopertiValue] = useState(2)
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [chiusiAperti, setChiusiAperti] = useState(false)
  const [dataFiltro, setDataFiltro] = useState(todayKey)
  const [filtroTipo, setFiltroTipo] = useState<'tavolo' | 'asporto' | 'delivery'>('tavolo')
  const [calOpen, setCalOpen] = useState(false)
  const [modificando, setModificando] = useState<Ordine | null>(null)

  const isOggi = dataFiltro === todayKey()

  const fetchOrdini = useCallback(async () => {
    const url = isOggi ? '/api/ordini?oggi=1' : '/api/ordini?giorni=90'
    const res = await fetch(url, { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setTutti(data.ordini ?? [])
  }, [isOggi])

  useEffect(() => {
    setLoading(true)
    fetchOrdini().finally(() => setLoading(false))
    if (!isOggi) return
    const iv = setInterval(fetchOrdini, 15000)
    return () => clearInterval(iv)
  }, [fetchOrdini, isOggi])

  const ordini = isOggi ? tutti : tutti.filter(o => getSerataKey(o.createdAt) === dataFiltro)
  const isTavolo = (o: Ordine) => o.tipo === 'tavolo' || o.tavoloId != null || o.gruppoId != null
  const isDone = (o: Ordine) => o.status === 'chiuso' || o.status === 'consegnato'
  const matchesFiltro = (o: Ordine) => {
    if (filtroTipo === 'tavolo') return isTavolo(o)
    if (filtroTipo === 'delivery') return o.tipo === 'delivery'
    return !isTavolo(o) && o.tipo !== 'delivery' // asporto
  }
  const aperti = ordini.filter(o => !isDone(o) && matchesFiltro(o))
  const chiusi = ordini.filter(o => isDone(o) && matchesFiltro(o))
  const countAperti = {
    tavolo: ordini.filter(o => !isDone(o) && isTavolo(o)).length,
    asporto: ordini.filter(o => !isDone(o) && !isTavolo(o) && o.tipo !== 'delivery').length,
    delivery: ordini.filter(o => !isDone(o) && o.tipo === 'delivery').length,
  }
  const totaleAperti = aperti.reduce((s, o) => s + o.totale, 0)
  const totaleChiusi = chiusi.reduce((s, o) => s + o.totale, 0)

  function aggiorna(updated: Ordine) {
    setTutti(prev => prev.map(x => x.id === updated.id ? updated : x))
    if (modificando?.id === updated.id) setModificando(updated)
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

  async function eliminaOrdine(o: Ordine) {
    setTutti(prev => prev.filter(x => x.id !== o.id))
    setConfermaElimina(null)
    await fetch(`/api/ordini/${o.id}`, { method: 'DELETE', credentials: 'include' })
    fetchOrdini()
  }

  function OrdineCard({ o }: { o: Ordine }) {
    const aperto = !isDone(o)
    const ora = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

    // etichetta tipo (solo asporto/delivery; i tavoli mostrano già il nome tavolo)
    const badge = isTavolo(o) ? null : o.tipo === 'delivery' ? 'Delivery' : 'Asporto'
    // per asporto/delivery mostra il nome cliente dell'ordine invece di "Asporto"/"Delivery"
    const label = isTavolo(o)
      ? o.tavolo
      : (() => { try { return JSON.parse(o.clienteInfo ?? '{}').nome || o.tavolo } catch { return o.tavolo } })()

    return (
      <div className="bg-white border border-ink-navy/10 rounded-xl overflow-hidden shadow-sm">
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
                <button onClick={() => { setCopertiModal(o); setCopertiValue(2) }} disabled={chiudendo === o.id}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 disabled:opacity-40 transition-colors">
                  {chiudendo === o.id ? '…' : 'Chiudi'}
                </button>
              ) : (
                <button onClick={() => segnaPronte(o)} disabled={chiudendo === o.id}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 disabled:opacity-40 transition-colors">
                  {chiudendo === o.id ? '…' : 'Pronto'}
                </button>
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

  if (loading) return <div className="p-8 text-ink-navy/40 text-sm text-center">Caricamento…</div>

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
                Pronti questa serata <span className="font-normal normal-case text-ink-navy/35">({chiusi.length})</span>
              </span>
              <span className="text-xs text-ink-navy/40">{fmt(totaleChiusi)}</span>
              <span className={`ml-auto text-ink-navy/30 transition-transform ${chiusiAperti ? 'rotate-180' : ''}`}>▾</span>
            </button>
          ) : (
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold text-ink-navy/50 uppercase tracking-wider capitalize">
                {fmtGiorno(dataFiltro)} <span className="font-normal text-ink-navy/35">({chiusi.length + aperti.length})</span>
              </h2>
              <span className="text-xs text-ink-navy/40">{fmt(totaleChiusi + totaleAperti)}</span>
            </div>
          )}
          {(!isOggi || chiusiAperti) && (
            <div className="space-y-3 mt-2">{chiusi.map(o => <OrdineCard key={o.id} o={o} />)}</div>
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
            <h3 className="text-base font-bold text-ink-navy mb-1">Chiudi {copertiModal.tavolo}</h3>
            <p className="text-sm text-ink-navy/50 mb-5">Quanti coperti al tavolo?</p>
            <div className="flex items-center justify-center gap-4 mb-6">
              <button onClick={() => setCopertiValue(v => Math.max(1, v - 1))}
                className="w-10 h-10 rounded-xl border border-ink-navy/15 text-ink-navy/60 text-xl font-bold hover:bg-mist transition-colors flex items-center justify-center">−</button>
              <span className="text-4xl font-bold text-ink-navy w-12 text-center">{copertiValue}</span>
              <button onClick={() => setCopertiValue(v => v + 1)}
                className="w-10 h-10 rounded-xl border border-ink-navy/15 text-ink-navy/60 text-xl font-bold hover:bg-mist transition-colors flex items-center justify-center">+</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCopertiModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-ink-navy/15 text-ink-navy/60 text-sm font-semibold hover:bg-mist transition-colors">
                Annulla
              </button>
              <button onClick={() => chiudiConto(copertiModal, copertiValue)}
                className="flex-1 py-2.5 bg-ink-navy text-white rounded-xl text-sm font-semibold hover:bg-ink-navy/80 transition-colors">
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

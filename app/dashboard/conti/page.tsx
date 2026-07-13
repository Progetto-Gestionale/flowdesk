'use client'

import { useState, useEffect, useCallback } from 'react'

interface RigaOrdine { id: string; nome: string; quantita: number; prezzo: number; note?: string | null }
interface Ordine {
  id: string; tavolo: string; tavoloId: string | null; gruppoId: string | null
  totale: number; note: string | null; status: string; createdAt: string
  tipo: string; righe: RigaOrdine[]
}

const fmt = (n: number) => `€${n.toFixed(2)}`

function getSerataKey(createdAt: string): string {
  const d = new Date(createdAt)
  if (d.getUTCHours() < 4) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function todayKey(): string {
  return getSerataKey(new Date().toISOString())
}

function prevDay(k: string): string {
  const d = new Date(k + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function nextDay(k: string): string {
  const d = new Date(k + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function fmtGiorno(key: string): string {
  const today = todayKey()
  const yesterday = prevDay(today)
  if (key === today) return 'Oggi'
  if (key === yesterday) return 'Ieri'
  const d = new Date(key + 'T12:00:00Z')
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function ContiPage() {
  const [tutti, setTutti] = useState<Ordine[]>([])
  const [chiudendo, setChiudendo] = useState<string | null>(null)
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'tavoli' | 'ordini'>('tavoli')
  const [chiusiAperti, setChiusiAperti] = useState(false)
  const [dataFiltro, setDataFiltro] = useState(todayKey)

  // modal modifica
  const [modificando, setModificando] = useState<Ordine | null>(null)
  const [righeLocali, setRigheLocali] = useState<RigaOrdine[]>([])
  const [salvando, setSalvando] = useState(false)

  const isOggi = dataFiltro === todayKey()

  const fetchOrdini = useCallback(async () => {
    // Per oggi usa ?oggi=1, per i giorni passati prende 90gg e filtra client-side
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

  // filtra per serata selezionata
  const ordini = isOggi ? tutti : tutti.filter(o => getSerataKey(o.createdAt) === dataFiltro)

  const tavoli = ordini.filter(o => o.tipo === 'tavolo' || o.tavoloId != null || o.gruppoId != null)
  const altriOrdini = ordini.filter(o => o.tipo !== 'tavolo' && o.tavoloId == null && o.gruppoId == null)
  const lista = tab === 'tavoli' ? tavoli : altriOrdini

  const aperti = lista.filter(o => o.status !== 'chiuso')
  const chiusi = lista.filter(o => o.status === 'chiuso')
  const totaleAperti = aperti.reduce((s, o) => s + o.totale, 0)
  const totaleChiusi = chiusi.reduce((s, o) => s + o.totale, 0)

  async function chiudiConto(o: Ordine) {
    setChiudendo(o.id)
    setTutti(prev => prev.map(x => x.id === o.id ? { ...x, status: 'chiuso' } : x))
    try {
      await fetch('/api/tavoli/chiudi-conto', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tavoloId: o.tavoloId, gruppoId: o.gruppoId }),
      })
    } finally {
      setChiudendo(null)
      fetchOrdini()
    }
  }

  async function eliminaOrdine(o: Ordine) {
    setTutti(prev => prev.filter(x => x.id !== o.id))
    await fetch(`/api/ordini/${o.id}`, { method: 'DELETE', credentials: 'include' })
    fetchOrdini()
  }

  function apriModifica(o: Ordine) {
    setModificando(o)
    setRigheLocali([...o.righe])
  }

  async function rimuoviRiga(rigaId: string) {
    if (!modificando) return
    const nuoveRighe = righeLocali.filter(r => r.id !== rigaId)
    setRigheLocali(nuoveRighe)
    setSalvando(true)
    const res = await fetch(`/api/ordini/${modificando.id}/riga`, {
      method: 'DELETE', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rigaId }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.ordine) {
      setTutti(prev => prev.map(x => x.id === modificando.id ? { ...x, totale: data.ordine.totale, righe: nuoveRighe } : x))
      setModificando(prev => prev ? { ...prev, totale: data.ordine.totale, righe: nuoveRighe } : null)
    }
    setSalvando(false)
    fetchOrdini()
  }

  async function cambiaQuantita(rigaId: string, delta: number) {
    if (!modificando) return
    const riga = righeLocali.find(r => r.id === rigaId)
    if (!riga) return
    const nuova = riga.quantita + delta
    if (nuova <= 0) { rimuoviRiga(rigaId); return }
    const nuoveRighe = righeLocali.map(r => r.id === rigaId ? { ...r, quantita: nuova } : r)
    setRigheLocali(nuoveRighe)
    setSalvando(true)
    const res = await fetch(`/api/ordini/${modificando.id}/riga`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rigaId, quantita: nuova }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.ordine) {
      setTutti(prev => prev.map(x => x.id === modificando.id ? { ...x, totale: data.ordine.totale } : x))
      setModificando(prev => prev ? { ...prev, totale: data.ordine.totale } : null)
    }
    setSalvando(false)
    fetchOrdini()
  }

  function OrdineCard({ o }: { o: Ordine }) {
    const aperto = o.status !== 'chiuso'
    const ora = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    return (
      <div className={`bg-white border rounded-xl overflow-hidden ${aperto ? 'border-electric-blue/30 shadow-sm' : 'border-ink-navy/10'}`}>
        <div className={`px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${aperto ? 'bg-electric-blue/5' : 'bg-mist'}`}>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${aperto ? 'text-electric-blue' : 'text-ink-navy/50'}`}>{o.tavolo}</span>
            <span className="text-xs text-ink-navy/35">{aperto ? 'aperto' : 'chiuso'} {ora}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className={`text-base font-bold ${aperto ? 'text-ink-navy' : 'text-ink-navy/40'}`}>{fmt(o.totale)}</span>
            {/* Modifica disponibile sia per aperti che per chiusi */}
            <button onClick={() => apriModifica(o)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:bg-mist transition-colors">
              Modifica
            </button>
            {aperto && (
              <button onClick={() => chiudiConto(o)} disabled={chiudendo === o.id}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 disabled:opacity-40 transition-colors">
                {chiudendo === o.id ? '…' : 'Chiudi tavolo'}
              </button>
            )}
            {!aperto && (
              confermaElimina === o.id ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setConfermaElimina(null)} className="text-xs px-2 py-1 rounded-lg border border-ink-navy/15 text-ink-navy/50">No</button>
                  <button onClick={() => { eliminaOrdine(o); setConfermaElimina(null) }} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-semibold">Sì</button>
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
                <span className="text-xs font-bold text-ink-navy/40 w-5 shrink-0 text-center">{r.quantita}×</span>
                <span className="text-sm text-ink-navy truncate">{r.nome}</span>
                {r.note && <span className="text-xs text-ink-navy/35 truncate">({r.note})</span>}
              </div>
              <span className="text-sm text-ink-navy/60 shrink-0">{fmt(r.prezzo * r.quantita)}</span>
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
      {/* Header */}
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
        <span className="flex-1 text-center text-sm font-semibold text-ink-navy">{fmtGiorno(dataFiltro)}</span>
        <button onClick={() => { setDataFiltro(nextDay(dataFiltro)); setChiusiAperti(false) }}
          disabled={dataFiltro >= todayKey()}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:bg-mist disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm">›</button>
        {!isOggi && (
          <button onClick={() => { setDataFiltro(todayKey()); setChiusiAperti(false) }}
            className="text-xs text-electric-blue font-semibold px-2.5 py-1.5 rounded-lg border border-electric-blue/25 hover:bg-electric-blue/10 transition-colors">
            Oggi
          </button>
        )}
      </div>

      {/* Tab */}
      <div className="flex gap-2">
        {([['tavoli', 'Tavoli'], ['ordini', 'Asporto & Delivery']] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setChiusiAperti(false) }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors relative ${tab === k ? 'bg-electric-blue text-white' : 'bg-white border border-ink-navy/15 text-ink-navy/60 hover:bg-mist'}`}>
            {l}
            {k === 'tavoli' && isOggi && tavoli.filter(o => o.status !== 'chiuso').length > 0 && (
              <span className="ml-1.5 bg-zest-lime text-ink-navy text-xs font-bold px-1.5 py-0.5 rounded-full">
                {tavoli.filter(o => o.status !== 'chiuso').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Aperti */}
      {isOggi && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-semibold text-ink-navy/50 uppercase tracking-wider">
              {tab === 'tavoli' ? 'Conti aperti' : 'In corso'}
              {aperti.length > 0 && <span className="ml-1.5 bg-electric-blue text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{aperti.length}</span>}
            </h2>
            {totaleAperti > 0 && <span className="text-xs text-ink-navy/40">{fmt(totaleAperti)} in sospeso</span>}
          </div>
          {aperti.length === 0 ? (
            <div className="bg-white border border-ink-navy/10 rounded-xl p-6 text-center text-ink-navy/30 text-sm">
              {tab === 'tavoli'
                ? 'Nessun conto aperto — i QR dei tavoli apriranno automaticamente un conto quando il cliente ordina'
                : 'Nessun ordine in corso'}
            </div>
          ) : (
            <div className="space-y-3">{aperti.map(o => <OrdineCard key={o.id} o={o} />)}</div>
          )}
        </div>
      )}

      {/* Chiusi — a scomparsa per oggi, lista diretta per passato */}
      {chiusi.length > 0 && (
        <div>
          {isOggi ? (
            <button onClick={() => setChiusiAperti(v => !v)} className="w-full flex items-center gap-3 py-2 text-left">
              <span className="text-sm font-semibold text-ink-navy/50 uppercase tracking-wider">
                Chiusi questa serata <span className="font-normal normal-case text-ink-navy/35">({chiusi.length})</span>
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

      {/* Giorni passati: mostra anche gli aperti */}
      {!isOggi && aperti.length > 0 && (
        <div className="space-y-3">{aperti.map(o => <OrdineCard key={o.id} o={o} />)}</div>
      )}

      {ordini.length === 0 && !loading && (
        <div className="bg-white border border-ink-navy/10 rounded-xl p-8 text-center text-ink-navy/30 text-sm">
          Nessun ordine per {fmtGiorno(dataFiltro).toLowerCase()}
        </div>
      )}

      {/* Modal modifica righe */}
      {modificando && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-ink-navy/8 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink-navy">Modifica — {modificando.tavolo}</h3>
                <p className="text-xs text-ink-navy/40 mt-0.5">
                  {modificando.status === 'chiuso' ? 'Ordine chiuso · nessun QR collegato' : 'Ordine aperto'}
                </p>
              </div>
              <button onClick={() => setModificando(null)} className="text-ink-navy/30 hover:text-ink-navy/60 text-xl font-bold leading-none">✕</button>
            </div>
            <div className="divide-y divide-ink-navy/6 max-h-80 overflow-y-auto">
              {righeLocali.length === 0 && <p className="px-5 py-4 text-sm text-ink-navy/30 text-center">Ordine vuoto</p>}
              {righeLocali.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex-1 text-sm text-ink-navy truncate">{r.nome}</span>
                  {r.note && <span className="text-xs text-ink-navy/35">({r.note})</span>}
                  <span className="text-sm text-ink-navy/50 shrink-0">{fmt(r.prezzo * r.quantita)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => cambiaQuantita(r.id, -1)} disabled={salvando}
                      className="w-6 h-6 rounded-full bg-ink-navy/8 hover:bg-ink-navy/15 text-ink-navy font-bold text-sm flex items-center justify-center disabled:opacity-40">−</button>
                    <span className="w-5 text-center text-sm font-semibold text-ink-navy">{r.quantita}</span>
                    <button onClick={() => cambiaQuantita(r.id, +1)} disabled={salvando}
                      className="w-6 h-6 rounded-full bg-ink-navy/8 hover:bg-ink-navy/15 text-ink-navy font-bold text-sm flex items-center justify-center disabled:opacity-40">+</button>
                  </div>
                  <button onClick={() => rimuoviRiga(r.id)} disabled={salvando}
                    className="text-red-400 hover:text-red-600 text-sm font-bold disabled:opacity-40 pl-1">✕</button>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-ink-navy/8 flex items-center justify-between">
              <span className="text-sm font-bold text-ink-navy">
                {fmt(righeLocali.reduce((s, r) => s + r.prezzo * r.quantita, 0))}
              </span>
              <button onClick={() => setModificando(null)}
                className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90 transition-colors">
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

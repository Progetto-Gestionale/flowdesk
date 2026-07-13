'use client'

import { useState, useEffect, useCallback } from 'react'

interface RigaOrdine { id: string; nome: string; quantita: number; prezzo: number; note?: string | null }
interface Ordine { id: string; tavolo: string; tavoloId: string | null; gruppoId: string | null; totale: number; note: string | null; status: string; createdAt: string; righe: RigaOrdine[] }

const fmt = (n: number) => `€${n.toFixed(2)}`

function getSerataKey(createdAt: string): string {
  const d = new Date(createdAt)
  if (d.getUTCHours() < 4) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export default function ContiPage() {
  const [ordiniAperti, setOrdiniAperti] = useState<Ordine[]>([])
  const [ordiniChiusi, setOrdiniChiusi] = useState<Ordine[]>([])
  const [chiudendo, setChiudendo] = useState<string | null>(null)
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchOrdini = useCallback(async () => {
    const res = await fetch('/api/ordini?oggi=1', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    const tutti: Ordine[] = data.ordini ?? []
    setOrdiniAperti(tutti.filter(o => o.status !== 'chiuso'))
    setOrdiniChiusi(tutti.filter(o => o.status === 'chiuso'))
  }, [])

  useEffect(() => {
    fetchOrdini().finally(() => setLoading(false))
    const iv = setInterval(fetchOrdini, 15000)
    return () => clearInterval(iv)
  }, [fetchOrdini])

  async function chiudiConto(o: Ordine) {
    setChiudendo(o.id)
    // aggiorna ottimisticamente
    setOrdiniAperti(prev => prev.filter(x => x.id !== o.id))
    setOrdiniChiusi(prev => [{ ...o, status: 'chiuso' }, ...prev])
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

  async function riapriConto(o: Ordine) {
    setOrdiniChiusi(prev => prev.filter(x => x.id !== o.id))
    setOrdiniAperti(prev => [{ ...o, status: 'aperto' }, ...prev])
    await fetch(`/api/ordini/${o.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'aperto' }),
    })
    fetchOrdini()
  }

  async function eliminaOrdine(o: Ordine) {
    setOrdiniChiusi(prev => prev.filter(x => x.id !== o.id))
    await fetch(`/api/ordini/${o.id}`, { method: 'DELETE', credentials: 'include' })
    fetchOrdini()
  }

  // Raggruppa chiusi per serata (solo oggi)
  const serataOggi = getSerataKey(new Date().toISOString())
  const chiusiOggi = ordiniChiusi.filter(o => getSerataKey(o.createdAt) === serataOggi)

  const totaleAperto = ordiniAperti.reduce((s, o) => s + o.totale, 0)
  const totaleChiuso = chiusiOggi.reduce((s, o) => s + o.totale, 0)

  function OrdineCard({ o, aperto }: { o: Ordine; aperto: boolean }) {
    const ora = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    return (
      <div className={`bg-white border rounded-xl overflow-hidden ${aperto ? 'border-electric-blue/30 shadow-sm' : 'border-ink-navy/10'}`}>
        <div className={`px-4 py-3 flex items-center justify-between gap-3 ${aperto ? 'bg-electric-blue/5' : 'bg-mist'}`}>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${aperto ? 'text-electric-blue' : 'text-ink-navy/50'}`}>{o.tavolo}</span>
            <span className="text-xs text-ink-navy/35">{aperto ? 'aperto' : 'chiuso'} {ora}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-base font-bold ${aperto ? 'text-ink-navy' : 'text-ink-navy/40'}`}>{fmt(o.totale)}</span>
            {aperto && (
              <button onClick={() => chiudiConto(o)} disabled={chiudendo === o.id}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 disabled:opacity-40 transition-colors">
                {chiudendo === o.id ? '…' : 'Chiudi tavolo'}
              </button>
            )}
            {!aperto && (
              <>
                <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">Chiuso</span>
                <button onClick={() => riapriConto(o)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:bg-mist transition-colors">Riapri</button>
                {confermaElimina === o.id ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setConfermaElimina(null)} className="text-xs px-2 py-1 rounded-lg border border-ink-navy/15 text-ink-navy/50">No</button>
                    <button onClick={() => { eliminaOrdine(o); setConfermaElimina(null) }} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-semibold">Sì</button>
                  </div>
                ) : (
                  <button onClick={() => setConfermaElimina(o.id)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors">Elimina</button>
                )}
              </>
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
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-navy">Conti</h1>
          <p className="text-sm text-ink-navy/40 mt-0.5">Questa serata · aggiornamento automatico ogni 15s</p>
        </div>
        <button onClick={fetchOrdini} className="text-xs text-electric-blue hover:underline font-medium">Aggiorna</button>
      </div>

      {/* Conti aperti */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold text-ink-navy/50 uppercase tracking-wider">
            Conti aperti
            {ordiniAperti.length > 0 && <span className="ml-1.5 bg-electric-blue text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{ordiniAperti.length}</span>}
          </h2>
          {totaleAperto > 0 && <span className="text-xs text-ink-navy/40">{fmt(totaleAperto)} in sospeso</span>}
        </div>
        {ordiniAperti.length === 0 ? (
          <div className="bg-white border border-ink-navy/10 rounded-xl p-8 text-center text-ink-navy/30 text-sm">
            Nessun conto aperto — i QR dei tavoli apriranno automaticamente un conto quando il cliente ordina
          </div>
        ) : (
          <div className="space-y-3">{ordiniAperti.map(o => <OrdineCard key={o.id} o={o} aperto />)}</div>
        )}
      </div>

      {/* Conti chiusi oggi */}
      {chiusiOggi.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-semibold text-ink-navy/50 uppercase tracking-wider">Chiusi questa serata</h2>
            <span className="text-xs text-ink-navy/40">{fmt(totaleChiuso)} totale</span>
          </div>
          <div className="space-y-3">{chiusiOggi.map(o => <OrdineCard key={o.id} o={o} aperto={false} />)}</div>
        </div>
      )}
    </div>
  )
}

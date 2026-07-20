'use client'
import { useEffect, useState, useCallback } from 'react'

interface RigaOrdine { id: string; nome: string; prezzo: number; quantita: number; note?: string }
interface Ordine {
  id: string
  tavolo: string
  tipo: string
  clienteInfo: string | null
  status: string
  totale: number
  note: string | null
  createdAt: string
  righe: RigaOrdine[]
}

type Stato = 'in_preparazione' | 'pronto' | 'consegnato'

function statoOrdine(o: Ordine): Stato {
  if (o.status === 'consegnato' || o.status === 'chiuso') return 'consegnato'
  if (o.status === 'pronto') return 'pronto'
  return 'in_preparazione'
}

const SEZIONI: { key: Stato; label: string }[] = [
  { key: 'in_preparazione', label: 'In preparazione' },
  { key: 'pronto', label: 'Pronto — da consegnare' },
  { key: 'consegnato', label: 'Consegnati' },
]

export default function DeliveryPage() {
  const [ordini, setOrdini] = useState<Ordine[]>([])
  const [loading, setLoading] = useState(true)
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null)

  const fetchOrdini = useCallback(async () => {
    const res = await fetch('/api/ordini?oggi=1', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setOrdini((data.ordini ?? []).filter((o: Ordine) => o.tipo === 'delivery'))
  }, [])

  useEffect(() => {
    fetchOrdini().finally(() => setLoading(false))
    const iv = setInterval(fetchOrdini, 15000)
    return () => clearInterval(iv)
  }, [fetchOrdini])

  async function setStato(id: string, status: string) {
    setOrdini(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    await fetch(`/api/ordini/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchOrdini()
  }

  async function elimina(id: string) {
    setOrdini(prev => prev.filter(o => o.id !== id))
    setConfermaElimina(null)
    await fetch(`/api/ordini/${id}`, { method: 'DELETE', credentials: 'include' })
    fetchOrdini()
  }

  function Card({ o }: { o: Ordine }) {
    const stato = statoOrdine(o)
    const isDone = stato === 'consegnato'
    let ci: { nome?: string; telefono?: string; indirizzo?: string; ora?: string } = {}
    try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
    const label = ci.nome || 'Ordine online'
    const oraArrivo = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

    return (
      <div className={`bg-white border rounded-xl overflow-hidden shadow-sm ${isDone ? 'border-ink-navy/10' : 'border-teal-300'}`}>
        {/* Header */}
        <div className={`px-4 py-3 border-b ${isDone ? 'bg-mist border-ink-navy/10' : 'bg-teal-50 border-teal-300'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className={`block text-sm font-bold truncate ${isDone ? 'text-ink-navy/50' : 'text-teal-800'}`}>{label}</span>
              {ci.ora && (
                <p className={`mt-0.5 text-sm font-bold ${isDone ? 'text-ink-navy/40' : 'text-ink-navy'}`}>
                  Consegna alle {ci.ora}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-200/60 text-teal-700">Delivery</span>
              <span className={`text-xs ${isDone ? 'text-ink-navy/35' : 'text-teal-800/60'}`}>ordine {oraArrivo}</span>
            </div>
          </div>
        </div>

        {/* Info consegna */}
        {(ci.indirizzo || ci.telefono) && (
          <div className="px-4 py-2.5 bg-white border-b border-ink-navy/6 space-y-0.5">
            {ci.indirizzo && <p className="text-sm font-semibold text-ink-navy">📍 {ci.indirizzo}</p>}
            {ci.telefono && <p className="text-xs text-ink-navy/50">📞 {ci.telefono}</p>}
          </div>
        )}

        {/* Righe */}
        <div className={`divide-y divide-ink-navy/6 ${isDone ? 'opacity-60' : ''}`}>
          {o.righe.map(r => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-extrabold text-ink-navy shrink-0">{r.quantita}×</span>
                <span className="text-sm font-bold text-ink-navy truncate">{r.nome}</span>
                {r.note && <span className="text-xs text-ink-navy/35 truncate">({r.note})</span>}
              </div>
              <span className="text-sm text-ink-navy/50 shrink-0">€{(r.prezzo * r.quantita).toFixed(2)}</span>
            </div>
          ))}
          {o.note && <p className="px-4 py-2 text-xs text-ink-navy/35 italic">{o.note}</p>}
        </div>

        {/* Azioni */}
        <div className="px-4 py-3 border-t border-ink-navy/8 flex items-center justify-between gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${isDone ? 'text-ink-navy/40' : 'text-ink-navy/70'}`}>€{o.totale.toFixed(2)}</span>
          <div className="flex items-center gap-2">
            {stato === 'in_preparazione' && (
              <button onClick={() => setStato(o.id, 'pronto')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 transition-colors">
                Segna pronto
              </button>
            )}
            {stato === 'pronto' && (
              <button onClick={() => setStato(o.id, 'consegnato')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                Segna consegnato
              </button>
            )}
            {isDone && (
              confermaElimina === o.id ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setConfermaElimina(null)} className="text-xs px-2 py-1 rounded-lg border border-ink-navy/15 text-ink-navy/50">No</button>
                  <button onClick={() => elimina(o.id)} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-semibold">Sì</button>
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
      </div>
    )
  }

  if (loading) return <p className="text-ink-navy/35 text-sm p-8">Caricamento...</p>

  const perStato = (s: Stato) => ordini.filter(o => statoOrdine(o) === s)
  const vuoto = ordini.length === 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-navy">Delivery</h1>
          <p className="text-ink-navy/50 text-sm mt-0.5">Ordini a domicilio · aggiornamento ogni 15s</p>
        </div>
        <button onClick={fetchOrdini}
          className="text-sm text-electric-blue hover:text-ink-navy font-medium border border-electric-blue/25 px-3 py-1.5 rounded-lg hover:bg-electric-blue/10 transition-colors">
          ↻ Aggiorna
        </button>
      </div>

      {vuoto ? (
        <div className="bg-white rounded-2xl border border-ink-navy/10 p-16 text-center shadow-sm">
          <p className="text-ink-navy/50 text-sm">Nessun ordine delivery oggi</p>
          <p className="text-ink-navy/35 text-xs mt-1">Gli ordini a domicilio compaiono qui appena arrivano</p>
        </div>
      ) : (
        <div className="space-y-6">
          {SEZIONI.map(sez => {
            const lista = perStato(sez.key)
            if (lista.length === 0) return null
            return (
              <div key={sez.key}>
                <h2 className="text-sm font-semibold text-ink-navy/50 uppercase tracking-wider flex items-center gap-2 mb-3">
                  {sez.label}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${sez.key === 'pronto' ? 'bg-teal-600 text-white' : 'bg-mist text-ink-navy/50'}`}>{lista.length}</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {lista.map(o => <Card key={o.id} o={o} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

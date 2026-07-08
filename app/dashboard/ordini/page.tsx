'use client'
import { useEffect, useState } from 'react'

interface RigaOrdine {
  id: string
  nome: string
  prezzo: number
  quantita: number
  note: string
}

interface TavoloDb {
  id: string
  numero: number
  etichetta: string | null
  posti: number
}

interface Ordine {
  id: string
  tavolo: string
  tavoloId: string | null
  status: string
  totale: number
  note: string | null
  createdAt: string
  righe: RigaOrdine[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; next: string; nextLabel: string }> = {
  nuovo:           { label: 'Nuovo',           color: 'bg-amber-100 text-amber-700 border-amber-200',  next: 'in_preparazione', nextLabel: '👨‍🍳 Prendi in carico' },
  in_preparazione: { label: 'In preparazione', color: 'bg-blue-100 text-blue-700 border-blue-200',     next: 'pronto',          nextLabel: '🔔 Pronto' },
  pronto:          { label: 'Pronto',          color: 'bg-green-100 text-green-700 border-green-200',  next: 'consegnato',      nextLabel: '✅ Consegnato' },
  consegnato:      { label: 'Consegnato',      color: 'bg-gray-100 text-gray-500 border-gray-200',     next: '',                nextLabel: '' },
}

const GRUPPI = [
  { key: 'nuovo',           label: '🆕 Nuovi' },
  { key: 'in_preparazione', label: '👨‍🍳 In preparazione' },
  { key: 'pronto',          label: '🔔 Pronti' },
  { key: 'consegnato',      label: '✅ Consegnati' },
]

export default function OrdiniPage() {
  const [ordini, setOrdini] = useState<Ordine[]>([])
  const [tavoli, setTavoli] = useState<TavoloDb[]>([])
  const [loading, setLoading] = useState(true)
  const [cambioTavolo, setCambioTavolo] = useState<string | null>(null) // ordineId
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null) // ordineId

  async function fetchOrdini() {
    const res = await fetch('/api/ordini', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setOrdini(data.ordini ?? [])
    setLoading(false)
  }

  async function fetchTavoli() {
    const res = await fetch('/api/tavoli', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setTavoli(data.tavoli ?? [])
  }

  useEffect(() => {
    fetchOrdini()
    fetchTavoli()
    const interval = setInterval(fetchOrdini, 15000)
    return () => clearInterval(interval)
  }, [])

  async function avanzaStatus(id: string, status: string) {
    await fetch(`/api/ordini/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchOrdini()
  }

  async function cancellaOrdine(id: string) {
    await fetch(`/api/ordini/${id}`, { method: 'DELETE', credentials: 'include' })
    setConfermaElimina(null)
    fetchOrdini()
  }

  async function assegnaTavolo(ordineId: string, tavoloId: string, tavoloNumero: string) {
    await fetch(`/api/ordini/${ordineId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tavoloId, tavolo: tavoloNumero }),
    })
    setCambioTavolo(null)
    fetchOrdini()
  }

  const ordiniAttivi = ordini.filter(o => o.status !== 'consegnato')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ordini</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {ordiniAttivi.length > 0 ? `${ordiniAttivi.length} ordini attivi` : 'Nessun ordine attivo'} · aggiornamento ogni 15s
          </p>
        </div>
        <button onClick={fetchOrdini} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
          ↻ Aggiorna
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Caricamento...</p>
      ) : ordini.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-20 text-center shadow-sm">
          <div className="text-5xl mb-4">🧾</div>
          <p className="text-gray-500 text-sm">Nessun ordine ancora</p>
          <p className="text-gray-400 text-xs mt-1">Gli ordini arrivano in automatico dal menu digitale</p>
        </div>
      ) : (
        <div className="space-y-8">
          {GRUPPI.map(g => {
            const lista = ordini.filter(o => o.status === g.key)
            if (lista.length === 0) return null
            return (
              <div key={g.key}>
                <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                  {g.label}
                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{lista.length}</span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {lista.map(o => {
                    const cfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.nuovo
                    const ora = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                    const tavoloAssegnato = tavoli.find(t => t.id === o.tavoloId)
                    const labelTavolo = tavoloAssegnato
                      ? (tavoloAssegnato.etichetta ?? `Tavolo ${tavoloAssegnato.numero}`)
                      : `Tavolo ${o.tavolo}`
                    return (
                      <div key={o.id} className={`relative bg-white rounded-2xl border shadow-sm overflow-hidden ${o.status === 'nuovo' ? 'border-amber-300 ring-2 ring-amber-200' : 'border-gray-200'}`}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-gray-900">{labelTavolo}</p>
                              {tavoli.length > 0 && (
                                <button onClick={() => setCambioTavolo(cambioTavolo === o.id ? null : o.id)}
                                  className="text-xs text-indigo-500 hover:text-indigo-700 underline">
                                  cambia
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">{ora}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                        </div>

                        {/* Selettore tavolo */}
                        {cambioTavolo === o.id && (
                          <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                            <p className="text-xs font-medium text-indigo-700 mb-2">Assegna tavolo:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {tavoli.map(t => (
                                <button key={t.id}
                                  onClick={() => assegnaTavolo(o.id, t.id, t.numero.toString())}
                                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${o.tavoloId === t.id ? 'bg-indigo-600 text-white' : 'bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100'}`}>
                                  {t.etichetta ?? `T${t.numero}`}
                                  <span className="ml-1 text-indigo-400">({t.posti}p)</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Righe */}
                        <div className="px-4 py-3 space-y-1.5">
                          {o.righe.map(r => (
                            <div key={r.id} className="flex justify-between text-sm">
                              <span className="text-gray-700">{r.quantita}× {r.nome}</span>
                              <span className="text-gray-500 font-medium">€{(r.prezzo * r.quantita).toFixed(2)}</span>
                            </div>
                          ))}
                          {o.note && <p className="text-xs text-gray-400 pt-1 italic">{o.note}</p>}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                          <p className="font-bold text-gray-900">€{o.totale.toFixed(2)}</p>
                          <div className="flex gap-2">
                            <button onClick={() => setConfermaElimina(o.id)}
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                              🗑️
                            </button>
                            {confermaElimina === o.id && (
                              <div className="absolute bottom-14 right-4 z-10 bg-white border border-red-200 rounded-xl shadow-lg p-3 w-52">
                                <p className="text-xs text-gray-700 font-medium mb-2">Annullare questo ordine?</p>
                                <div className="flex gap-2">
                                  <button onClick={() => setConfermaElimina(null)}
                                    className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                                    No
                                  </button>
                                  <button onClick={() => cancellaOrdine(o.id)}
                                    className="flex-1 text-xs py-1.5 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600">
                                    Sì, elimina
                                  </button>
                                </div>
                              </div>
                            )}
                            {cfg.next && (
                              <button onClick={() => avanzaStatus(o.id, cfg.next)}
                                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors">
                                {cfg.nextLabel}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

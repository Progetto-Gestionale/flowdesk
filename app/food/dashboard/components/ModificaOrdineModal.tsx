'use client'

import { useState, useEffect, useRef } from 'react'

export interface RigaOrdine { id: string; nome: string; quantita: number; prezzo: number; note?: string | null }
export interface OrdineModifica {
  id: string; tavolo: string; status: string; totale: number; righe: RigaOrdine[]
}
interface Piatto { id: string; nome: string; prezzo: number }
interface Categoria { id: string; nome: string; piatti: Piatto[] }

const fmt = (n: number) => `€${n.toFixed(2)}`

export function ModificaOrdineModal({ ordine, onClose, onOrdineUpdated }: {
  ordine: OrdineModifica
  onClose: () => void
  onOrdineUpdated?: (righe: RigaOrdine[], totale: number) => void
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

  // Chiamata API in background: non sovrascrive lo stato locale (evita flicker/ordini fuori sequenza
  // con i click rapidi). Lo stato ottimistico è la verità; chi apre il modal ricarica alla chiusura.
  function callApi(method: string, body: object): Promise<any> {
    return fetch(`/api/ordini/${ordine.id}/riga`, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()).catch(() => ({}))
  }

  function propaga(nuove: RigaOrdine[]) {
    const tot = nuove.reduce((s, r) => s + r.prezzo * r.quantita, 0)
    setRighe(nuove)
    setTotale(tot)
    onOrdineUpdated?.(nuove, tot)
  }

  function rimuovi(rigaId: string) {
    if (rigaId.startsWith('tmp-')) return
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
    const tmpId = 'tmp-' + Date.now() + Math.random().toString(36).slice(2)
    const conNuova = [...righe, { id: tmpId, nome: p.nome, prezzo: p.prezzo, quantita: 1 }]
    propaga(conNuova) // compare subito
    const data = await callApi('POST', { piattoId: p.id, nome: p.nome, prezzo: p.prezzo, quantita: 1 })
    const reale = (data?.ordine?.righe as RigaOrdine[] | undefined)?.find(sr => !conNuova.some(r => r.id === sr.id))
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

          {/* Aggiungi dal menu */}
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
                  <div className="flex flex-wrap gap-1.5">
                    {piattiFiltrati.length === 0 && <p className="text-xs text-ink-navy/30">Nessun risultato</p>}
                    {piattiFiltrati.map(p => (
                      <button key={p.id} onClick={() => aggiungi(p)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-electric-blue/8 hover:bg-electric-blue/15 text-electric-blue text-xs font-semibold transition-colors disabled:opacity-50">
                        {p.nome}
                        <span className="text-electric-blue/60">{fmt(p.prezzo)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categorie.map(cat => cat.piatti.length > 0 && (
                      <div key={cat.id}>
                        <p className="text-[10px] font-semibold text-ink-navy/40 uppercase tracking-wider mb-1.5">{cat.nome}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cat.piatti.map(p => (
                            <button key={p.id} onClick={() => aggiungi(p)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-electric-blue/8 hover:bg-electric-blue/15 text-electric-blue text-xs font-semibold transition-colors disabled:opacity-50">
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

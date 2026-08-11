'use client'

import { useEffect, useState } from 'react'
import { IconTrash, IconCheck } from '@/app/components/icons'


export interface Voce {
  id: string
  testo: string
  fatto: boolean
}

/**
 * Lista di cose da fare. `compatta` è la versione da Overview: stessa logica,
 * meno cornice — così le due viste non possono comportarsi in modo diverso.
 */
export default function TodoList({ compatta = false }: { compatta?: boolean }) {
  const [voci, setVoci] = useState<Voce[]>([])
  const [nuova, setNuova] = useState('')
  const [loading, setLoading] = useState(true)

  async function carica() {
    const res = await fetch('/api/care/todo', { credentials: 'include', cache: 'no-store' })
    const d = await res.json()
    setVoci(d.todo ?? [])
    setLoading(false)
  }

  useEffect(() => { carica() }, [])

  async function aggiungi() {
    const testo = nuova.trim()
    if (!testo) return
    setNuova('')
    await fetch('/api/care/todo', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testo }),
    })
    carica()
  }

  async function spunta(v: Voce) {
    // Ottimistico: la spunta deve rispondere subito
    setVoci(prev => prev.map(x => x.id === v.id ? { ...x, fatto: !x.fatto } : x))
    await fetch(`/api/care/todo/${v.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fatto: !v.fatto }),
    })
    carica()
  }

  async function elimina(id: string) {
    setVoci(prev => prev.filter(x => x.id !== id))
    await fetch(`/api/care/todo/${id}`, { method: 'DELETE', credentials: 'include' })
    carica()
  }

  const daFare = voci.filter(v => !v.fatto).length

  return (
    <div>
      {!compatta && (
        <p className="text-sm text-ink-navy/50 mb-4">
          {daFare === 0 ? 'Niente in sospeso' : `${daFare} ${daFare === 1 ? 'cosa da fare' : 'cose da fare'}`}
        </p>
      )}

      <div className="flex gap-2 mb-3">
        <input value={nuova} onChange={e => setNuova(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') aggiungi() }}
          placeholder="Aggiungi una cosa da fare..."
          className="flex-1 border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
        <button onClick={aggiungi} disabled={!nuova.trim()}
          className="bg-electric-blue text-white text-sm font-semibold px-4 rounded-lg hover:bg-electric-blue/90 transition-colors disabled:opacity-40">
          Aggiungi
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-navy/35 py-4 text-center">Caricamento...</p>
      ) : voci.length === 0 ? (
        <p className="text-sm text-ink-navy/35 py-6 text-center">Nessuna voce, per ora</p>
      ) : (
        <div className="space-y-1.5">
          {voci.map(v => (
            <div key={v.id} className="group flex items-center gap-3 bg-mist rounded-lg px-3 py-2.5">
              <button onClick={() => spunta(v)} aria-label={v.fatto ? 'Segna da fare' : 'Segna fatto'}
                className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                  v.fatto ? 'bg-electric-blue border-electric-blue text-white p-0.5' : 'border-ink-navy/25 hover:border-electric-blue'}`}>
                {v.fatto && <IconCheck />}
              </button>
              <span className={`flex-1 text-sm ${v.fatto ? 'text-ink-navy/35 line-through' : 'text-ink-navy'}`}>
                {v.testo}
              </span>
              <button onClick={() => elimina(v.id)} aria-label="Elimina"
                className="w-5 h-5 shrink-0 flex items-center justify-center text-ink-navy/20 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100">
                <span className="w-3 h-3"><IconTrash /></span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

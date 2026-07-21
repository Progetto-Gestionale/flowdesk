'use client'

import { useEffect, useState } from 'react'
import { IconClock, IconPencil, IconTrash, IconCalendar } from '@/app/components/icons'

interface TipoSeduta {
  id: string
  nome: string
  descrizione?: string
  prezzo: number
  durata: number
  attivo: boolean
}

function Modal({ initial, onClose, onSave }: {
  initial?: TipoSeduta | null
  onClose: () => void
  onSave: (data: { nome: string; descrizione: string; prezzo: number; durata: number }) => void
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? '',
    descrizione: initial?.descrizione ?? '',
    prezzo: initial?.prezzo?.toString() ?? '',
    durata: initial?.durata?.toString() ?? '45',
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-ink-navy">{initial ? 'Modifica tipo di seduta' : 'Nuovo tipo di seduta'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome *</label>
            <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
              placeholder="Es. Terapia manuale" autoFocus
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Descrizione</label>
            <textarea value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })} rows={2}
              placeholder="Cosa comprende questa seduta..."
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Prezzo (€)</label>
              <input type="number" value={form.prezzo} onChange={e => setForm({ ...form, prezzo: e.target.value })}
                placeholder="50"
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Durata (min) *</label>
              <input type="number" value={form.durata} onChange={e => setForm({ ...form, durata: e.target.value })}
                placeholder="45"
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
          <button
            onClick={() => onSave({ nome: form.nome, descrizione: form.descrizione, prezzo: parseFloat(form.prezzo) || 0, durata: parseInt(form.durata) || 45 })}
            disabled={!form.nome.trim()}
            className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 disabled:opacity-40">
            Salva
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SedutePage() {
  const [tipi, setTipi] = useState<TipoSeduta[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'new' | TipoSeduta | null>(null)

  async function fetchTipi() {
    const res = await fetch('/api/tipi-seduta', { credentials: 'include', cache: 'no-store' })
    const data = await res.json()
    setTipi(data.tipiSeduta ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchTipi() }, [])

  async function handleSave(form: { nome: string; descrizione: string; prezzo: number; durata: number }) {
    if (modal && modal !== 'new') {
      await fetch(`/api/tipi-seduta/${modal.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    } else {
      await fetch('/api/tipi-seduta', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    }
    setModal(null)
    fetchTipi()
  }

  async function handleToggleAttivo(t: TipoSeduta) {
    await fetch(`/api/tipi-seduta/${t.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attivo: !t.attivo }),
    })
    fetchTipi()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tipi-seduta/${id}`, { method: 'DELETE', credentials: 'include' })
    fetchTipi()
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Sedute</h1>
          <p className="text-ink-navy/50 mt-0.5">Definisci i tipi di seduta che offri: prezzo, durata e descrizione.</p>
        </div>
        <button onClick={() => setModal('new')}
          className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90 transition-colors shrink-0">
          + Nuovo tipo
        </button>
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : tipi.length === 0 ? (
        <div className="bg-white border border-dashed border-ink-navy/15 rounded-xl p-12 text-center text-ink-navy/35">
          <div className="w-11 h-11 rounded-xl bg-mist flex items-center justify-center p-2.5 mx-auto mb-4">
            <IconClock />
          </div>
          <p className="font-medium">Nessun tipo di seduta ancora</p>
          <p className="text-sm mt-1">Aggiungine uno per iniziare a ricevere prenotazioni online</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tipi.map(t => (
            <div key={t.id} className={`bg-white rounded-xl border border-ink-navy/10 shadow-sm p-4 flex items-center justify-between gap-4 ${!t.attivo ? 'opacity-50' : ''}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink-navy">{t.nome}</p>
                  {!t.attivo && <span className="text-xs bg-mist text-ink-navy/50 px-2 py-0.5 rounded-full font-medium">Disattivato</span>}
                </div>
                {t.descrizione && <p className="text-sm text-ink-navy/50 mt-0.5">{t.descrizione}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-navy/40">
                  <span className="flex items-center gap-1"><span className="w-3 h-3"><IconCalendar /></span>{t.durata} min</span>
                  {t.prezzo > 0 && <span className="font-semibold text-electric-blue">€{t.prezzo.toFixed(2)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => handleToggleAttivo(t)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${t.attivo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-mist text-ink-navy/50 hover:bg-ink-navy/10'}`}>
                  {t.attivo ? 'Attivo' : 'Attiva'}
                </button>
                <button onClick={() => setModal(t)}
                  className="w-8 h-8 flex items-center justify-center text-ink-navy/35 hover:text-electric-blue rounded-lg hover:bg-electric-blue/10 transition-colors">
                  <span className="w-3.5 h-3.5"><IconPencil /></span>
                </button>
                <button onClick={() => handleDelete(t.id)}
                  className="w-8 h-8 flex items-center justify-center text-ink-navy/35 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                  <span className="w-3.5 h-3.5"><IconTrash /></span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          initial={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

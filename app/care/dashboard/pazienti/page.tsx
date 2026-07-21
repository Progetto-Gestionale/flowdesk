'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconTrash, IconUndo, IconStethoscope } from '@/app/components/icons'

const COLONNE = [
  { id: 'nuovo', label: 'Nuovo paziente', color: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  { id: 'in_cura', label: 'In cura', color: 'bg-teal-100 text-teal-700', dot: 'bg-teal-500' },
  { id: 'follow_up', label: 'Follow-up', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  { id: 'dimesso', label: 'Dimesso', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
]

interface Paziente {
  id: string
  nome: string
  email?: string
  telefono?: string
  note?: string
  status: string
  cancellato: boolean
  createdAt: string
}

function NuovoPazienteModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: { nome: string; email: string; telefono: string; note: string }) => void
}) {
  const [form, setForm] = useState({ nome: '', email: '', telefono: '', note: '' })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-navy">Nuovo paziente</h2>
          <button onClick={onClose} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome e cognome *</label>
            <input type="text" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
              placeholder="Mario Rossi" autoFocus
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="paziente@email.com"
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Telefono</label>
            <input type="tel" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })}
              placeholder="+39 333 000 0000"
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note cliniche</label>
            <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
              placeholder="Anamnesi, patologie, note generali..." rows={3}
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist transition-colors">
            Annulla
          </button>
          <button onClick={() => onSave(form)} disabled={!form.nome.trim()}
            className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 transition-colors disabled:opacity-40">
            Salva
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PazientiPage() {
  const [pazienti, setPazienti] = useState<Paziente[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [colonnaAperta, setColonnaAperta] = useState<string | null>(null)
  const [cancellatiEspansi, setCancellatiEspansi] = useState(false)
  const [confermaElimina, setConfermaElimina] = useState<Paziente | null>(null)

  async function fetchPazienti() {
    const res = await fetch('/api/pazienti?include_cancellati=true', { cache: 'no-store', credentials: 'include' })
    const data = await res.json()
    setPazienti(data.pazienti ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchPazienti()
    const interval = setInterval(fetchPazienti, 15000)
    return () => clearInterval(interval)
  }, [])

  async function handleAdd(form: { nome: string; email: string; telefono: string; note: string }) {
    try {
      await fetch('/api/pazienti', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      await fetchPazienti()
    } finally {
      setShowModal(false)
    }
  }

  async function handleElimina(id: string) {
    await fetch(`/api/pazienti/${id}/elimina`, { method: 'DELETE', credentials: 'include' })
    setConfermaElimina(null)
    await fetchPazienti()
  }

  async function handleRipristina(id: string) {
    await fetch(`/api/pazienti/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancellato: false }),
    })
    await fetchPazienti()
  }

  const perColonna = (status: string) => pazienti.filter(p => p.status === status && !p.cancellato)
  const cancellati = pazienti.filter(p => p.cancellato)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Pazienti</h1>
          <p className="text-ink-navy/50 mt-0.5">{pazienti.filter(p => !p.cancellato).length} pazienti totali</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90 transition-colors">
          + Nuovo paziente
        </button>
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {COLONNE.map((col) => {
              const lista = perColonna(col.id)
              const visibili = lista.slice(0, 3)
              const nascosti = lista.length - 3
              return (
                <div key={col.id} className="bg-mist rounded-xl p-3 min-h-48">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink-navy">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${col.dot}`} />
                      {col.label}
                    </span>
                    <span className="font-mono text-xs text-ink-navy/35">{lista.length}</span>
                  </div>
                  <div className="space-y-2">
                    {visibili.map((p) => (
                      <Link key={p.id} href={`/care/dashboard/pazienti/${p.id}`}
                        className="block bg-white rounded-lg p-3 shadow-sm border border-ink-navy/8 hover:shadow-md transition-shadow">
                        <p className="text-sm font-semibold text-ink-navy">{p.nome}</p>
                        {p.email && <p className="text-xs text-ink-navy/50 mt-0.5">{p.email}</p>}
                        {p.telefono && <p className="text-xs text-ink-navy/35">{p.telefono}</p>}
                      </Link>
                    ))}
                    {nascosti > 0 && (
                      <button onClick={() => setColonnaAperta(col.id)}
                        className="w-full text-xs text-electric-blue font-semibold border border-electric-blue/25 rounded-lg p-2 hover:bg-electric-blue/10 transition-colors bg-white">
                        + altri {nascosti}
                      </button>
                    )}
                    <button onClick={() => setShowModal(true)}
                      className="w-full text-xs text-ink-navy/35 border border-dashed border-ink-navy/15 rounded-lg p-2 hover:border-electric-blue hover:text-electric-blue transition-colors bg-white">
                      + Aggiungi
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {cancellati.length > 0 && (
            <button onClick={() => setCancellatiEspansi(true)}
              className="w-full bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-red-100 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">Cancellati</span>
                <span className="bg-red-100 text-red-500 text-xs font-bold px-2 py-0.5 rounded-full">{cancellati.length}</span>
              </div>
              <span className="text-xs text-red-400">Vedi tutti →</span>
            </button>
          )}
        </div>
      )}

      {/* Pannello completo colonna */}
      {colonnaAperta && (() => {
        const col = COLONNE.find(c => c.id === colonnaAperta)!
        const lista = perColonna(colonnaAperta)
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden" style={{ maxHeight: '80vh' }}>
              <div className="px-5 py-4 border-b border-ink-navy/8 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${col.color}`}>{col.label}</span>
                  <span className="text-sm text-ink-navy/35">{lista.length} pazienti</span>
                </div>
                <button onClick={() => setColonnaAperta(null)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-2">
                {lista.map(p => (
                  <Link key={p.id} href={`/care/dashboard/pazienti/${p.id}`}
                    className="bg-mist hover:bg-electric-blue/10 border border-ink-navy/8 rounded-xl px-4 py-3 flex items-center justify-between transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-ink-navy">{p.nome}</p>
                      {p.email && <p className="text-xs text-ink-navy/50 mt-0.5">{p.email}</p>}
                    </div>
                    <span className="text-ink-navy/25 text-sm">›</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Pannello cancellati */}
      {cancellatiEspansi && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden" style={{ maxHeight: '80vh' }}>
            <div className="px-5 py-4 border-b border-ink-navy/8 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-500">Cancellati</span>
                <span className="text-sm text-ink-navy/35">{cancellati.length} pazienti</span>
              </div>
              <button onClick={() => setCancellatiEspansi(false)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {cancellati.map(p => (
                <div key={p.id} className="bg-mist border border-ink-navy/8 rounded-xl px-4 py-3 flex items-center justify-between group">
                  <div>
                    <p className="text-sm font-semibold text-ink-navy/40 line-through">{p.nome}</p>
                    {p.email && <p className="text-xs text-ink-navy/35">{p.email}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleRipristina(p.id)}
                      className="w-7 h-7 flex items-center justify-center text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Ripristina">
                      <span className="w-3.5 h-3.5"><IconUndo /></span>
                    </button>
                    <button onClick={() => { setCancellatiEspansi(false); setConfermaElimina(p) }}
                      className="w-7 h-7 flex items-center justify-center text-ink-navy/30 hover:text-red-400 transition-colors" title="Elimina definitivamente">
                      <span className="w-3.5 h-3.5"><IconTrash /></span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal conferma eliminazione */}
      {confermaElimina && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center p-3 mx-auto mb-4">
                <IconTrash />
              </div>
              <h3 className="text-lg font-bold text-ink-navy">Elimina definitivamente</h3>
              <p className="text-sm text-ink-navy/50 mt-1">
                Stai per eliminare <span className="font-semibold text-ink-navy/70">{confermaElimina.nome}</span> e tutta la sua cartella clinica in modo permanente. Questa azione non è reversibile.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfermaElimina(null)}
                className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist transition-colors">
                Annulla
              </button>
              <button onClick={() => handleElimina(confermaElimina.id)}
                className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-lg hover:bg-red-600 transition-colors">
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && <NuovoPazienteModal onClose={() => setShowModal(false)} onSave={handleAdd} />}

      {!loading && pazienti.length === 0 && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
          <div className="pointer-events-auto bg-white border border-dashed border-ink-navy/15 rounded-2xl p-10 text-center max-w-sm shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-2.5 mx-auto mb-4">
              <IconStethoscope />
            </div>
            <p className="font-medium text-ink-navy">Nessun paziente ancora</p>
            <p className="text-sm text-ink-navy/50 mt-1">Aggiungi il primo paziente per iniziare</p>
          </div>
        </div>
      )}
    </div>
  )
}

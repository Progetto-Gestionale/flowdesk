'use client'

import { useEffect, useState } from 'react'
import { IconTrash, IconPencil, IconUndo } from '@/app/components/icons'

const COLONNE = [
  { id: 'nuovo', label: 'Nuovo paziente', color: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  { id: 'contattato', label: 'In cura', color: 'bg-teal-100 text-teal-700', dot: 'bg-teal-500' },
  { id: 'proposta', label: 'Follow-up', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  { id: 'chiuso', label: 'Dimesso', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
]

interface Paziente {
  id: string
  name: string
  email?: string
  phone?: string
  notes?: string
  status: string
  cancellato: boolean
  createdAt: string
}

function NuovoPazienteModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: { name: string; email: string; phone: string; notes: string }) => void
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })

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
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
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
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="+39 333 000 0000"
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note cliniche</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Patologie, allergie, note generali..." rows={3}
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist transition-colors">
            Annulla
          </button>
          <button onClick={() => onSave(form)} disabled={!form.name.trim()}
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
  const [selected, setSelected] = useState<Paziente | null>(null)
  const [confermaElimina, setConfermaElimina] = useState<Paziente | null>(null)
  const [colonnaAperta, setColonnaAperta] = useState<string | null>(null)
  const [cancellatiEspansi, setCancellatiEspansi] = useState(false)
  const [confermaEliminaTutti, setConfermaEliminaTutti] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', notes: '' })

  async function fetchPazienti() {
    const res = await fetch('/api/leads?include_cancellati=true', { cache: 'no-store', credentials: 'include' })
    const data = await res.json()
    setPazienti(data.leads ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchPazienti()
    const interval = setInterval(fetchPazienti, 30000)
    return () => clearInterval(interval)
  }, [])

  async function handleAdd(form: { name: string; email: string; phone: string; notes: string }) {
    await fetch('/api/leads', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    await fetchPazienti()
    setShowModal(false)
  }

  async function handleStatusChange(paziente: Paziente, newStatus: string) {
    setPazienti(prev => prev.map(p => p.id === paziente.id ? { ...p, status: newStatus } : p))
    await fetch(`/api/leads/${paziente.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  async function handleEdit(id: string) {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    await fetchPazienti()
    setSelected({ ...selected!, ...editForm })
    setEditing(false)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/leads/${id}`, { method: 'DELETE', credentials: 'include' })
    setSelected(null)
    await fetchPazienti()
  }

  const perColonna = (status: string) => pazienti.filter(p => p.status === status && !p.cancellato)
  const cancellati = pazienti.filter(p => p.cancellato)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Pazienti</h1>
          <p className="text-ink-navy/50 mt-0.5">{pazienti.filter(p => !p.cancellato).length} pazienti attivi</p>
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
            {COLONNE.map(col => {
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
                    {visibili.map(p => (
                      <div key={p.id} onClick={() => setSelected(p)}
                        className="bg-white rounded-lg p-3 shadow-sm border border-ink-navy/8 cursor-pointer hover:shadow-md transition-shadow">
                        <p className="text-sm font-semibold text-ink-navy">{p.name}</p>
                        {p.email && <p className="text-xs text-ink-navy/50 mt-0.5">{p.email}</p>}
                        {p.phone && <p className="text-xs text-ink-navy/35">{p.phone}</p>}
                      </div>
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
                <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">✕ Archiviati</span>
                <span className="bg-red-100 text-red-500 text-xs font-bold px-2 py-0.5 rounded-full">{cancellati.length}</span>
              </div>
              <span className="text-xs text-red-400">Vedi tutti →</span>
            </button>
          )}
        </div>
      )}

      {/* Pannello colonna espansa */}
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
                  <div key={p.id} onClick={() => { setColonnaAperta(null); setSelected(p) }}
                    className="bg-mist hover:bg-electric-blue/10 border border-ink-navy/8 hover:border-electric-blue/25 rounded-xl px-4 py-3 cursor-pointer transition-colors flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink-navy">{p.name}</p>
                      {p.email && <p className="text-xs text-ink-navy/50 mt-0.5">{p.email}</p>}
                      {p.phone && <p className="text-xs text-ink-navy/35">{p.phone}</p>}
                    </div>
                    <span className="text-ink-navy/25 text-sm">›</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Pannello archiviati */}
      {cancellatiEspansi && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden" style={{ maxHeight: '80vh' }}>
            <div className="px-5 py-4 border-b border-ink-navy/8 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-500">✕ Archiviati</span>
                <span className="text-sm text-ink-navy/35">{cancellati.length} pazienti</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setConfermaEliminaTutti(true)}
                  className="text-xs text-red-400 font-medium hover:text-red-600 transition-colors">
                  Elimina tutti
                </button>
                <button onClick={() => setCancellatiEspansi(false)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {cancellati.map(p => (
                <div key={p.id} className="bg-mist border border-ink-navy/8 rounded-xl px-4 py-3 flex items-center justify-between group">
                  <div onClick={() => { setCancellatiEspansi(false); setSelected(p) }} className="cursor-pointer flex-1">
                    <p className="text-sm font-semibold text-ink-navy/35 line-through">{p.name}</p>
                    {p.email && <p className="text-xs text-ink-navy/35">{p.email}</p>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); setCancellatiEspansi(false); setConfermaElimina(p) }}
                    className="opacity-0 group-hover:opacity-100 w-3.5 h-3.5 text-ink-navy/25 hover:text-red-400 transition-all">
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal conferma elimina tutti gli archiviati */}
      {confermaEliminaTutti && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center p-3 mx-auto mb-4">
                <IconTrash />
              </div>
              <h3 className="text-lg font-bold text-ink-navy">Elimina tutti gli archiviati</h3>
              <p className="text-sm text-ink-navy/50 mt-1">
                Stai per eliminare definitivamente <span className="font-semibold text-ink-navy/70">{cancellati.length} pazienti</span>. L&apos;operazione non è reversibile.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfermaEliminaTutti(false)}
                className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist transition-colors">
                Annulla
              </button>
              <button onClick={async () => {
                setConfermaEliminaTutti(false)
                setCancellatiEspansi(false)
                await Promise.all(cancellati.map(p =>
                  fetch(`/api/leads/${p.id}/elimina`, { method: 'DELETE', credentials: 'include' })
                ))
                await fetchPazienti()
              }} className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-lg hover:bg-red-600 transition-colors">
                Elimina tutti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal conferma eliminazione definitiva */}
      {confermaElimina && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center p-3 mx-auto mb-4">
                <IconTrash />
              </div>
              <h3 className="text-lg font-bold text-ink-navy">Elimina definitivamente</h3>
              <p className="text-sm text-ink-navy/50 mt-1">
                Stai per eliminare <span className="font-semibold text-ink-navy/70">{confermaElimina.name}</span> in modo permanente.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfermaElimina(null)}
                className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist transition-colors">
                Annulla
              </button>
              <button onClick={async () => {
                const id = confermaElimina.id
                setConfermaElimina(null)
                if (selected?.id === id) setSelected(null)
                await fetch(`/api/leads/${id}/elimina`, { method: 'DELETE', credentials: 'include' })
                await fetchPazienti()
              }} className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-lg hover:bg-red-600 transition-colors">
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuovo paziente */}
      {showModal && <NuovoPazienteModal onClose={() => setShowModal(false)} onSave={handleAdd} />}

      {/* Pannello dettaglio paziente */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
            <div className="px-5 py-4 border-b border-ink-navy/10 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink-navy">{selected.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${selected.cancellato ? 'bg-red-100 text-red-500' : COLONNE.find(c => c.id === selected.status)?.color ?? 'bg-mist text-ink-navy/60'}`}>
                  {selected.cancellato ? '✕ Archiviato' : COLONNE.find(c => c.id === selected.status)?.label ?? selected.status}
                </span>
              </div>
              <button onClick={() => { setSelected(null); setEditing(false) }} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl mt-1">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {editing ? (
                <div className="space-y-3">
                  {(['name', 'email', 'phone'] as const).map(f => (
                    <div key={f}>
                      <label className="block text-xs font-medium text-ink-navy/50 mb-1">
                        {f === 'name' ? 'Nome' : f === 'email' ? 'Email' : 'Telefono'}
                      </label>
                      <input value={editForm[f]} onChange={e => setEditForm({ ...editForm, [f]: e.target.value })}
                        className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-ink-navy/50 mb-1">Note cliniche</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={3} className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(false)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 text-sm font-semibold py-2 rounded-lg hover:bg-mist">Annulla</button>
                    <button onClick={() => handleEdit(selected.id)} className="flex-1 bg-electric-blue text-white text-sm font-semibold py-2 rounded-lg hover:bg-electric-blue/90">Salva</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5 text-sm">
                    {selected.email && (
                      <p className="flex items-center gap-2">
                        <span className="text-ink-navy/35 w-20 shrink-0">Email</span>
                        <span className="text-ink-navy font-medium">{selected.email}</span>
                      </p>
                    )}
                    {selected.phone && (
                      <p className="flex items-center gap-2">
                        <span className="text-ink-navy/35 w-20 shrink-0">Telefono</span>
                        <span className="text-ink-navy font-medium">{selected.phone}</span>
                      </p>
                    )}
                    <p className="flex items-center gap-2">
                      <span className="text-ink-navy/35 w-20 shrink-0">Aggiunto</span>
                      <span className="text-ink-navy/60">{new Date(selected.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </p>
                    {selected.notes && (
                      <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 mt-2">
                        <p className="text-xs font-semibold text-teal-600 mb-1">Note cliniche</p>
                        <p className="text-sm text-ink-navy/70">{selected.notes}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">Sposta in</p>
                    <div className="flex flex-wrap gap-2">
                      {COLONNE.map(col => (
                        <button key={col.id}
                          onClick={() => { handleStatusChange(selected, col.id); setSelected(null) }}
                          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${selected.status === col.id ? col.color : 'bg-mist text-ink-navy/60 hover:bg-ink-navy/10'}`}>
                          {col.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {!editing && (
              <div className="px-5 py-3 border-t border-ink-navy/8 flex gap-2">
                <button onClick={() => { setEditForm({ name: selected.name, email: selected.email ?? '', phone: selected.phone ?? '', notes: selected.notes ?? '' }); setEditing(true) }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm text-electric-blue font-medium py-2 border border-electric-blue/25 rounded-lg hover:bg-electric-blue/10 transition-colors">
                  <span className="w-3.5 h-3.5"><IconPencil /></span>
                  Modifica
                </button>
                {selected.cancellato ? (
                  <>
                    <button onClick={async () => {
                      await fetch(`/api/leads/${selected.id}`, {
                        method: 'PATCH', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cancellato: false }),
                      })
                      setSelected(null)
                      await fetchPazienti()
                    }} className="flex-1 flex items-center justify-center gap-1.5 text-sm text-green-600 font-medium py-2 border border-green-200 rounded-lg hover:bg-green-50 transition-colors">
                      <span className="w-3.5 h-3.5"><IconUndo /></span>
                      Ripristina
                    </button>
                    <button onClick={() => setConfermaElimina(selected)}
                      className="w-8 flex items-center justify-center text-ink-navy/35 py-2 px-3 border border-ink-navy/10 rounded-lg hover:bg-mist transition-colors">
                      <span className="w-3.5 h-3.5"><IconTrash /></span>
                    </button>
                  </>
                ) : (
                  <button onClick={() => handleDelete(selected.id)}
                    className="flex-1 text-sm text-red-500 font-medium py-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                    ✕ Archivia
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useMemo } from 'react'
import { IconTrash, IconPencil, IconUndo } from '../../../components/icons'

interface Cliente {
  id: string
  name: string
  email?: string
  phone?: string
  notes?: string
  status: string
  cancellato: boolean
  createdAt: string
}

interface Storico {
  totaleRichieste: number
  richiesteAccettate: number
  spesaTotale: number
  totaleAppuntamenti: number
  ultimaVisita: string | null
  noShow: number
}

interface Richiesta {
  id: string
  numero: number
  tipo: string
  status: string
  note?: string
  items?: string
  createdAt: string
}

function NuovoClienteModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: { name: string; email: string; phone: string; notes: string }) => void
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-navy">Nuovo cliente</h2>
          <button onClick={onClose} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          {[
            { key: 'name', label: 'Nome e cognome *', type: 'text', placeholder: 'Mario Rossi' },
            { key: 'email', label: 'Email', type: 'email', placeholder: 'cliente@email.com' },
            { key: 'phone', label: 'Telefono', type: 'tel', placeholder: '+39 333 000 0000' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">{f.label}</label>
              <input type={f.type} value={form[f.key as keyof typeof form]}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder} autoFocus={f.key === 'name'}
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Preferenze, allergie, note generali..." rows={2}
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist transition-colors">Annulla</button>
          <button onClick={() => onSave(form)} disabled={!form.name.trim()}
            className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 transition-colors disabled:opacity-40">
            Salva
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RubricaPage() {
  const [clienti, setClienti] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<'tutti' | 'attivi' | 'archiviati'>('attivi')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<Cliente | null>(null)
  const [storico, setStorico] = useState<Storico | null>(null)
  const [richieste, setRichieste] = useState<Richiesta[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [confermaElimina, setConfermaElimina] = useState<Cliente | null>(null)

  async function fetchClienti() {
    const res = await fetch('/api/leads?include_cancellati=true', { cache: 'no-store', credentials: 'include' })
    const data = await res.json()
    setClienti(data.leads ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchClienti()
  }, [])

  async function openCliente(c: Cliente) {
    setSelected(c)
    setEditing(false)
    setStorico(null)
    setRichieste([])
    setLoadingDetail(true)
    try {
      const [resS, resR] = await Promise.all([
        fetch(`/api/leads/${c.id}/storico`, { credentials: 'include', cache: 'no-store' }),
        c.email
          ? fetch(`/api/preventivi?leadId=${c.id}`, { credentials: 'include', cache: 'no-store' })
          : Promise.resolve(null),
      ])
      const dataS = await resS.json()
      setStorico(dataS)
      if (resR) {
        const dataR = await resR.json()
        setRichieste(dataR.preventivi ?? [])
      }
    } catch { /* noop */ }
    setLoadingDetail(false)
  }

  async function handleAdd(form: { name: string; email: string; phone: string; notes: string }) {
    await fetch('/api/leads', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    await fetchClienti()
    setShowModal(false)
  }

  async function handleEdit(id: string) {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    await fetchClienti()
    setSelected({ ...selected!, ...editForm })
    setEditing(false)
  }

  async function handleArchivia(id: string) {
    await fetch(`/api/leads/${id}`, { method: 'DELETE', credentials: 'include' })
    setSelected(null)
    await fetchClienti()
  }

  async function handleRipristina(id: string) {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancellato: false }),
    })
    setSelected(null)
    await fetchClienti()
  }

  const lista = useMemo(() => {
    return clienti
      .filter(c => filtro === 'tutti' ? true : filtro === 'attivi' ? !c.cancellato : c.cancellato)
      .filter(c => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q)
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [clienti, filtro, search])

  const totAttivi = clienti.filter(c => !c.cancellato).length

  const TIPO_LABEL: Record<string, string> = {
    tavolo: 'Tavolo', ordine: 'Ordine / Asporto', delivery: 'Delivery', servizio: 'Servizio',
  }
  const TIPO_COLOR: Record<string, string> = {
    tavolo: 'bg-orange-100 text-orange-700', ordine: 'bg-amber-100 text-amber-700',
    delivery: 'bg-teal-100 text-teal-700', servizio: 'bg-sky-100 text-sky-700',
  }
  const STATUS_COLOR: Record<string, string> = {
    accettato: 'text-emerald-600', da_verificare: 'text-amber-500',
    rifiutato: 'text-red-400', completato: 'text-ink-navy/40',
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Clienti</h1>
          <p className="text-ink-navy/50 mt-0.5">{totAttivi} clienti in rubrica</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90 transition-colors">
          + Nuovo cliente
        </button>
      </div>

      {/* Barra ricerca + filtro */}
      <div className="flex gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, email o telefono..."
          className="flex-1 border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
        <div className="flex rounded-lg border border-ink-navy/15 overflow-hidden text-sm font-medium">
          {(['attivi', 'archiviati', 'tutti'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-2 capitalize transition-colors ${filtro === f ? 'bg-ink-navy text-white' : 'text-ink-navy/50 hover:bg-mist'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Lista clienti */}
      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : lista.length === 0 ? (
        <div className="text-center text-ink-navy/35 py-12">
          {search ? 'Nessun cliente trovato.' : 'Nessun cliente ancora.'}
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(c => (
            <button key={c.id} onClick={() => openCliente(c)}
              className={`w-full text-left bg-white border rounded-xl px-4 py-3 flex items-center gap-4 hover:shadow-md transition-shadow ${c.cancellato ? 'border-red-100 opacity-60' : 'border-ink-navy/8'}`}>
              <div className="w-9 h-9 rounded-full bg-electric-blue/10 text-electric-blue font-bold flex items-center justify-center text-sm shrink-0">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold text-ink-navy ${c.cancellato ? 'line-through' : ''}`}>{c.name}</p>
                <p className="text-xs text-ink-navy/45 truncate">{[c.email, c.phone].filter(Boolean).join(' · ') || 'Nessun contatto'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-ink-navy/30">
                  {new Date(c.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modals */}
      {showModal && <NuovoClienteModal onClose={() => setShowModal(false)} onSave={handleAdd} />}

      {/* Modal conferma elimina definitiva */}
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
                className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
              <button onClick={async () => {
                const id = confermaElimina.id
                setConfermaElimina(null)
                setSelected(null)
                await fetch(`/api/leads/${id}/elimina`, { method: 'DELETE', credentials: 'include' })
                await fetchClienti()
              }} className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-lg hover:bg-red-600">Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* Pannello dettaglio cliente */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
            <div className="px-5 py-4 border-b border-ink-navy/10 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-electric-blue/10 text-electric-blue font-bold flex items-center justify-center text-base shrink-0">
                  {selected.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-base font-bold text-ink-navy">{selected.name}</h2>
                  {selected.cancellato && (
                    <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-medium">Archiviato</span>
                  )}
                </div>
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
                    <label className="block text-xs font-medium text-ink-navy/50 mb-1">Note</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={2} className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(false)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 text-sm font-semibold py-2 rounded-lg hover:bg-mist">Annulla</button>
                    <button onClick={() => handleEdit(selected.id)} className="flex-1 bg-electric-blue text-white text-sm font-semibold py-2 rounded-lg hover:bg-electric-blue/90">Salva</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Contatti */}
                  <div className="space-y-1.5 text-sm">
                    {selected.email && (
                      <p className="flex gap-2"><span className="text-ink-navy/35 w-20 shrink-0">Email</span><span className="text-ink-navy font-medium">{selected.email}</span></p>
                    )}
                    {selected.phone && (
                      <p className="flex gap-2"><span className="text-ink-navy/35 w-20 shrink-0">Telefono</span><span className="text-ink-navy font-medium">{selected.phone}</span></p>
                    )}
                    <p className="flex gap-2"><span className="text-ink-navy/35 w-20 shrink-0">Cliente dal</span><span className="text-ink-navy/60">{new Date(selected.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span></p>
                    {selected.notes && (
                      <div className="bg-mist rounded-lg px-3 py-2 mt-1">
                        <p className="text-xs text-ink-navy/70">{selected.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Storico */}
                  {loadingDetail ? (
                    <p className="text-xs text-ink-navy/30 text-center py-4">Caricamento storico...</p>
                  ) : storico ? (
                    <div>
                      <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-3">Storico</p>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="bg-mist rounded-xl p-3 text-center">
                          <p className="text-xl font-bold text-ink-navy">{storico.totaleRichieste}</p>
                          <p className="text-xs text-ink-navy/45 mt-0.5">Richieste</p>
                        </div>
                        <div className="bg-mist rounded-xl p-3 text-center">
                          <p className="text-xl font-bold text-ink-navy">
                            {storico.spesaTotale > 0 ? `€${storico.spesaTotale.toFixed(0)}` : '—'}
                          </p>
                          <p className="text-xs text-ink-navy/45 mt-0.5">Spesa totale</p>
                        </div>
                        <div className="bg-mist rounded-xl p-3 text-center">
                          <p className="text-xl font-bold text-ink-navy">{storico.noShow > 0 ? storico.noShow : '—'}</p>
                          <p className="text-xs text-ink-navy/45 mt-0.5">No-show</p>
                        </div>
                      </div>
                      {storico.ultimaVisita && (
                        <p className="text-xs text-ink-navy/40">
                          Ultima visita: <span className="font-medium text-ink-navy/60">{new Date(storico.ultimaVisita).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </p>
                      )}
                    </div>
                  ) : null}

                  {/* Richieste recenti */}
                  {richieste.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">Richieste recenti</p>
                      <div className="space-y-2">
                        {richieste.slice(0, 5).map(r => (
                          <div key={r.id} className="flex items-center justify-between bg-mist rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLOR[r.tipo] ?? 'bg-mist text-ink-navy/60'}`}>
                                {TIPO_LABEL[r.tipo] ?? r.tipo}
                              </span>
                              <span className="text-xs text-ink-navy/40">#{r.numero}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${STATUS_COLOR[r.status] ?? 'text-ink-navy/40'}`}>
                                {r.status.replace(/_/g, ' ')}
                              </span>
                              <span className="text-xs text-ink-navy/30">
                                {new Date(r.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                    <button onClick={() => handleRipristina(selected.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm text-green-600 font-medium py-2 border border-green-200 rounded-lg hover:bg-green-50 transition-colors">
                      <span className="w-3.5 h-3.5"><IconUndo /></span>
                      Ripristina
                    </button>
                    <button onClick={() => setConfermaElimina(selected)}
                      className="px-3 flex items-center justify-center text-ink-navy/35 py-2 border border-ink-navy/10 rounded-lg hover:bg-mist transition-colors">
                      <span className="w-3.5 h-3.5"><IconTrash /></span>
                    </button>
                  </>
                ) : (
                  <button onClick={() => handleArchivia(selected.id)}
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

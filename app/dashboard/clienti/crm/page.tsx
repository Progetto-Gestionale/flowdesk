'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const COLONNE = [
  { id: 'nuovo', label: '🆕 Nuovo contatto', color: 'bg-sky-100 text-sky-700' },
  { id: 'contattato', label: '💬 In trattativa', color: 'bg-amber-100 text-amber-700' },
  { id: 'proposta', label: '📄 Offerta inviata', color: 'bg-violet-100 text-violet-700' },
  { id: 'chiuso', label: '✅ Cliente acquisito', color: 'bg-emerald-100 text-emerald-700' },
]

interface Lead {
  id: string
  name: string
  email?: string
  phone?: string
  notes?: string
  status: string
  cancellato: boolean
  createdAt: string
}

interface Preventivo {
  id: string
  titolo?: string
  numero: number
  tipo: string
  importo?: number
  totale?: number
  status: string
  note?: string
  items?: string
  messaggioProposta?: string
  createdAt: string
}

interface Conversazione {
  id: string
  updatedAt: string
}

interface ModalProps {
  onClose: () => void
  onSave: (data: { name: string; email: string; phone: string; notes: string }) => void
}

function NuovoLeadModal({ onClose, onSave }: ModalProps) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Nuovo contatto</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome e cognome"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@esempio.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+39 333 000 0000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Informazioni aggiuntive..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.name.trim()}
            className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CRM() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [confermaElimina, setConfermaElimina] = useState<Lead | null>(null)
  const [colonnaAperta, setColonnaAperta] = useState<string | null>(null)
  const [preventivoAperto, setPreventivoAperto] = useState<Preventivo | null>(null)
  const [cancellatiEspansi, setCancellatiEspansi] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [leadPreventivi, setLeadPreventivi] = useState<Preventivo[]>([])
  const [leadConversazioni, setLeadConversazioni] = useState<Conversazione[]>([])
  const [leadStorico, setLeadStorico] = useState<{
    totaleRichieste: number; richiesteAccettate: number; spesaTotale: number
    totaleAppuntamenti: number; ultimaVisita: string | null; noShow: number
  } | null>(null)
  const [loadingRelated, setLoadingRelated] = useState(false)

  async function fetchLeadRelated(lead: Lead) {
    setLoadingRelated(true)
    setLeadStorico(null)
    const [prevRes, convRes, storRes] = await Promise.all([
      fetch(`/api/preventivi?leadId=${lead.id}`, { credentials: 'include', cache: 'no-store' }),
      fetch(`/api/conversazioni?email=${encodeURIComponent(lead.email ?? '')}`, { credentials: 'include', cache: 'no-store' }),
      fetch(`/api/leads/${lead.id}/storico`, { credentials: 'include', cache: 'no-store' }),
    ])
    const prevData = await prevRes.json()
    const convData = await convRes.json()
    const storData = await storRes.json()
    setLeadPreventivi(prevData.preventivi ?? [])
    setLeadConversazioni(convData.conversazioni ?? [])
    setLeadStorico(storData)
    setLoadingRelated(false)
  }

  async function fetchLeads() {
    const res = await fetch('/api/leads?include_cancellati=true', { cache: 'no-store', credentials: 'include' })
    const data = await res.json()
    setLeads(data.leads ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchLeads()
    const interval = setInterval(fetchLeads, 15000)
    return () => clearInterval(interval)
  }, [])

  async function handleAddLead(form: { name: string; email: string; phone: string; notes: string }) {
    try {
      await fetch('/api/leads', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      await fetchLeads()
    } catch (e) {
      console.error('Errore salvataggio contatto:', e)
    } finally {
      setShowModal(false)
    }
  }

  async function handleStatusChange(lead: Lead, newStatus: string) {
    setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, status: newStatus } : l))
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  async function handleDelete(id: string) {
    await fetch(`/api/leads/${id}`, { method: 'DELETE', credentials: 'include' })
    setSelectedLead(null)
    await fetchLeads()
  }

  async function handleEdit(id: string) {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    await fetchLeads()
    setSelectedLead({ ...selectedLead!, ...editForm })
    setEditing(false)
  }

  const leadsPerColonna = (status: string) => leads.filter((l) => l.status === status && !l.cancellato)
  const leadsCancellati = leads.filter((l) => l.cancellato)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contatti & Pipeline</h1>
          <p className="text-gray-500 mt-0.5">{leads.length} contatti totali</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + Nuovo contatto
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Caricamento...</div>
      ) : (
        <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {COLONNE.map((col) => {
            const colLeads = leadsPerColonna(col.id)
            const visibili = colLeads.slice(0, 3)
            const nascosti = colLeads.length - 3
            return (
              <div key={col.id} className="bg-gray-100 rounded-xl p-3 min-h-48">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${col.color}`}>
                    {col.label}
                  </span>
                  <span className="text-xs text-gray-400">{colLeads.length}</span>
                </div>
                <div className="space-y-2">
                  {visibili.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => { setSelectedLead(lead); fetchLeadRelated(lead) }}
                      className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
                      {lead.email && <p className="text-xs text-gray-500 mt-0.5">{lead.email}</p>}
                      {lead.phone && <p className="text-xs text-gray-400">{lead.phone}</p>}
                    </div>
                  ))}
                  {nascosti > 0 && (
                    <button
                      onClick={() => setColonnaAperta(col.id)}
                      className="w-full text-xs text-indigo-500 font-semibold border border-indigo-200 rounded-lg p-2 hover:bg-indigo-50 transition-colors bg-white">
                      + altri {nascosti}
                    </button>
                  )}
                  <button
                    onClick={() => setShowModal(true)}
                    className="w-full text-xs text-gray-400 border border-dashed border-gray-300 rounded-lg p-2 hover:border-indigo-400 hover:text-indigo-500 transition-colors bg-white"
                  >
                    + Aggiungi
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Box cancellati/rifiutati */}
        {leadsCancellati.length > 0 && (
          <button
            onClick={() => setCancellatiEspansi(true)}
            className="w-full bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-red-100 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">✕ Cancellati / Rifiutati</span>
              <span className="bg-red-100 text-red-500 text-xs font-bold px-2 py-0.5 rounded-full">{leadsCancellati.length}</span>
            </div>
            <span className="text-xs text-red-400">Vedi tutti →</span>
          </button>
        )}
        </div>
      )}

      {/* Pannello completo colonna */}
      {colonnaAperta && (() => {
        const col = COLONNE.find(c => c.id === colonnaAperta)!
        const colLeads = leadsPerColonna(colonnaAperta)
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden" style={{ maxHeight: '80vh' }}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${col.color}`}>{col.label}</span>
                  <span className="text-sm text-gray-400">{colLeads.length} contatti</span>
                </div>
                <button onClick={() => setColonnaAperta(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-2">
                {colLeads.map(lead => (
                  <div key={lead.id}
                    onClick={() => { setColonnaAperta(null); setSelectedLead(lead); fetchLeadRelated(lead) }}
                    className="bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 rounded-xl px-4 py-3 cursor-pointer transition-colors flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
                      {lead.email && <p className="text-xs text-gray-500 mt-0.5">{lead.email}</p>}
                      {lead.phone && <p className="text-xs text-gray-400">{lead.phone}</p>}
                    </div>
                    <span className="text-gray-300 text-sm">›</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Pannello completo cancellati */}
      {cancellatiEspansi && (() => {
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden" style={{ maxHeight: '80vh' }}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-500">✕ Cancellati / Rifiutati</span>
                  <span className="text-sm text-gray-400">{leadsCancellati.length} contatti</span>
                </div>
                <button onClick={() => setCancellatiEspansi(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-2">
                {leadsCancellati.map(lead => (
                  <div key={lead.id}
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between group">
                    <div onClick={() => { setCancellatiEspansi(false); setSelectedLead(lead); fetchLeadRelated(lead) }} className="cursor-pointer flex-1">
                      <p className="text-sm font-semibold text-gray-400 line-through">{lead.name}</p>
                      {lead.email && <p className="text-xs text-gray-400">{lead.email}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-red-50 text-red-400 font-semibold px-2 py-0.5 rounded-full">
                        {COLONNE.find(c => c.id === lead.status)?.label.replace(/^[^\s]+ /, '') ?? lead.status}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setCancellatiEspansi(false); setConfermaElimina(lead) }}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                        title="Elimina definitivamente">
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal dettaglio preventivo */}
      {preventivoAperto && (() => {
        const p = preventivoAperto
        const note = p.note ?? ''
        const dataISO = note.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)?.[1]
        const oraISO = note.match(/ORA_ISO:(\d{2}:\d{2})/)?.[1]
        const dataApp = dataISO ? new Date(dataISO) : null
        const scaduto = dataApp && dataApp < new Date() && (p.status === 'accettato' || p.status === 'completato')
        const items = (() => { try { return JSON.parse(p.items ?? '[]') as Array<{ descrizione?: string; coperti?: number; allergie?: string; occasione?: string; quantita?: number }> } catch { return [] } })()
        const coperti = items[0]?.coperti ?? note.match(/Coperti:\s*(\d+)/)?.[1]
        const allergie = items[0]?.allergie ?? note.match(/Allergie:\s*([^.]+)/)?.[1]?.trim()
        const occasione = items[0]?.occasione ?? note.match(/Occasione:\s*([^.]+)/)?.[1]?.trim()
        const descrizione = items[0]?.descrizione

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden" style={{ maxHeight: '80vh' }}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Richiesta #{p.numero}</p>
                  <h3 className="text-base font-bold text-gray-900 mt-0.5">{descrizione || p.titolo || 'Richiesta'}</h3>
                </div>
                <button onClick={() => setPreventivoAperto(null)} className="text-gray-400 hover:text-gray-600 text-xl mt-1">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {/* Badge stato + scaduto */}
                <div className="flex gap-2 flex-wrap">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                    p.status === 'accettato' ? 'bg-emerald-100 text-emerald-700' :
                    p.status === 'rifiutato' ? 'bg-red-100 text-red-600' :
                    p.status === 'inviato' ? 'bg-violet-100 text-violet-700' :
                    p.status === 'da_verificare' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{p.status === 'da_verificare' ? 'Da verificare' : p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>
                  {scaduto && <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-gray-200 text-gray-500">Scaduto</span>}
                </div>

                {/* Dettagli */}
                <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                  {dataApp && (
                    <Row label="📅 Data" value={`${dataApp.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${oraISO ? ` alle ${oraISO}` : ''}`} />
                  )}
                  {coperti && <Row label="🪑 Persone" value={`${coperti}`} />}
                  {allergie && allergie.toLowerCase() !== 'nessuna' && <Row label="⚠️ Allergie" value={allergie} />}
                  {occasione && <Row label="🎉 Occasione" value={occasione} />}
                  {p.messaggioProposta && <Row label="📝 Proposta" value={p.messaggioProposta} />}
                </div>

                {/* Note dal bot */}
                {note && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Note originali</p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {note.replace(/DATA_ISO:\S+/g, '').replace(/ORA_ISO:\S+/g, '').replace(/Coperti:\s*\d+\./g, '').replace(/Allergie:\s*[^.]+\./g, '').replace(/Occasione:\s*[^.]+\./g, '').trim()}
                    </p>
                  </div>
                )}

                <p className="text-xs text-gray-400">Ricevuta il {new Date(p.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>

              <div className="px-5 py-3 border-t border-gray-100">
                <button onClick={() => { setPreventivoAperto(null); router.push(`/dashboard/clienti/preventivi?richiesta=${p.id}`) }}
                  className="w-full text-sm text-indigo-600 font-semibold py-2 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                  Apri in Richieste →
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal conferma eliminazione definitiva */}
      {confermaElimina && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="text-lg font-bold text-gray-900">Elimina definitivamente</h3>
              <p className="text-sm text-gray-500 mt-1">
                Stai per eliminare <span className="font-semibold text-gray-700">{confermaElimina.name}</span> in modo permanente. Questa azione non è reversibile.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfermaElimina(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                Annulla
              </button>
              <button
                onClick={async () => {
                  const id = confermaElimina.id
                  setConfermaElimina(null)
                  if (selectedLead?.id === id) setSelectedLead(null)
                  await fetch(`/api/leads/${id}/elimina`, { method: 'DELETE', credentials: 'include' })
                  await fetchLeads()
                }}
                className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-lg hover:bg-red-600 transition-colors">
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuovo lead */}
      {showModal && (
        <NuovoLeadModal onClose={() => setShowModal(false)} onSave={handleAddLead} />
      )}

      {/* Pannello dettaglio lead */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedLead.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${selectedLead.cancellato ? 'bg-red-100 text-red-500' : COLONNE.find(c => c.id === selectedLead.status)?.color ?? 'bg-gray-100 text-gray-600'}`}>
                  {selectedLead.cancellato ? '✕ Cancellato' : COLONNE.find(c => c.id === selectedLead.status)?.label ?? selectedLead.status}
                </span>
              </div>
              <button onClick={() => { setSelectedLead(null); setEditing(false) }} className="text-gray-400 hover:text-gray-600 text-xl mt-1">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nome</label>
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                    <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Telefono</label>
                    <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Note</label>
                    <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(false)} className="flex-1 border border-gray-300 text-gray-700 text-sm font-semibold py-2 rounded-lg hover:bg-gray-50">Annulla</button>
                    <button onClick={() => handleEdit(selectedLead.id)} className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-indigo-700">Salva</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Info contatto */}
                  <div className="space-y-1.5 text-sm">
                    {selectedLead.email && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400 w-16 shrink-0">Email</span>
                        <span className="text-gray-800 font-medium">{selectedLead.email}</span>
                      </p>
                    )}
                    {selectedLead.phone && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400 w-16 shrink-0">Telefono</span>
                        <span className="text-gray-800 font-medium">{selectedLead.phone}</span>
                      </p>
                    )}
                    <p className="flex items-center gap-2">
                      <span className="text-gray-400 w-16 shrink-0">Aggiunto</span>
                      <span className="text-gray-600">{new Date(selectedLead.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </p>
                    {selectedLead.notes && (
                      <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
                        <p className="text-xs font-semibold text-amber-600 mb-1">📋 Richiesta</p>
                        <p className="text-sm text-gray-700">{selectedLead.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Storico cliente */}
                  {leadStorico && (leadStorico.totaleRichieste > 0 || leadStorico.totaleAppuntamenti > 0) && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Storico</p>
                      <div className="grid grid-cols-3 gap-2 text-center mb-2">
                        <div>
                          <p className="text-lg font-bold text-gray-900">{leadStorico.totaleRichieste}</p>
                          <p className="text-xs text-gray-400">Richieste</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-gray-900">{leadStorico.totaleAppuntamenti}</p>
                          <p className="text-xs text-gray-400">Appuntamenti</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-green-600">
                            {leadStorico.spesaTotale > 0 ? `€${leadStorico.spesaTotale.toFixed(0)}` : '—'}
                          </p>
                          <p className="text-xs text-gray-400">Spesa tot.</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {leadStorico.ultimaVisita && (
                          <span className="text-gray-500">📅 Ultima visita: {new Date(leadStorico.ultimaVisita).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        )}
                        {leadStorico.noShow > 0 && (
                          <span className="text-orange-500 font-medium">👻 {leadStorico.noShow} no-show</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Azioni rapide */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Vai a</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          if (leadPreventivi.length === 1) {
                            router.push(`/dashboard/clienti/preventivi?richiesta=${leadPreventivi[0].id}`)
                          } else {
                            router.push(`/dashboard/clienti/preventivi?leadId=${selectedLead.id}`)
                          }
                          setSelectedLead(null)
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 bg-violet-50 border border-violet-100 rounded-xl text-left hover:bg-violet-100 transition-colors group">
                        <span className="text-lg">📋</span>
                        <div>
                          <p className="text-xs font-semibold text-violet-700">Richieste</p>
                          <p className="text-xs text-violet-400">
                            {loadingRelated ? '...' : `${leadPreventivi.length} collegat${leadPreventivi.length === 1 ? 'a' : 'e'}`}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => router.push(`/dashboard/clienti/inbox${selectedLead.email ? `?apri=${encodeURIComponent(selectedLead.email)}` : ''}`)}
                        className="flex items-center gap-2 px-3 py-2.5 bg-sky-50 border border-sky-100 rounded-xl text-left hover:bg-sky-100 transition-colors group">
                        <span className="text-lg">💬</span>
                        <div>
                          <p className="text-xs font-semibold text-sky-700">Messaggi</p>
                          <p className="text-xs text-sky-400">
                            {loadingRelated ? '...' : `${leadConversazioni.length} conversazion${leadConversazioni.length === 1 ? 'e' : 'i'}`}
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Preventivi collegati */}
                  {leadPreventivi.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Storico richieste</p>
                      <div className="space-y-1.5">
                        {leadPreventivi.map(p => {
                          const dataISO = p.note?.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)?.[1]
                          const dataApp = dataISO ? new Date(dataISO) : null
                          const scaduto = dataApp && dataApp < new Date() && (p.status === 'accettato' || p.status === 'completato')
                          return (
                            <div key={p.id} onClick={() => setPreventivoAperto(p)}
                              className="flex items-center justify-between bg-gray-50 hover:bg-indigo-50 rounded-lg px-3 py-2 cursor-pointer transition-colors group">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {p.tipo === 'tavolo' ? '🪑' : p.tipo === 'catering' ? '🍱' : p.tipo === 'ordine' ? '📦' : '📋'}{' '}
                                  {p.titolo || `Richiesta #${p.numero}`}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {new Date(p.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  {dataISO && ` · per il ${new Date(dataISO).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                {scaduto && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-gray-200 text-gray-500">scaduto</span>}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  p.status === 'inviato' ? 'bg-violet-100 text-violet-700' :
                                  p.status === 'accettato' ? 'bg-emerald-100 text-emerald-700' :
                                  p.status === 'rifiutato' ? 'bg-red-100 text-red-600' :
                                  p.status === 'da_verificare' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>{p.status === 'da_verificare' ? 'da verificare' : p.status}</span>
                                <span className="text-gray-300 group-hover:text-indigo-400 text-sm">›</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sposta in */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sposta in</p>
                    <div className="flex flex-wrap gap-2">
                      {COLONNE.map((col) => (
                        <button key={col.id}
                          onClick={() => { handleStatusChange(selectedLead, col.id); setSelectedLead(null) }}
                          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${selectedLead.status === col.id ? col.color : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {col.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer azioni */}
            {!editing && (
              <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
                <button
                  onClick={() => { setEditForm({ name: selectedLead.name, email: selectedLead.email ?? '', phone: selectedLead.phone ?? '', notes: selectedLead.notes ?? '' }); setEditing(true) }}
                  className="flex-1 text-sm text-indigo-600 font-medium py-2 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                  ✏️ Modifica
                </button>
                {selectedLead.cancellato ? (
                  <>
                    <button onClick={async () => {
                      await fetch(`/api/leads/${selectedLead.id}`, {
                        method: 'PATCH', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cancellato: false }),
                      })
                      setSelectedLead(null)
                      await fetchLeads()
                    }} className="flex-1 text-sm text-green-600 font-medium py-2 border border-green-200 rounded-lg hover:bg-green-50 transition-colors">
                      ↩️ Ripristina
                    </button>
                    <button onClick={() => setConfermaElimina(selectedLead)}
                      className="text-sm text-gray-400 font-medium py-2 px-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors" title="Elimina definitivamente">
                      🗑️
                    </button>
                  </>
                ) : (
                  <button onClick={() => handleDelete(selectedLead.id)}
                    className="flex-1 text-sm text-red-500 font-medium py-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                    ✕ Cancella
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs text-gray-500 shrink-0 w-28">{label}</span>
      <span className="text-xs font-medium text-gray-800">{value}</span>
    </div>
  )
}

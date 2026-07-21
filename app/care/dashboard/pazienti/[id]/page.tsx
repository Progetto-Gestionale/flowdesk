'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  IconPencil, IconTrash, IconCalendar, IconClipboard, IconFolder, IconArrowRight,
} from '@/app/components/icons'

interface Paziente {
  id: string
  nome: string
  email?: string
  telefono?: string
  dataNascita?: string
  note?: string
  createdAt: string
}

interface Seduta {
  id: string
  data: string
  tipo?: string
  note?: string
}

interface Documento {
  id: string
  nome: string
  url: string
  tipo?: string
  createdAt: string
}

interface Appuntamento {
  id: string
  data: string
  servizio?: string
  status: string
}

function fmtData(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function PazienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [paziente, setPaziente] = useState<Paziente | null>(null)
  const [sedute, setSedute] = useState<Seduta[]>([])
  const [documenti, setDocumenti] = useState<Documento[]>([])
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>([])
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ nome: '', email: '', telefono: '', dataNascita: '', note: '' })

  const [modalSeduta, setModalSeduta] = useState(false)
  const [formSeduta, setFormSeduta] = useState({ data: '', tipo: '', note: '' })

  const [modalDoc, setModalDoc] = useState(false)
  const [formDoc, setFormDoc] = useState({ nome: '', url: '', tipo: '' })

  const [confermaElimina, setConfermaElimina] = useState(false)

  async function fetchAll() {
    const [pRes, sRes, dRes, aRes] = await Promise.all([
      fetch(`/api/pazienti/${id}`, { credentials: 'include', cache: 'no-store' }),
      fetch(`/api/pazienti/${id}/sedute`, { credentials: 'include', cache: 'no-store' }),
      fetch(`/api/pazienti/${id}/documenti`, { credentials: 'include', cache: 'no-store' }),
      fetch('/api/appuntamenti', { credentials: 'include', cache: 'no-store' }),
    ])
    const pData = await pRes.json()
    const sData = await sRes.json()
    const dData = await dRes.json()
    const aData = await aRes.json()
    setPaziente(pData.paziente ?? null)
    setSedute(sData.sedute ?? [])
    setDocumenti(dData.documenti ?? [])
    setAppuntamenti((aData.appuntamenti ?? []).filter((a: Appuntamento & { pazienteId?: string }) => a.pazienteId === id))
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id])

  async function handleSaveEdit() {
    await fetch(`/api/pazienti/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditing(false)
    fetchAll()
  }

  async function handleAddSeduta() {
    await fetch(`/api/pazienti/${id}/sedute`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formSeduta),
    })
    setModalSeduta(false)
    setFormSeduta({ data: '', tipo: '', note: '' })
    fetchAll()
  }

  async function handleAddDoc() {
    await fetch(`/api/pazienti/${id}/documenti`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formDoc),
    })
    setModalDoc(false)
    setFormDoc({ nome: '', url: '', tipo: '' })
    fetchAll()
  }

  async function handleDeleteSeduta(sedutaId: string) {
    await fetch(`/api/sedute/${sedutaId}`, { method: 'DELETE', credentials: 'include' })
    fetchAll()
  }

  async function handleDeleteDoc(docId: string) {
    await fetch(`/api/documenti-paziente/${docId}`, { method: 'DELETE', credentials: 'include' })
    fetchAll()
  }

  async function handleElimina() {
    await fetch(`/api/pazienti/${id}/elimina`, { method: 'DELETE', credentials: 'include' })
    router.push('/care/dashboard/pazienti')
  }

  if (loading) return <div className="text-center text-ink-navy/35 py-16">Caricamento...</div>
  if (!paziente) return <div className="text-center text-ink-navy/35 py-16">Paziente non trovato</div>

  const prossimi = appuntamenti.filter(a => new Date(a.data) >= new Date() && a.status !== 'cancellato')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/care/dashboard/pazienti" className="inline-flex items-center gap-1.5 text-sm text-ink-navy/40 hover:text-ink-navy transition-colors font-medium">
        ← Pazienti
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-ink-navy">{paziente.nome}</h1>
            <p className="text-sm text-ink-navy/40 mt-1">Paziente dal {fmtData(paziente.createdAt)}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => { setEditForm({ nome: paziente.nome, email: paziente.email ?? '', telefono: paziente.telefono ?? '', dataNascita: paziente.dataNascita ? paziente.dataNascita.slice(0, 10) : '', note: paziente.note ?? '' }); setEditing(true) }}
              className="w-9 h-9 flex items-center justify-center text-ink-navy/40 hover:text-electric-blue border border-ink-navy/10 rounded-lg hover:bg-electric-blue/10 transition-colors">
              <span className="w-4 h-4"><IconPencil /></span>
            </button>
            <button onClick={() => setConfermaElimina(true)}
              className="w-9 h-9 flex items-center justify-center text-ink-navy/40 hover:text-red-500 border border-ink-navy/10 rounded-lg hover:bg-red-50 transition-colors">
              <span className="w-4 h-4"><IconTrash /></span>
            </button>
          </div>
        </div>

        {editing ? (
          <div className="mt-5 space-y-3 border-t border-ink-navy/8 pt-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-navy/50 mb-1">Nome e cognome</label>
                <input value={editForm.nome} onChange={e => setEditForm({ ...editForm, nome: e.target.value })}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-navy/50 mb-1">Data di nascita</label>
                <input type="date" value={editForm.dataNascita} onChange={e => setEditForm({ ...editForm, dataNascita: e.target.value })}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-navy/50 mb-1">Email</label>
                <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-navy/50 mb-1">Telefono</label>
                <input value={editForm.telefono} onChange={e => setEditForm({ ...editForm, telefono: e.target.value })}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-navy/50 mb-1">Anamnesi / note generali</label>
              <textarea value={editForm.note} onChange={e => setEditForm({ ...editForm, note: e.target.value })} rows={3}
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 text-sm font-semibold py-2 rounded-lg hover:bg-mist">Annulla</button>
              <button onClick={handleSaveEdit} className="flex-1 bg-electric-blue text-white text-sm font-semibold py-2 rounded-lg hover:bg-electric-blue/90">Salva</button>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid sm:grid-cols-2 gap-3 border-t border-ink-navy/8 pt-5 text-sm">
            {paziente.email && <p><span className="text-ink-navy/40 w-20 inline-block">Email</span><span className="text-ink-navy font-medium">{paziente.email}</span></p>}
            {paziente.telefono && <p><span className="text-ink-navy/40 w-20 inline-block">Telefono</span><span className="text-ink-navy font-medium">{paziente.telefono}</span></p>}
            {paziente.dataNascita && <p><span className="text-ink-navy/40 w-20 inline-block">Nato il</span><span className="text-ink-navy font-medium">{fmtData(paziente.dataNascita)}</span></p>}
            {paziente.note && (
              <div className="sm:col-span-2 bg-mist rounded-lg px-3 py-2 mt-1">
                <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wider mb-1">Anamnesi</p>
                <p className="text-ink-navy/70">{paziente.note}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prossimi appuntamenti */}
      {prossimi.length > 0 && (
        <div className="bg-electric-blue/10 border border-electric-blue/20 rounded-2xl p-5">
          <p className="text-xs font-semibold text-electric-blue uppercase tracking-wider mb-3">Prossimi appuntamenti</p>
          <div className="space-y-2">
            {prossimi.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 text-electric-blue"><IconCalendar /></span>
                  <span className="text-sm font-medium text-ink-navy">{fmtData(a.data)}</span>
                  {a.servizio && <span className="text-xs text-ink-navy/40">· {a.servizio}</span>}
                </div>
              </div>
            ))}
          </div>
          <Link href="/care/dashboard/calendario" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-electric-blue hover:underline">
            Apri calendario <span className="w-3 h-3"><IconArrowRight /></span>
          </Link>
        </div>
      )}

      {/* Storico sedute */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-ink-navy flex items-center gap-2">
            <span className="w-4 h-4 text-electric-blue"><IconClipboard /></span>
            Storico sedute
          </h2>
          <button onClick={() => setModalSeduta(true)}
            className="text-xs bg-electric-blue/10 text-electric-blue font-semibold px-3 py-1.5 rounded-lg hover:bg-electric-blue/15 transition-colors">
            + Nuova seduta
          </button>
        </div>
        {sedute.length === 0 ? (
          <p className="text-sm text-ink-navy/35 text-center py-6">Nessuna seduta registrata</p>
        ) : (
          <div className="space-y-2">
            {sedute.map(s => (
              <div key={s.id} className="flex items-start justify-between gap-3 bg-mist rounded-xl px-4 py-3 group">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink-navy">{fmtData(s.data)}</p>
                    {s.tipo && <span className="text-xs bg-white text-ink-navy/60 px-2 py-0.5 rounded-full font-medium">{s.tipo}</span>}
                  </div>
                  {s.note && <p className="text-sm text-ink-navy/60 mt-1">{s.note}</p>}
                </div>
                <button onClick={() => handleDeleteSeduta(s.id)}
                  className="opacity-0 group-hover:opacity-100 shrink-0 w-6 h-6 flex items-center justify-center text-ink-navy/25 hover:text-red-400 transition-all">
                  <span className="w-3 h-3"><IconTrash /></span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documenti */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-ink-navy flex items-center gap-2">
            <span className="w-4 h-4 text-electric-blue"><IconFolder /></span>
            Documenti
          </h2>
          <button onClick={() => setModalDoc(true)}
            className="text-xs bg-electric-blue/10 text-electric-blue font-semibold px-3 py-1.5 rounded-lg hover:bg-electric-blue/15 transition-colors">
            + Aggiungi documento
          </button>
        </div>
        {documenti.length === 0 ? (
          <p className="text-sm text-ink-navy/35 text-center py-6">Nessun documento caricato</p>
        ) : (
          <div className="space-y-2">
            {documenti.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 bg-mist rounded-xl px-4 py-3 group">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:text-electric-blue">
                  <p className="text-sm font-semibold text-ink-navy truncate">{d.nome}</p>
                  <p className="text-xs text-ink-navy/40">{d.tipo || 'Documento'} · {fmtData(d.createdAt)}</p>
                </a>
                <button onClick={() => handleDeleteDoc(d.id)}
                  className="opacity-0 group-hover:opacity-100 shrink-0 w-6 h-6 flex items-center justify-center text-ink-navy/25 hover:text-red-400 transition-all">
                  <span className="w-3 h-3"><IconTrash /></span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal nuova seduta */}
      {modalSeduta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-ink-navy">Nuova seduta</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Data</label>
                <input type="date" value={formSeduta.data} onChange={e => setFormSeduta({ ...formSeduta, data: e.target.value })}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Tipo di trattamento</label>
                <input value={formSeduta.tipo} onChange={e => setFormSeduta({ ...formSeduta, tipo: e.target.value })}
                  placeholder="Es. Terapia manuale, Rieducazione posturale..."
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note cliniche</label>
                <textarea value={formSeduta.note} onChange={e => setFormSeduta({ ...formSeduta, note: e.target.value })} rows={3}
                  placeholder="Cosa è stato fatto, dolore percepito, esercizi assegnati..."
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalSeduta(false)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
              <button onClick={handleAddSeduta} className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90">Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuovo documento */}
      {modalDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-ink-navy">Nuovo documento</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome documento *</label>
                <input value={formDoc.nome} onChange={e => setFormDoc({ ...formDoc, nome: e.target.value })}
                  placeholder="Es. Referto RX ginocchio"
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Link *</label>
                <input value={formDoc.url} onChange={e => setFormDoc({ ...formDoc, url: e.target.value })}
                  placeholder="Link a Drive, Dropbox o file online"
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Tipo</label>
                <input value={formDoc.tipo} onChange={e => setFormDoc({ ...formDoc, tipo: e.target.value })}
                  placeholder="Es. Referto, Prescrizione, Radiografia..."
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalDoc(false)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
              <button onClick={handleAddDoc} disabled={!formDoc.nome.trim() || !formDoc.url.trim()}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 disabled:opacity-40">Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Conferma eliminazione */}
      {confermaElimina && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center p-3 mx-auto mb-4">
                <IconTrash />
              </div>
              <h3 className="text-lg font-bold text-ink-navy">Elimina paziente</h3>
              <p className="text-sm text-ink-navy/50 mt-1">
                Stai per eliminare <span className="font-semibold text-ink-navy/70">{paziente.nome}</span> e tutta la sua cartella clinica (sedute e documenti). Questa azione non è reversibile.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfermaElimina(false)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
              <button onClick={handleElimina} className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-lg hover:bg-red-600">Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { IconStethoscope, IconTrash } from '@/app/components/icons'

interface Paziente {
  id: string
  nome: string
  email?: string
  telefono?: string
  createdAt: string
  cancellato: boolean
  _count?: { sedute: number }
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

function fmtData(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

function esportaCSV(pazienti: Paziente[]) {
  const header = ['Nome e cognome', 'Cliente da', 'Numero sedute', 'Email', 'Telefono']
  const righe = pazienti.map(p => [
    p.nome,
    fmtData(p.createdAt),
    String(p._count?.sedute ?? 0),
    p.email ?? '',
    p.telefono ?? '',
  ])
  const csv = [header, ...righe]
    .map(riga => riga.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pazienti_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function PazientiPage() {
  const [pazienti, setPazienti] = useState<Paziente[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [ricerca, setRicerca] = useState('')
  const [confermaElimina, setConfermaElimina] = useState<Paziente | null>(null)

  async function fetchPazienti() {
    const res = await fetch('/api/pazienti', { cache: 'no-store', credentials: 'include' })
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

  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase()
    if (!q) return pazienti
    return pazienti.filter(p =>
      p.nome.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.telefono?.toLowerCase().includes(q)
    )
  }, [pazienti, ricerca])

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Pazienti</h1>
          <p className="text-ink-navy/50 mt-0.5">{pazienti.length} pazienti totali</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => esportaCSV(filtrati)} disabled={filtrati.length === 0}
            className="text-sm font-semibold px-4 py-2 rounded-lg border border-ink-navy/10 text-ink-navy/60 hover:bg-mist transition-colors disabled:opacity-40">
            Esporta Excel
          </button>
          <button onClick={() => setShowModal(true)}
            className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90 transition-colors">
            + Nuovo paziente
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input value={ricerca} onChange={e => setRicerca(e.target.value)}
          placeholder="Cerca per nome, email o telefono..."
          className="w-full sm:w-80 border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : filtrati.length === 0 ? (
        <div className="bg-white border border-dashed border-ink-navy/15 rounded-xl p-12 text-center text-ink-navy/35">
          <div className="w-11 h-11 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-2.5 mx-auto mb-4">
            <IconStethoscope />
          </div>
          <p className="font-medium">{ricerca ? 'Nessun risultato' : 'Nessun paziente ancora'}</p>
          <p className="text-sm mt-1">{ricerca ? 'Prova un altro termine di ricerca' : 'Aggiungi il primo paziente per iniziare'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-navy/10 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-navy/8 text-left">
                <th className="px-4 py-3 font-semibold text-ink-navy/40 text-xs uppercase tracking-wider">Nome e cognome</th>
                <th className="px-4 py-3 font-semibold text-ink-navy/40 text-xs uppercase tracking-wider">Cliente da</th>
                <th className="px-4 py-3 font-semibold text-ink-navy/40 text-xs uppercase tracking-wider">N. sedute</th>
                <th className="px-4 py-3 font-semibold text-ink-navy/40 text-xs uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 font-semibold text-ink-navy/40 text-xs uppercase tracking-wider">Telefono</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrati.map(p => (
                <tr key={p.id} className="border-b border-ink-navy/8 last:border-0 hover:bg-mist/60 transition-colors group">
                  <td className="px-4 py-3">
                    <Link href={`/care/dashboard/pazienti/${p.id}`} className="font-semibold text-ink-navy hover:text-electric-blue">
                      {p.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-navy/60">{fmtData(p.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-navy/60">{p._count?.sedute ?? 0}</td>
                  <td className="px-4 py-3 text-ink-navy/60">{p.email || '—'}</td>
                  <td className="px-4 py-3 text-ink-navy/60">{p.telefono || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setConfermaElimina(p)}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 inline-flex items-center justify-center text-ink-navy/25 hover:text-red-400 transition-all">
                      <span className="w-3.5 h-3.5"><IconTrash /></span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <NuovoPazienteModal onClose={() => setShowModal(false)} onSave={handleAdd} />}

      {confermaElimina && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center p-3 mx-auto mb-4">
                <IconTrash />
              </div>
              <h3 className="text-lg font-bold text-ink-navy">Elimina paziente</h3>
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
    </div>
  )
}

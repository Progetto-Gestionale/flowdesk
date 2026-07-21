'use client'

import { useEffect, useState } from 'react'
import { IconClipboard, IconCheck } from '@/app/components/icons'

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  bozza: { bg: 'bg-mist', text: 'text-ink-navy/60', label: 'Nuova' },
  inviato: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In attesa' },
  accettato: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Accettata' },
  rifiutato: { bg: 'bg-red-100', text: 'text-red-600', label: 'Rifiutata' },
}

interface Richiesta {
  id: string
  numero: number
  clienteName: string
  clienteEmail?: string
  note?: string
  status: string
  createdAt: string
}

function NuovaRichiestaModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: { clienteName: string; clienteEmail: string; note: string }) => void
}) {
  const [form, setForm] = useState({ clienteName: '', clienteEmail: '', note: '' })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-ink-navy">Nuova richiesta</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome e cognome *</label>
            <input value={form.clienteName} onChange={e => setForm({ ...form, clienteName: e.target.value })}
              placeholder="Mario Rossi" autoFocus
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Email</label>
            <input value={form.clienteEmail} onChange={e => setForm({ ...form, clienteEmail: e.target.value })}
              placeholder="paziente@email.com"
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Richiesta</label>
            <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={3}
              placeholder="Cosa ha chiesto il paziente..."
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
          <button onClick={() => onSave(form)} disabled={!form.clienteName.trim()}
            className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 disabled:opacity-40">Salva</button>
        </div>
      </div>
    </div>
  )
}

export default function RichiestePage() {
  const [richieste, setRichieste] = useState<Richiesta[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [accettando, setAccettando] = useState<Richiesta | null>(null)
  const [dataApp, setDataApp] = useState('')
  const [oraApp, setOraApp] = useState('09:00')

  async function fetchRichieste() {
    const res = await fetch('/api/preventivi', { credentials: 'include', cache: 'no-store' })
    const data = await res.json()
    setRichieste(data.preventivi ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchRichieste()
    const interval = setInterval(fetchRichieste, 15000)
    return () => clearInterval(interval)
  }, [])

  async function handleAdd(form: { clienteName: string; clienteEmail: string; note: string }) {
    try {
      await fetch('/api/preventivi', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, items: [] }),
      })
      await fetchRichieste()
    } finally {
      setShowModal(false)
    }
  }

  async function handleRifiuta(id: string) {
    await fetch(`/api/preventivi/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rifiutato' }),
    })
    fetchRichieste()
  }

  function apriAccetta(r: Richiesta) {
    setAccettando(r)
    setDataApp(new Date().toISOString().slice(0, 10))
    setOraApp('09:00')
  }

  async function confermaAccetta() {
    if (!accettando) return

    // Trova o crea il paziente in base all'email
    let pazienteId: string | null = null
    if (accettando.clienteEmail) {
      const res = await fetch('/api/pazienti', { credentials: 'include', cache: 'no-store' })
      const data = await res.json()
      const esistente = (data.pazienti ?? []).find((p: { email?: string }) => p.email?.toLowerCase() === accettando.clienteEmail!.toLowerCase())
      pazienteId = esistente?.id ?? null
    }
    if (!pazienteId) {
      const res = await fetch('/api/pazienti', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: accettando.clienteName, email: accettando.clienteEmail }),
      })
      const data = await res.json()
      pazienteId = data.paziente.id
    }

    const [h, m] = oraApp.split(':').map(Number)
    const data = new Date(dataApp)
    data.setHours(h, m, 0, 0)

    await fetch('/api/appuntamenti', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteNome: accettando.clienteName,
        clienteEmail: accettando.clienteEmail,
        note: accettando.note,
        data: data.toISOString(),
        durata: 45,
        pazienteId,
      }),
    })

    await fetch(`/api/preventivi/${accettando.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accettato' }),
    })

    setAccettando(null)
    fetchRichieste()
  }

  const attive = richieste.filter(r => r.status === 'bozza' || r.status === 'inviato')
  const evase = richieste.filter(r => r.status === 'accettato' || r.status === 'rifiutato')

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Richieste</h1>
          <p className="text-ink-navy/50 mt-0.5">{attive.length} in attesa</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90 transition-colors">
          + Nuova richiesta
        </button>
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : richieste.length === 0 ? (
        <div className="bg-white border border-dashed border-ink-navy/15 rounded-xl p-12 text-center text-ink-navy/35">
          <div className="w-11 h-11 rounded-xl bg-mist flex items-center justify-center p-2.5 mx-auto mb-4">
            <IconClipboard />
          </div>
          <p className="font-medium">Nessuna richiesta ancora</p>
          <p className="text-sm mt-1">Le richieste arrivano dal chatbot o puoi crearne una manualmente</p>
        </div>
      ) : (
        <div className="space-y-6">
          {attive.length > 0 && (
            <div className="space-y-2">
              {attive.map(r => {
                const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.bozza
                return (
                  <div key={r.id} className="bg-white rounded-xl border border-ink-navy/10 shadow-sm p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-ink-navy">{r.clienteName}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                      </div>
                      {r.clienteEmail && <p className="text-xs text-ink-navy/40 mt-0.5">{r.clienteEmail}</p>}
                      {r.note && <p className="text-sm text-ink-navy/60 mt-1.5">{r.note}</p>}
                      <p className="text-xs text-ink-navy/30 mt-1.5">Ricevuta il {new Date(r.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleRifiuta(r.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                        Rifiuta
                      </button>
                      <button onClick={() => apriAccetta(r)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-electric-blue text-white hover:bg-electric-blue/90 transition-colors">
                        Accetta
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {evase.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">Evase</p>
              <div className="space-y-1.5">
                {evase.map(r => {
                  const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.bozza
                  return (
                    <div key={r.id} className="flex items-center justify-between bg-mist rounded-lg px-4 py-2.5">
                      <p className="text-sm text-ink-navy/60">{r.clienteName}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && <NuovaRichiestaModal onClose={() => setShowModal(false)} onSave={handleAdd} />}

      {/* Modal accetta → crea appuntamento */}
      {accettando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center p-2 shrink-0"><IconCheck /></span>
              <div>
                <h2 className="text-lg font-bold text-ink-navy">Conferma appuntamento</h2>
                <p className="text-xs text-ink-navy/40">per {accettando.clienteName}</p>
              </div>
            </div>
            <p className="text-sm text-ink-navy/60">Fissa data e ora della prima seduta. Il paziente verrà aggiunto automaticamente alla lista pazienti.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Data</label>
                <input type="date" value={dataApp} onChange={e => setDataApp(e.target.value)}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Ora</label>
                <input type="time" value={oraApp} onChange={e => setOraApp(e.target.value)}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setAccettando(null)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
              <button onClick={confermaAccetta} className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90">Conferma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

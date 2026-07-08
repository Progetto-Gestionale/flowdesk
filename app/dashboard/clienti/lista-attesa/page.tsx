'use client'
import { useEffect, useState } from 'react'
import { IconTrash } from '../../../components/icons'

interface Attesa {
  id: string
  clienteNome: string
  clienteEmail: string | null
  clienteTel: string | null
  data: string
  ora: string
  coperti: number
  note: string | null
  status: string
  createdAt: string
}

const STATUS_LABEL: Record<string, string> = {
  in_attesa: 'In attesa',
  notificato: 'Notificato',
  confermato: 'Confermato',
  cancellato: 'Cancellato',
}
const STATUS_COLOR: Record<string, string> = {
  in_attesa: 'bg-amber-100 text-amber-700',
  notificato: 'bg-blue-100 text-blue-700',
  confermato: 'bg-green-100 text-green-700',
  cancellato: 'bg-mist text-ink-navy/50',
}

export default function ListaAttesaPage() {
  const [lista, setLista] = useState<Attesa[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'attivi' | 'tutti'>('attivi')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ clienteNome: '', clienteEmail: '', clienteTel: '', data: '', ora: '', coperti: '2', note: '' })

  async function fetchLista() {
    const url = filtro === 'attivi' ? '/api/lista-attesa?attivi=true' : '/api/lista-attesa'
    const res = await fetch(url, { credentials: 'include' })
    const data = await res.json()
    setLista(data.lista ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchLista() }, [filtro])

  async function aggiungi() {
    setSaving(true)
    await fetch('/api/lista-attesa', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        data: new Date(form.data).toISOString(),
        coperti: parseInt(form.coperti),
      }),
    })
    setSaving(false)
    setShowModal(false)
    setForm({ clienteNome: '', clienteEmail: '', clienteTel: '', data: '', ora: '', coperti: '2', note: '' })
    fetchLista()
  }

  async function aggiornaStatus(id: string, status: string) {
    await fetch(`/api/lista-attesa/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchLista()
  }

  async function elimina(id: string) {
    await fetch(`/api/lista-attesa/${id}`, { method: 'DELETE', credentials: 'include' })
    fetchLista()
  }

  const inAttesa = lista.filter(i => i.status === 'in_attesa').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-navy">Lista d&apos;attesa</h1>
          <p className="text-ink-navy/50 text-sm mt-0.5">
            {inAttesa > 0 ? `${inAttesa} cliente${inAttesa > 1 ? 'i' : ''} in attesa` : 'Nessuno in attesa'}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-electric-blue text-white px-4 py-2 rounded-xl font-medium hover:bg-electric-blue/90 transition-colors text-sm">
          + Aggiungi
        </button>
      </div>

      {/* Filtro */}
      <div className="flex gap-2">
        {(['attivi', 'tutti'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filtro === f ? 'bg-electric-blue text-white' : 'bg-white border border-ink-navy/15 text-ink-navy/60 hover:bg-mist'}`}>
            {f === 'attivi' ? 'In attesa' : 'Tutti'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-16">Caricamento...</div>
      ) : lista.length === 0 ? (
        <div className="bg-white rounded-2xl border border-ink-navy/10 p-12 text-center shadow-sm">
          <div className="text-5xl mb-4">⏳</div>
          <h3 className="text-lg font-semibold text-ink-navy">Lista vuota</h3>
          <p className="text-ink-navy/50 text-sm mt-2">I clienti in lista d&apos;attesa appariranno qui</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(item => {
            const dataFmt = new Date(item.data).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
            return (
              <div key={item.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${item.status === 'cancellato' ? 'opacity-50' : 'border-ink-navy/10'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink-navy">{item.clienteNome}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[item.status]}`}>
                        {STATUS_LABEL[item.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-ink-navy/50 flex-wrap">
                      <span> {dataFmt} · {item.ora}</span>
                      <span> {item.coperti} {item.coperti === 1 ? 'persona' : 'persone'}</span>
                      {item.clienteEmail && <span> {item.clienteEmail}</span>}
                      {item.clienteTel && <span> {item.clienteTel}</span>}
                      {item.clienteEmail && (
                        <a href={`/dashboard/clienti/inbox?apri=${encodeURIComponent(item.clienteEmail)}`}
                          className="flex items-center gap-1 text-electric-blue hover:text-ink-navy font-medium text-xs bg-electric-blue/10 px-2 py-0.5 rounded-lg hover:bg-electric-blue/15 transition-colors">
                           Apri chat
                        </a>
                      )}
                    </div>
                    {item.note && <p className="text-xs text-ink-navy/35 mt-1">{item.note}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                    {(item.status === 'in_attesa' || item.status === 'notificato') && (
                      <>
                        {item.status === 'in_attesa' && (
                          <button onClick={() => aggiornaStatus(item.id, 'notificato')}
                            title="Segna che hai già contattato questo cliente"
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium">
                            Ho contattato
                          </button>
                        )}
                        {item.status === 'notificato' && (
                          <button onClick={() => aggiornaStatus(item.id, 'in_attesa')}
                            className="text-xs px-2 py-1 bg-mist text-ink-navy/50 rounded-lg hover:bg-ink-navy/10 transition-colors font-medium">
                            ← In attesa
                          </button>
                        )}
                        <button onClick={() => aggiornaStatus(item.id, 'confermato')}
                          className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-medium">
                          Confermato
                        </button>
                        <button onClick={() => aggiornaStatus(item.id, 'cancellato')}
                          className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors font-medium">
                          Rifiuta
                        </button>
                      </>
                    )}
                    {(item.status === 'confermato' || item.status === 'cancellato') && (
                      <button onClick={() => elimina(item.id)} className="w-6 flex items-center justify-center text-ink-navy/35 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors">
                        <span className="w-3.5 h-3.5"><IconTrash /></span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink-navy">Aggiungi alla lista d&apos;attesa</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome cliente *</label>
                <input value={form.clienteNome} onChange={e => setForm(f => ({ ...f, clienteNome: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Email</label>
                <input type="email" value={form.clienteEmail} onChange={e => setForm(f => ({ ...f, clienteEmail: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Telefono</label>
                <input type="tel" value={form.clienteTel} onChange={e => setForm(f => ({ ...f, clienteTel: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Data desiderata *</label>
                <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Orario *</label>
                <input type="time" value={form.ora} onChange={e => setForm(f => ({ ...f, ora: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Persone</label>
                <input type="number" min="1" value={form.coperti} onChange={e => setForm(f => ({ ...f, coperti: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note</label>
                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="allergie, occasione..."
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl hover:bg-mist transition-colors text-sm">
                Annulla
              </button>
              <button onClick={aggiungi} disabled={saving || !form.clienteNome || !form.data || !form.ora}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-xl hover:bg-electric-blue/90 transition-colors text-sm disabled:opacity-50">
                {saving ? 'Salvataggio...' : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

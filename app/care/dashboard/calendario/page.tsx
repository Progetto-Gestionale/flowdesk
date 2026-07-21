'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconTrash, IconArrowRight, IconClock } from '@/app/components/icons'

const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const GIORNI_CODICE = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  confermato: { bg: 'bg-electric-blue/15', text: 'text-electric-blue', label: 'Confermato' },
  completato: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completato' },
  no_show: { bg: 'bg-orange-100', text: 'text-orange-600', label: 'No-show' },
  cancellato: { bg: 'bg-red-100', text: 'text-red-500', label: 'Cancellato' },
}

interface Appuntamento {
  id: string
  clienteNome?: string
  clienteEmail?: string
  servizio?: string
  data: string
  durata: number
  status: string
  note?: string
  pazienteId?: string | null
}

interface Paziente {
  id: string
  nome: string
  email?: string
}

interface Seduta {
  id: string
  data: string
  tipo?: string
}

function startOfWeek(d: Date) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const r = new Date(d)
  r.setDate(r.getDate() + diff)
  r.setHours(0, 0, 0, 0)
  return r
}
function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Override {
  id: string
  data: string
  slots: string
}

export default function CalendarioPage() {
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>([])
  const [pazienti, setPazienti] = useState<Paziente[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selected, setSelected] = useState<Appuntamento | null>(null)
  const [seduteStorico, setSeduteStorico] = useState<Seduta[]>([])
  const [showNuovo, setShowNuovo] = useState<Date | null>(null)
  const [form, setForm] = useState({ pazienteId: '', clienteNome: '', servizio: '', ora: '09:00', durata: '45', note: '' })
  const [orariSettimanali, setOrariSettimanali] = useState<Record<string, string>>({})
  const [overrides, setOverrides] = useState<Override[]>([])
  const [modalOrari, setModalOrari] = useState<Date | null>(null)
  const [formOrariGiorno, setFormOrariGiorno] = useState('')

  async function fetchAll() {
    const [aRes, pRes, sRes] = await Promise.all([
      fetch('/api/appuntamenti', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/pazienti', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/settings', { credentials: 'include', cache: 'no-store' }),
    ])
    const aData = await aRes.json()
    const pData = await pRes.json()
    const sData = await sRes.json()
    setAppuntamenti(aData.appuntamenti ?? [])
    setPazienti(pData.pazienti ?? [])
    try { setOrariSettimanali(JSON.parse(sData.orariApertura ?? '{}')) } catch { setOrariSettimanali({}) }
    setLoading(false)
  }

  async function fetchOverrides(start: Date) {
    const da = toDateStr(start)
    const a = toDateStr(addDays(start, 6))
    const res = await fetch(`/api/disponibilita-override?da=${da}&a=${a}`, { credentials: 'include', cache: 'no-store' })
    const data = await res.json()
    setOverrides(data.override ?? [])
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { fetchOverrides(weekStart) }, [weekStart])

  function orarioEffettivo(day: Date): { testo: string; override: Override | null } {
    const dateStr = toDateStr(day)
    const ov = overrides.find(o => o.data.slice(0, 10) === dateStr)
    if (ov) {
      const slots: string[] = (() => { try { return JSON.parse(ov.slots) } catch { return [] } })()
      return { testo: slots.length ? slots.join(', ') : 'Chiuso', override: ov }
    }
    const codice = GIORNI_CODICE[(day.getDay() + 6) % 7]
    return { testo: orariSettimanali[codice] || 'Chiuso', override: null }
  }

  function apriModalOrari(day: Date) {
    const { testo } = orarioEffettivo(day)
    setFormOrariGiorno(testo === 'Chiuso' ? '' : testo)
    setModalOrari(day)
  }

  async function salvaOrarioGiorno() {
    if (!modalOrari) return
    const slots = formOrariGiorno.split(',').map(s => s.trim()).filter(Boolean)
    await fetch('/api/disponibilita-override', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: toDateStr(modalOrari), slots }),
    })
    setModalOrari(null)
    fetchOverrides(weekStart)
  }

  async function ripristinaOrarioStandard() {
    if (!modalOrari) return
    const { override } = orarioEffettivo(modalOrari)
    if (override) await fetch(`/api/disponibilita-override/${override.id}`, { method: 'DELETE', credentials: 'include' })
    setModalOrari(null)
    fetchOverrides(weekStart)
  }

  async function openSelected(a: Appuntamento) {
    setSelected(a)
    setSeduteStorico([])
    if (a.pazienteId) {
      const res = await fetch(`/api/pazienti/${a.pazienteId}/sedute`, { credentials: 'include', cache: 'no-store' })
      const data = await res.json()
      setSeduteStorico((data.sedute ?? []).slice(0, 3))
    }
  }

  async function handleStatusChange(id: string, status: string) {
    setAppuntamenti(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    setSelected(prev => prev && prev.id === id ? { ...prev, status } : prev)
    await fetch(`/api/appuntamenti/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  async function handleDelete(id: string) {
    await fetch(`/api/appuntamenti/${id}`, { method: 'DELETE', credentials: 'include' })
    setSelected(null)
    fetchAll()
  }

  function openNuovo(day: Date) {
    setForm({ pazienteId: '', clienteNome: '', servizio: '', ora: '09:00', durata: '45', note: '' })
    setShowNuovo(day)
  }

  async function handleCreate() {
    if (!showNuovo) return
    const paziente = pazienti.find(p => p.id === form.pazienteId)
    const [h, m] = form.ora.split(':').map(Number)
    const data = new Date(showNuovo)
    data.setHours(h, m, 0, 0)

    await fetch('/api/appuntamenti', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteNome: paziente?.nome ?? form.clienteNome,
        clienteEmail: paziente?.email,
        servizio: form.servizio,
        data: data.toISOString(),
        durata: parseInt(form.durata) || 45,
        note: form.note,
        pazienteId: form.pazienteId || null,
      }),
    })
    setShowNuovo(null)
    fetchAll()
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = addDays(weekStart, 6)
  const label = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${MESI[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekStart.getDate()} ${MESI[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MESI[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Calendario</h1>
          <p className="text-ink-navy/50 mt-0.5 capitalize">{label}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 text-ink-navy/50 hover:bg-mist">‹</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-ink-navy/10 text-ink-navy/60 hover:bg-mist">Oggi</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 text-ink-navy/50 hover:bg-mist">›</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : (
        <div className="grid grid-cols-7 gap-3">
          {days.map((day, i) => {
            const isToday = isSameDay(day, new Date())
            const dayApps = appuntamenti
              .filter(a => isSameDay(new Date(a.data), day) && a.status !== 'cancellato')
              .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
            return (
              <div key={i} className="min-h-[280px]">
                <div className={`text-center pb-2 mb-2 border-b-2 ${isToday ? 'border-electric-blue' : 'border-ink-navy/10'}`}>
                  <p className="text-[10px] font-semibold text-ink-navy/35 uppercase tracking-wider">{GIORNI_BREVI[i]}</p>
                  <p className={`text-lg font-bold ${isToday ? 'text-electric-blue' : 'text-ink-navy'}`}>{day.getDate()}</p>
                  <button onClick={() => apriModalOrari(day)}
                    className={`mt-1 inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${orarioEffettivo(day).override ? 'bg-zest-lime/25 text-ink-navy' : 'text-ink-navy/30 hover:text-electric-blue'}`}
                    title={orarioEffettivo(day).testo}>
                    <span className="w-2.5 h-2.5"><IconClock /></span>
                    {orarioEffettivo(day).testo === 'Chiuso' ? 'Chiuso' : 'Orari'}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {dayApps.map(a => {
                    const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.confermato
                    const ora = new Date(a.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <button key={a.id} onClick={() => openSelected(a)}
                        className={`w-full text-left rounded-lg px-2 py-1.5 ${st.bg} ${st.text} hover:opacity-80 transition-opacity`}>
                        <p className="text-[11px] font-bold leading-tight">{ora}</p>
                        <p className="text-[11px] font-semibold leading-tight truncate">{a.clienteNome || 'Paziente'}</p>
                      </button>
                    )
                  })}
                  <button onClick={() => openNuovo(day)}
                    className="w-full text-[11px] text-ink-navy/30 hover:text-electric-blue border border-dashed border-ink-navy/10 hover:border-electric-blue rounded-lg py-1.5 transition-colors">
                    + Aggiungi
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pannello dettaglio appuntamento */}
      {selected && (() => {
        const st = STATUS_STYLE[selected.status] ?? STATUS_STYLE.confermato
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: '85vh' }}>
              <div className="px-5 py-4 border-b border-ink-navy/8 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-ink-navy">{selected.clienteNome || 'Paziente'}</h2>
                  <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
                </div>
                <button onClick={() => setSelected(null)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl mt-1">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                <div className="text-sm space-y-1.5">
                  <p className="text-ink-navy/70 font-medium">
                    {new Date(selected.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {' · '}
                    {new Date(selected.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{selected.durata} min
                  </p>
                  {selected.servizio && <p className="text-ink-navy/50">{selected.servizio}</p>}
                  {selected.note && <p className="text-ink-navy/50 italic">{selected.note}</p>}
                </div>

                {selected.pazienteId && (
                  <div className="bg-mist rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">Sedute precedenti</p>
                    {seduteStorico.length === 0 ? (
                      <p className="text-xs text-ink-navy/35">Nessuna seduta registrata</p>
                    ) : (
                      <div className="space-y-1.5">
                        {seduteStorico.map(s => (
                          <p key={s.id} className="text-xs text-ink-navy/60">
                            {new Date(s.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                            {s.tipo ? ` · ${s.tipo}` : ''}
                          </p>
                        ))}
                      </div>
                    )}
                    <Link href={`/care/dashboard/pazienti/${selected.pazienteId}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-electric-blue hover:underline">
                      Apri cartella clinica <span className="w-3 h-3"><IconArrowRight /></span>
                    </Link>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">Stato</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(STATUS_STYLE).filter(([k]) => k !== 'cancellato').map(([key, s]) => (
                      <button key={key} onClick={() => handleStatusChange(selected.id, key)}
                        className={`text-sm py-2 rounded-lg font-medium transition-colors ${selected.status === key ? `${s.bg} ${s.text}` : 'bg-mist text-ink-navy/60 hover:bg-ink-navy/10'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-ink-navy/8 flex gap-2">
                <button onClick={() => handleStatusChange(selected.id, 'cancellato')}
                  className="flex-1 text-sm text-ink-navy/60 font-medium py-2 border border-ink-navy/10 rounded-lg hover:bg-mist">
                  Annulla appuntamento
                </button>
                <button onClick={() => handleDelete(selected.id)}
                  className="w-10 flex items-center justify-center text-ink-navy/35 py-2 border border-ink-navy/10 rounded-lg hover:bg-red-50 hover:text-red-500">
                  <span className="w-3.5 h-3.5"><IconTrash /></span>
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal nuovo appuntamento */}
      {showNuovo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-ink-navy">
              Nuovo appuntamento — {showNuovo.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Paziente</label>
                <select value={form.pazienteId} onChange={e => setForm({ ...form, pazienteId: e.target.value })}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
                  <option value="">— Seleziona paziente esistente —</option>
                  {pazienti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              {!form.pazienteId && (
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Oppure nome (paziente non censito)</label>
                  <input value={form.clienteNome} onChange={e => setForm({ ...form, clienteNome: e.target.value })}
                    placeholder="Mario Rossi"
                    className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Ora</label>
                  <input type="time" value={form.ora} onChange={e => setForm({ ...form, ora: e.target.value })}
                    className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Durata (min)</label>
                  <input type="number" value={form.durata} onChange={e => setForm({ ...form, durata: e.target.value })}
                    className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Tipo di seduta</label>
                <input value={form.servizio} onChange={e => setForm({ ...form, servizio: e.target.value })}
                  placeholder="Es. Terapia manuale, Valutazione..."
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note</label>
                <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowNuovo(null)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
              <button onClick={handleCreate} disabled={!form.pazienteId && !form.clienteNome.trim()}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 disabled:opacity-40">Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal orari del giorno */}
      {modalOrari && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-ink-navy">
              Orari — {modalOrari.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Fasce orarie disponibili</label>
              <input value={formOrariGiorno} onChange={e => setFormOrariGiorno(e.target.value)}
                placeholder="08:00-14:00, 16:00-18:00"
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              <p className="text-xs text-ink-navy/35 mt-1">Lascia vuoto per segnare la giornata come chiusa. Separa più fasce con una virgola.</p>
            </div>
            <div className="flex gap-3">
              {orarioEffettivo(modalOrari).override && (
                <button onClick={ripristinaOrarioStandard}
                  className="text-sm text-ink-navy/50 font-semibold px-3 hover:text-electric-blue">
                  Ripristina standard
                </button>
              )}
              <button onClick={() => setModalOrari(null)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
              <button onClick={salvaOrarioGiorno} className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90">Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

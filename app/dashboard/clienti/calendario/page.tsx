'use client'

import { useEffect, useState } from 'react'

const GIORNI_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const GIORNI_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

interface Slot { id: string; data: string; oraInizio: string; oraFine: string; durata: number }
interface Appuntamento { id: string; clienteNome?: string; clienteEmail?: string; servizio?: string; data: string; durata: number; status: string; note?: string; coperti?: number; allergie?: string; occasione?: string }

function addDays(date: Date, days: number) {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}
function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}
function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}
function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function generateWeeks(count = 52) {
  const weeks: Date[] = []
  const start = addDays(getMonday(new Date()), -28)
  for (let i = 0; i < count; i++) weeks.push(addDays(start, i * 7))
  return weeks
}

export default function Calendario() {
  const [tab, setTab] = useState<'calendario' | 'appuntamenti' | 'disponibilita'>('calendario')
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [showNuovo, setShowNuovo] = useState(false)
  const [selected, setSelected] = useState<Appuntamento | null>(null)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  // Calendario mensile
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })

  // Disponibilità settimanale
  const [dispWeek, setDispWeek] = useState(() => getMonday(new Date()))
  const [slotModal, setSlotModal] = useState<{ day: Date } | null>(null)
  const [slotForm, setSlotForm] = useState({ oraInizio: '09:00', oraFine: '18:00', durata: 60 })

  // Lista appuntamenti
  const [listaWeek, setListaWeek] = useState(() => getMonday(new Date()))
  const weeks = generateWeeks()

  const [formApp, setFormApp] = useState({ clienteNome: '', clienteEmail: '', servizio: '', data: '', ora: '', durata: 60, note: '', coperti: 1, allergie: '', occasione: '' })

  async function fetchAll() {
    const [a, s] = await Promise.all([
      fetch('/api/appuntamenti', { credentials: 'include', cache: 'no-store' }).then(r => r.json()),
      fetch('/api/slots', { credentials: 'include', cache: 'no-store' }).then(r => r.json()),
    ])
    setAppuntamenti(a.appuntamenti ?? [])
    setSlots(s.slots ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  async function handleSaveApp() {
    await fetch('/api/appuntamenti', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formApp, data: new Date(`${formApp.data}T${formApp.ora}`).toISOString() }),
    })
    setShowNuovo(false)
    setFormApp({ clienteNome: '', clienteEmail: '', servizio: '', data: '', ora: '', durata: 60, note: '', coperti: 1, allergie: '', occasione: '' })
    await fetchAll()
  }

  async function handleAddSlot() {
    if (!slotModal) return
    await fetch('/api/slots', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: slotModal.day.toISOString(), ...slotForm }),
    })
    setSlotModal(null)
    await fetchAll()
  }

  async function handleDeleteSlot(id: string) {
    await fetch('/api/slots', {
      method: 'DELETE', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchAll()
  }

  async function handleStatusApp(id: string, status: string) {
    await fetch(`/api/appuntamenti/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await fetchAll()
    setSelected(null)
  }

  async function handleDeleteApp(id: string) {
    await fetch(`/api/appuntamenti/${id}`, { method: 'DELETE', credentials: 'include' })
    await fetchAll()
    setSelected(null)
  }

  async function handleCancellaApp(app: Appuntamento) {
    // Segna appuntamento come cancellato
    await fetch(`/api/appuntamenti/${app.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancellato' }),
    })
    // Propaga cancellazione al lead (se ha email)
    if (app.clienteEmail) {
      await fetch('/api/leads/cancella', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: app.clienteEmail }),
      })
    }
    await fetchAll()
    setSelected(null)
  }

  const today = new Date()

  const STATUS_COLORS: Record<string, string> = {
    confermato: 'bg-green-100 text-green-700',
    cancellato: 'bg-red-100 text-red-600',
    completato: 'bg-gray-100 text-gray-600',
    no_show: 'bg-orange-100 text-orange-600',
  }

  // Slot indicizzati per data
  const slotsByDate = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    const k = toDateKey(new Date(s.data))
    if (!acc[k]) acc[k] = []
    acc[k].push(s)
    return acc
  }, {})

  // Appuntamenti indicizzati per data
  function appForDay(day: Date) {
    return appuntamenti.filter(a => isSameDay(new Date(a.data), day))
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  }

  // Griglia mensile
  function getMonthGrid() {
    const year = month.getFullYear(), m = month.getMonth()
    const firstDay = new Date(year, m, 1)
    const lastDay = new Date(year, m + 1, 0)
    const startOffset = (firstDay.getDay() + 6) % 7
    const cells: (Date | null)[] = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, m, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  const monthGrid = getMonthGrid()

  // Settimana disponibilità
  const dispWeekDays = Array.from({ length: 7 }, (_, i) => addDays(dispWeek, i))
  const dispWeekIndex = weeks.findIndex(w => isSameDay(w, dispWeek))

  // Appuntamenti settimana lista
  const listaWeekDays = Array.from({ length: 7 }, (_, i) => addDays(listaWeek, i))
  const listaWeekIndex = weeks.findIndex(w => isSameDay(w, listaWeek))
  const appSettimana = appuntamenti.filter(a => {
    const d = new Date(a.data)
    return d >= listaWeekDays[0] && d <= addDays(listaWeekDays[6], 1)
  }).sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendario</h1>
          <p className="text-gray-500 mt-0.5">{appuntamenti.filter(a => new Date(a.data) >= today && a.status !== 'cancellato').length} appuntamenti in programma</p>
        </div>
        <button onClick={() => setShowNuovo(true)}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          + Nuovo appuntamento
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {([['calendario', '📅 Mese'], ['appuntamenti', '🗓️ Lista'], ['disponibilita', '⏰ Disponibilità']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-center text-gray-400 py-12">Caricamento...</div> : (
        <>
          {/* ── TAB MESE ── */}
          {tab === 'calendario' && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  className="text-gray-500 hover:text-gray-900 px-3 py-1 rounded hover:bg-gray-200">← Prec.</button>
                <span className="text-base font-bold text-gray-800">{MESI[month.getMonth()]} {month.getFullYear()}</span>
                <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  className="text-gray-500 hover:text-gray-900 px-3 py-1 rounded hover:bg-gray-200">Succ. →</button>
              </div>
              <div className="grid grid-cols-7 border-b border-gray-200">
                {GIORNI_SHORT.map(g => <div key={g} className="text-center py-2 text-xs font-semibold text-gray-400 uppercase">{g}</div>)}
              </div>
              <div className="grid grid-cols-7 divide-x divide-gray-100">
                {monthGrid.map((day, i) => {
                  if (!day) return <div key={i} className="min-h-20 bg-gray-50/50 border-b border-gray-100" />
                  const k = toDateKey(day)
                  const daySlots = slotsByDate[k] ?? []
                  const dayApps = appForDay(day)
                  const isT = isSameDay(day, today)
                  const isPast = day < today && !isT
                  const confermati = dayApps.filter(a => a.status === 'confermato').length
                  const completati = dayApps.filter(a => a.status === 'completato').length
                  const cancellati = dayApps.filter(a => a.status === 'cancellato').length
                  const hasEvents = daySlots.length > 0 || dayApps.length > 0
                  return (
                    <div key={i} onClick={() => hasEvents && setSelectedDay(day)}
                      className={`min-h-20 p-1.5 border-b border-gray-100 transition-colors ${isT ? 'bg-indigo-50' : isPast ? 'bg-gray-50/40' : ''} ${hasEvents ? 'cursor-pointer hover:bg-indigo-50/60' : ''}`}>
                      <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mb-1 ${isT ? 'bg-indigo-600 text-white' : isPast ? 'text-gray-300' : 'text-gray-600'}`}>
                        {day.getDate()}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {daySlots.length > 0 && (
                          <span className="text-xs bg-green-100 text-green-700 rounded px-1 py-0.5 font-medium leading-tight">
                            🟢 {daySlots.length} slot
                          </span>
                        )}
                        {confermati > 0 && (
                          <span className="text-xs bg-indigo-100 text-indigo-700 rounded px-1 py-0.5 font-medium leading-tight">
                            📅 {confermati} prenotat{confermati === 1 ? 'o' : 'i'}
                          </span>
                        )}
                        {completati > 0 && (
                          <span className="text-xs bg-gray-100 text-gray-500 rounded px-1 py-0.5 font-medium leading-tight">
                            ✓ {completati} completat{completati === 1 ? 'o' : 'i'}
                          </span>
                        )}
                        {cancellati > 0 && (
                          <span className="text-xs bg-red-50 text-red-400 rounded px-1 py-0.5 font-medium leading-tight">
                            ✕ {cancellati} cancellat{cancellati === 1 ? 'o' : 'i'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-green-100 rounded inline-block"></span> Slot disponibile</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-100 rounded inline-block"></span> Prenotato</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-gray-100 rounded inline-block"></span> Completato</span>
              </div>
            </div>
          )}

          {/* ── TAB LISTA ── */}
          {tab === 'appuntamenti' && (
            <div className="space-y-4">
              {/* Selettore settimana */}
              <div className="flex items-center gap-3">
                <button onClick={() => setListaWeek(d => addDays(d, -7))}
                  className="text-sm text-gray-500 hover:text-gray-900 px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50">← Prec.</button>
                <select value={listaWeekIndex >= 0 ? listaWeekIndex : ''}
                  onChange={e => setListaWeek(weeks[Number(e.target.value)])}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {weeks.map((w, i) => (
                    <option key={i} value={i}>
                      {w.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – {addDays(w, 6).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </option>
                  ))}
                </select>
                <button onClick={() => setListaWeek(d => addDays(d, 7))}
                  className="text-sm text-gray-500 hover:text-gray-900 px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50">Succ. →</button>
              </div>

              {appSettimana.length === 0 ? (
                <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-400">
                  <p className="font-medium">Nessun appuntamento questa settimana</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {listaWeekDays.map((day, di) => {
                    const dayApps = appSettimana.filter(a => isSameDay(new Date(a.data), day))
                    if (dayApps.length === 0) return null
                    return (
                      <div key={di}>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 mt-3 first:mt-0">
                          {GIORNI_FULL[day.getDay()]} {day.getDate()} {MESI[day.getMonth()]}
                        </p>
                        {dayApps.map(a => (
                          <div key={a.id} onClick={() => setSelected(a)}
                            className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 cursor-pointer hover:shadow-sm transition-shadow mb-2">
                            <div className="bg-indigo-50 rounded-lg p-2 text-center min-w-14">
                              <p className="text-xs text-indigo-500 font-medium">{new Date(a.data).toLocaleDateString('it-IT', { month: 'short' }).toUpperCase()}</p>
                              <p className="text-xl font-bold text-indigo-700">{new Date(a.data).getDate()}</p>
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900">{a.clienteNome || 'Cliente'}</p>
                              <p className="text-sm text-gray-500">{a.servizio} · {new Date(a.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · {a.durata} min</p>
                            </div>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[a.status]}`}>{a.status}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB DISPONIBILITÀ ── */}
          {tab === 'disponibilita' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Clicca su un giorno per aggiungere o rimuovere la tua disponibilità.</p>

              {/* Navigazione settimana */}
              <div className="flex items-center gap-3">
                <button onClick={() => setDispWeek(d => addDays(d, -7))}
                  className="text-sm text-gray-500 hover:text-gray-900 px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50">← Prec.</button>
                <select value={dispWeekIndex >= 0 ? dispWeekIndex : ''}
                  onChange={e => setDispWeek(weeks[Number(e.target.value)])}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {weeks.map((w, i) => (
                    <option key={i} value={i}>
                      {w.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – {addDays(w, 6).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </option>
                  ))}
                </select>
                <button onClick={() => setDispWeek(d => addDays(d, 7))}
                  className="text-sm text-gray-500 hover:text-gray-900 px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50">Succ. →</button>
              </div>

              {/* Griglia giorni cliccabili */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {dispWeekDays.map((day, i) => {
                  const k = toDateKey(day)
                  const daySlots = slotsByDate[k] ?? []
                  const dayApps = appForDay(day)
                  const isT = isSameDay(day, today)
                  const isPast = day < today && !isT

                  return (
                    <div key={i} className={`flex items-start px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''} ${isT ? 'bg-indigo-50' : isPast ? 'bg-gray-50/50' : ''}`}>
                      {/* Giorno */}
                      <div className="w-40 shrink-0 pt-0.5">
                        <p className={`text-sm font-semibold ${isT ? 'text-indigo-700' : isPast ? 'text-gray-300' : 'text-gray-700'}`}>
                          {GIORNI_FULL[day.getDay()]} {day.getDate()}
                        </p>
                        <p className={`text-xs ${isT ? 'text-indigo-400' : 'text-gray-400'}`}>
                          {day.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                          {isT && ' · Oggi'}
                        </p>
                      </div>

                      {/* Slot e appuntamenti */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-2">
                          {daySlots.map(s => (
                            <div key={s.id} className="flex items-center gap-1 bg-green-50 text-green-700 text-xs px-2 py-1 rounded-full font-medium">
                              {s.oraInizio}–{s.oraFine} ({s.durata} min)
                              <button onClick={() => handleDeleteSlot(s.id)} className="ml-1 text-green-400 hover:text-red-500 font-bold">×</button>
                            </div>
                          ))}
                          {!isPast && (
                            <button onClick={() => { setSlotModal({ day }); setSlotForm({ oraInizio: '09:00', oraFine: '18:00', durata: 60 }) }}
                              className="text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 border border-dashed border-indigo-300 rounded-full hover:border-indigo-500 transition-colors">
                              + Aggiungi disponibilità
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal dettaglio giornata */}
      {selectedDay && (() => {
        const k = toDateKey(selectedDay)
        const daySlots = slotsByDate[k] ?? []
        const dayApps = appForDay(selectedDay)
        const totaleCoperti = dayApps.filter(a => a.status === 'confermato').reduce((sum, a) => sum + (a.coperti ?? 1), 0)
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: '80vh' }}>
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900">{GIORNI_FULL[selectedDay.getDay()]}, {selectedDay.getDate()} {MESI[selectedDay.getMonth()]} {selectedDay.getFullYear()}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-sm text-indigo-600 font-medium">{dayApps.filter(a => a.status === 'confermato').length} prenotazioni</span>
                    {totaleCoperti > 0 && (
                      <span className="text-sm text-orange-600 font-semibold">🪑 {totaleCoperti} coperti totali</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedDay(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-3">
                {daySlots.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Disponibilità</p>
                    {daySlots.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-green-600 text-sm">🕐</span>
                          <span className="text-sm font-medium text-green-700">{s.oraInizio}–{s.oraFine}</span>
                          <span className="text-xs text-green-500">({s.durata} min)</span>
                        </div>
                        <button onClick={() => { handleDeleteSlot(s.id); setSelectedDay(null) }}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 border border-red-200 rounded hover:bg-red-50">
                          Rimuovi
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {dayApps.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Appuntamenti</p>
                    {dayApps.map(a => (
                      <div key={a.id} onClick={() => { setSelected(a); setSelectedDay(null) }}
                        className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 mb-2 cursor-pointer hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-gray-800">
                            🕐 {new Date(a.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} — {a.clienteNome || 'Cliente'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[a.status] || 'bg-gray-100 text-gray-500'}`}>
                            {a.status === 'no_show' ? 'No-show' : a.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{a.servizio || 'Appuntamento'}</span>
                          {(a.coperti ?? 1) > 1 && <span className="text-orange-500 font-medium">🪑 {a.coperti} persone</span>}
                          {a.allergie && <span className="text-red-400">⚠️ {a.allergie}</span>}
                          {a.occasione && <span className="text-purple-400">🎉 {a.occasione}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {daySlots.length === 0 && dayApps.length === 0 && (
                  <p className="text-center text-gray-400 py-6 text-sm">Nessun evento in questa giornata</p>
                )}
              </div>
              <div className="px-5 py-3 border-t border-gray-100">
                <button onClick={() => { setShowNuovo(true); setSelectedDay(null) }}
                  className="w-full text-sm bg-indigo-600 text-white font-semibold py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                  + Nuovo appuntamento
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
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Nuovo appuntamento</h2>
              <button onClick={() => setShowNuovo(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome cliente</label>
                  <input type="text" placeholder="Mario Rossi" value={formApp.clienteNome}
                    onChange={e => setFormApp({ ...formApp, clienteNome: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" placeholder="mario@email.com" value={formApp.clienteEmail}
                    onChange={e => setFormApp({ ...formApp, clienteEmail: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Servizio / tipo</label>
                  <input type="text" placeholder="Prenotazione tavolo" value={formApp.servizio}
                    onChange={e => setFormApp({ ...formApp, servizio: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">N° persone</label>
                  <input type="number" min={1} value={formApp.coperti}
                    onChange={e => setFormApp({ ...formApp, coperti: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                  <input type="date" value={formApp.data} onChange={e => setFormApp({ ...formApp, data: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ora</label>
                  <input type="time" value={formApp.ora} onChange={e => setFormApp({ ...formApp, ora: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allergie</label>
                  <input type="text" placeholder="nessuna" value={formApp.allergie}
                    onChange={e => setFormApp({ ...formApp, allergie: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Occasione</label>
                  <input type="text" placeholder="compleanno, lavoro…" value={formApp.occasione}
                    onChange={e => setFormApp({ ...formApp, occasione: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Durata</label>
                <select value={formApp.durata} onChange={e => setFormApp({ ...formApp, durata: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {[30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} minuti</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <textarea value={formApp.note} onChange={e => setFormApp({ ...formApp, note: e.target.value })}
                  rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowNuovo(false)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50">Annulla</button>
              <button onClick={handleSaveApp} disabled={!formApp.clienteNome || !formApp.data || !formApp.ora}
                className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-40">Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal aggiungi slot disponibilità */}
      {slotModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Aggiungi disponibilità</h2>
                <p className="text-sm text-indigo-600 font-medium">
                  {GIORNI_FULL[slotModal.day.getDay()]} {slotModal.day.getDate()} {MESI[slotModal.day.getMonth()]}
                </p>
              </div>
              <button onClick={() => setSlotModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dalle</label>
                <input type="time" value={slotForm.oraInizio} onChange={e => setSlotForm({ ...slotForm, oraInizio: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alle</label>
                <input type="time" value={slotForm.oraFine} onChange={e => setSlotForm({ ...slotForm, oraFine: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durata appuntamento</label>
              <select value={slotForm.durata} onChange={e => setSlotForm({ ...slotForm, durata: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {[30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} minuti</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSlotModal(null)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50">Annulla</button>
              <button onClick={handleAddSlot} className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-lg hover:bg-indigo-700">Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Dettaglio appuntamento */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: '85vh' }}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">{selected.clienteNome || 'Appuntamento'}</h2>
                {selected.clienteEmail && <p className="text-xs text-gray-400">{selected.clienteEmail}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl mt-1">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Info principali */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Prenotazione</p>
                <p className="text-sm font-medium text-indigo-900">
                  📅 {GIORNI_FULL[new Date(selected.data).getDay()]} {new Date(selected.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })} alle {new Date(selected.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                </p>
                {selected.servizio && <p className="text-sm text-indigo-700">{selected.servizio} · {selected.durata} min</p>}
                {(selected.coperti ?? 1) > 0 && <p className="text-sm text-indigo-700">🪑 {selected.coperti ?? 1} {(selected.coperti ?? 1) === 1 ? 'persona' : 'persone'}</p>}
                {selected.allergie && <p className="text-sm text-red-600">⚠️ Allergie: {selected.allergie}</p>}
                {selected.occasione && <p className="text-sm text-purple-600">🎉 Occasione: {selected.occasione}</p>}
                {selected.note && <p className="text-xs text-indigo-500 mt-1">{selected.note}</p>}
              </div>
              {/* Stato */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Aggiorna stato</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'confermato', label: '✓ Confermato' },
                    { key: 'completato', label: '✅ Completato' },
                    { key: 'no_show', label: '👻 No-show' },
                    { key: 'cancellato', label: '✕ Cancellato' },
                  ].map(({ key, label }) => (
                    <button key={key} onClick={() => handleStatusApp(selected.id, key)}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${selected.status === key ? STATUS_COLORS[key] ?? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
              {selected.status !== 'cancellato' && (
                <button onClick={() => handleCancellaApp(selected)}
                  className="flex-1 text-sm text-red-500 font-medium py-2 border border-red-200 rounded-lg hover:bg-red-50">
                  ✕ Cancella cliente
                </button>
              )}
              <button onClick={() => handleDeleteApp(selected.id)}
                className="text-sm text-gray-400 font-medium py-2 px-3 border border-gray-200 rounded-lg hover:bg-gray-50" title="Elimina definitivamente">
                🗑️
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

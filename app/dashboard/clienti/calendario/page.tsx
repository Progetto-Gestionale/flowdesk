'use client'

import { useEffect, useState } from 'react'
import { IconTrash } from '../../../components/icons'

const GIORNI_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const GIORNI_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

const PX_PER_HOUR = 80

function parseOrariRange(orariApertura: Record<string, string>): { start: number; end: number } {
  let minH = 24, maxH = 0
  Object.values(orariApertura).forEach(v => {
    if (!v) return
    // Supporta formati: "12:00-23:00", "12:00 - 23:00", "12:00–23:00"
    const parts = v.split(/[-–]/).map(s => s.trim())
    if (parts.length < 2) return
    const openH = parseInt(parts[0])
    let closeH = parseInt(parts[1])
    if (isNaN(openH) || isNaN(closeH)) return
    // 00:00 e 24:00 sono entrambi mezzanotte = fine giornata
    if (closeH === 0 || closeH === 24) closeH = 24
    if (openH === 0 && closeH === 0) return // giorno chiuso scritto male
    if (openH < minH) minH = openH
    if (closeH > maxH) maxH = closeH
  })
  if (minH === 24 || maxH === 0) return { start: 11, end: 24 }
  return { start: Math.max(0, minH - 1), end: Math.min(24, maxH) }
}

const TIPO_STYLE: Record<string, { barColor: string; bg: string; text: string; badge: string; label: string }> = {
  tavolo:   { barColor: '#f97316', bg: 'bg-orange-50',  text: 'text-orange-900',  badge: 'bg-orange-100 text-orange-700',  label: 'Tavolo'   },
  ordine:   { barColor: '#8b5cf6', bg: 'bg-violet-50',  text: 'text-violet-900',  badge: 'bg-violet-100 text-violet-700',  label: 'Asporto'  },
  delivery: { barColor: '#14b8a6', bg: 'bg-teal-50',    text: 'text-teal-900',    badge: 'bg-teal-100 text-teal-700',      label: 'Delivery' },
  servizio: { barColor: '#0ea5e9', bg: 'bg-sky-50',     text: 'text-sky-900',     badge: 'bg-sky-100 text-sky-700',        label: 'Servizio' },
}

function inferTipo(servizio?: string): keyof typeof TIPO_STYLE {
  const s = (servizio ?? '').toLowerCase()
  if (/delivery|consegna|domicilio/.test(s)) return 'delivery'
  if (/asporto|take away|takeaway|ordine/.test(s)) return 'ordine'
  if (/tavolo|prenotazione|cena|pranzo|sala|ristorazione/.test(s)) return 'tavolo'
  return 'servizio'
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  confermato: { bg: 'bg-electric-blue/15', text: 'text-electric-blue', dot: 'bg-electric-blue' },
  completato: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  no_show:    { bg: 'bg-orange-100',  text: 'text-orange-600',  dot: 'bg-orange-400'  },
  cancellato: { bg: 'bg-red-100',     text: 'text-red-500',     dot: 'bg-red-400'     },
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
  coperti?: number
  allergie?: string
  occasione?: string
  tavoloId?: string | null
  tavoliIds?: string | null
}

interface Tavolo {
  id: string
  numero: number
  posti: number
  note: string | null
}

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
function layoutApps(apps: Appuntamento[]) {
  if (apps.length === 0) return []
  const sorted = [...apps].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  const colEnds: number[] = []
  const assigned = sorted.map(a => {
    const start = new Date(a.data).getTime()
    const end = start + a.durata * 60000
    let col = colEnds.findIndex(e => e <= start)
    if (col === -1) col = colEnds.length
    colEnds[col] = end
    return { a, col }
  })
  return assigned.map(({ a, col }) => {
    const start = new Date(a.data).getTime()
    const end = start + a.durata * 60000
    const concurrent = assigned.filter(({ a: b }) => {
      const bs = new Date(b.data).getTime()
      return bs < end && bs + b.durata * 60000 > start
    })
    const total = Math.max(...concurrent.map(c => c.col)) + 1
    return { a, col, total }
  })
}

function getTavoliIds(a: Appuntamento): string[] {
  try { return a.tavoliIds ? JSON.parse(a.tavoliIds) : (a.tavoloId ? [a.tavoloId] : []) }
  catch { return a.tavoloId ? [a.tavoloId] : [] }
}

export default function Calendario() {
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Appuntamento | null>(null)
  const [showNuovo, setShowNuovo] = useState(false)
  const [vistaMessile, setVistaMensile] = useState(false)
  const [viewDay, setViewDay] = useState<Date | null>(null)
  const [sezione, setSezione] = useState<'tavoli' | 'servizi'>('tavoli')

  const [miniMonth, setMiniMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [tavoli, setTavoli] = useState<Tavolo[]>([])
  const [formApp, setFormApp] = useState({ clienteNome: '', clienteEmail: '', servizio: '', data: '', ora: '20:00', durata: 120, note: '', coperti: 2, allergie: '', occasione: '', tavoloId: '' })
  const [selectedTavoliIds, setSelectedTavoliIds] = useState<string[]>([])
  const [assegnaLoading, setAssegnaLoading] = useState(false)
  const [hourStart, setHourStart] = useState(11)
  const [hourEnd, setHourEnd] = useState(24)

  const today = new Date()
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  async function fetchAll() {
    const [resApp, resTavoli, resSettings] = await Promise.all([
      fetch('/api/appuntamenti', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/tavoli', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/settings', { credentials: 'include' }),
    ])
    setAppuntamenti((await resApp.json()).appuntamenti ?? [])
    setTavoli((await resTavoli.json()).tavoli ?? [])
    const settings = await resSettings.json()
    if (settings.orariApertura) {
      try {
        const orari: Record<string, string> = JSON.parse(settings.orariApertura)
        const { start, end } = parseOrariRange(orari)
        setHourStart(start)
        setHourEnd(end)
      } catch { /* usa default */ }
    }
  }

  useEffect(() => {
    fetchAll().finally(() => setLoading(false))
    const interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  }, [])

  function appForDay(day: Date) {
    return appuntamenti
      .filter(a => isSameDay(new Date(a.data), day))
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  }
  function hasApp(day: Date) {
    return appuntamenti.some(a => isSameDay(new Date(a.data), day) && a.status !== 'cancellato')
  }
  function getMiniMonthGrid() {
    const year = miniMonth.getFullYear(), m = miniMonth.getMonth()
    const firstDay = new Date(year, m, 1)
    const lastDay = new Date(year, m + 1, 0)
    const startOffset = (firstDay.getDay() + 6) % 7
    const cells: (Date | null)[] = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, m, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }
  function jumpToDay(day: Date) {
    setWeekStart(getMonday(day))
  }

  async function handleSaveApp() {
    let tavoliIdsForPost: string[] = []
    let tavoloIdForPost = ''
    try {
      const parsed = JSON.parse(formApp.tavoloId)
      if (Array.isArray(parsed)) { tavoliIdsForPost = parsed; tavoloIdForPost = parsed.length === 1 ? parsed[0] : '' }
      else { tavoloIdForPost = formApp.tavoloId }
    } catch { tavoloIdForPost = formApp.tavoloId }

    const payload = { ...formApp, tavoloId: tavoloIdForPost || null, data: new Date(`${formApp.data}T${formApp.ora}`).toISOString() }

    const res = await fetch('/api/appuntamenti', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok && tavoliIdsForPost.length >= 2) {
      const created = await res.json()
      if (created.appuntamento?.id) {
        await fetch(`/api/appuntamenti/${created.appuntamento.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tavoliIds: tavoliIdsForPost }),
        })
      }
    }
    setShowNuovo(false)
    setFormApp({ clienteNome: '', clienteEmail: '', servizio: '', data: '', ora: '20:00', durata: 120, note: '', coperti: 2, allergie: '', occasione: '', tavoloId: '' })
    await fetchAll()
  }

  async function handleStatusApp(id: string, status: string) {
    const app = appuntamenti.find(a => a.id === id)
    await fetch(`/api/appuntamenti/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await fetchAll()
    setSelected(prev => prev ? { ...prev, status } : null)
  }

  async function handleAssegnaTavoli(id: string, ids: string[]) {
    setAssegnaLoading(true)
    try {
      const res = await fetch(`/api/appuntamenti/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tavoliIds: ids }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.conflitto ? 'Uno dei tavoli è già occupato in questo orario.' : 'Errore nel salvataggio. Riprova.')
      } else {
        await fetchAll()
        setSelected(prev => prev ? { ...prev, tavoliIds: JSON.stringify(ids), tavoloId: ids.length === 1 ? ids[0] : null } : null)
      }
    } finally { setAssegnaLoading(false) }
  }

  async function handleDeleteApp(id: string) {
    await fetch(`/api/appuntamenti/${id}`, { method: 'DELETE', credentials: 'include' })
    await fetchAll()
    setSelected(null)
  }

  function openNuovoConData(day: Date) {
    const iso = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`
    const defaults = sezione === 'tavoli'
      ? { servizio: 'Prenotazione tavolo', durata: 90, ora: '20:00', coperti: 2 }
      : { servizio: '', durata: 15, ora: '10:00', coperti: 1 }
    setFormApp(f => ({ ...f, data: iso, tavoloId: '', allergie: '', occasione: '', note: '', clienteNome: '', clienteEmail: '', ...defaults }))
    setShowNuovo(true)
  }

  const miniGrid = getMiniMonthGrid()
  const weekLabel = (() => {
    const fine = addDays(weekStart, 6)
    if (weekStart.getMonth() === fine.getMonth())
      return `${weekStart.getDate()}–${fine.getDate()} ${MESI[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    return `${weekStart.getDate()} ${MESI[weekStart.getMonth()]} – ${fine.getDate()} ${MESI[fine.getMonth()]} ${fine.getFullYear()}`
  })()
  const sezioneInfo = {
    tavoli:  { label: 'Tavoli',           tipi: ['tavolo'] as string[] },
    servizi: { label: 'Servizi / Altro',  tipi: ['servizio', 'ordine', 'delivery'] as string[] },
  }

  function filterBySezione(apps: Appuntamento[]) {
    const tipi = sezioneInfo[sezione].tipi
    return apps.filter(a => tipi.includes(inferTipo(a.servizio)))
  }

  function appForDayFiltered(day: Date) {
    return filterBySezione(appForDay(day))
  }

  const appProssimi = filterBySezione(appuntamenti).filter(a => new Date(a.data) >= today && a.status === 'confermato').length

  // ── Day view columns ──────────────────────────────────────
  const buildColumns = (day: Date) => {
    const dayApps = appForDayFiltered(day)
    // Solo per tavoli mostriamo colonne per tavolo
    if (sezione === 'tavoli' && tavoli.length > 0) {
      const tavoloOrdinato = [...tavoli].sort((a, b) => a.numero - b.numero)
      const tavoloIds = new Set(tavoloOrdinato.map(t => t.id))
      const senzaTavolo: Appuntamento[] = []

      const cols = tavoloOrdinato.map(t => {
        const primaryApps: Appuntamento[] = []
        const ghostApps: (Appuntamento & { ghost: true; primaryTavolo: string })[] = []
        dayApps.forEach(a => {
          const ids = getTavoliIds(a)
          if (!ids.includes(t.id)) return
          const firstId = tavoloOrdinato.find(tv => ids.includes(tv.id))?.id
          if (firstId === t.id) primaryApps.push(a)
          else ghostApps.push({ ...a, ghost: true, primaryTavolo: `T${tavoloOrdinato.find(tv => tv.id === firstId)?.numero ?? '?'}` })
        })
        return { id: t.id, label: `T${t.numero}`, sublabel: `${t.posti} posti${t.note ? ` · ${t.note}` : ''}`, apps: primaryApps, ghostApps }
      })

      // Raccogli appuntamenti senza tavolo o con tavoli eliminati
      dayApps.forEach(a => {
        const ids = getTavoliIds(a)
        if (ids.length === 0 || !ids.some(id => tavoloIds.has(id))) {
          senzaTavolo.push(a)
        }
      })
      if (senzaTavolo.length > 0) {
        cols.unshift({ id: '__nessun_tavolo__', label: 'Non assegnati', sublabel: 'da assegnare', apps: senzaTavolo, ghostApps: [] })
      }

      return cols
    }
    return [{ id: 'all', label: sezioneInfo[sezione].label, sublabel: '', apps: dayApps }]
  }

  const hoursGrid = Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i)
  const fmtHour = (h: number) => h >= 24 ? '00:00' : `${String(h).padStart(2, '0')}:00`

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-navy">Calendario</h1>
          <p className="text-ink-navy/50 mt-0.5">
            {appProssimi > 0
              ? <span className="text-electric-blue font-medium">{appProssimi} {sezione === 'tavoli' ? 'prenotazioni' : 'appuntamenti'} in programma</span>
              : 'Nessuno in programma'}
          </p>
        </div>
        <button onClick={() => openNuovoConData(today)}
          className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90">
          {sezione === 'tavoli' ? '+ Prenota tavolo' : '+ Nuovo servizio'}
        </button>
      </div>

      {/* Tab sezioni */}
      {(() => {
        const tabs = (Object.keys(sezioneInfo) as (typeof sezione)[]).map(key => ({
          key,
          label: sezioneInfo[key].label,
          count: appuntamenti.filter(a =>
            sezioneInfo[key].tipi.includes(inferTipo(a.servizio)) &&
            isSameDay(new Date(a.data), today) &&
            a.status === 'confermato'
          ).length,
        }))
        return (
          <div className="flex gap-1 bg-mist rounded-xl p-1 mb-5 w-fit">
            {tabs.map(({ key, label, count }) => (
              <button key={key} onClick={() => { setSezione(key); setViewDay(null) }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  sezione === key ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'
                }`}>
                {label}
                {count > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${sezione === key ? 'bg-electric-blue/15 text-electric-blue' : 'bg-ink-navy/10 text-ink-navy/40'}`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )
      })()}

      {loading ? <div className="text-center text-ink-navy/35 py-12">Caricamento...</div> : (
        <div className="flex gap-5">

          {/* ── MINI CALENDARIO ── */}
          <div className="w-56 shrink-0 space-y-4">
            <div className="bg-white border border-ink-navy/10 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setMiniMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1))} className="text-ink-navy/35 hover:text-ink-navy/70 text-sm px-1">‹</button>
                <span className="text-xs font-semibold text-ink-navy/70">{MESI[miniMonth.getMonth()].slice(0,3)} {miniMonth.getFullYear()}</span>
                <button onClick={() => setMiniMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1))} className="text-ink-navy/35 hover:text-ink-navy/70 text-sm px-1">›</button>
              </div>
              <div className="grid grid-cols-7 mb-1">
                {GIORNI_SHORT.map(g => <div key={g} className="text-center text-[10px] font-semibold text-ink-navy/35">{g[0]}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {miniGrid.map((day, i) => {
                  if (!day) return <div key={i} />
                  const isToday = isSameDay(day, today)
                  const isInWeek = day >= weekStart && day <= addDays(weekStart, 6)
                  const isViewDay = viewDay ? isSameDay(day, viewDay) : false
                  const hasDot = hasApp(day)
                  return (
                    <button key={i} onClick={() => { jumpToDay(day); setViewDay(day) }}
                      className={`relative flex flex-col items-center justify-center h-7 rounded-md text-xs font-medium transition-colors ${
                        isViewDay ? 'bg-ink-navy text-white' :
                        isToday ? 'bg-electric-blue text-white' :
                        isInWeek ? 'bg-electric-blue/10 text-electric-blue' :
                        'text-ink-navy/60 hover:bg-mist'
                      }`}>
                      {day.getDate()}
                      {hasDot && !isToday && !isViewDay && (
                        <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${isInWeek ? 'bg-electric-blue' : 'bg-electric-blue/40'}`} />
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => { setWeekStart(getMonday(today)); setMiniMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setViewDay(null) }}
                  className="flex-1 text-xs text-electric-blue hover:text-ink-navy font-medium py-1 border border-electric-blue/25 rounded-lg hover:bg-electric-blue/10">
                  Oggi
                </button>
                <button onClick={() => setVistaMensile(true)}
                  className="flex-1 text-xs text-electric-blue hover:text-ink-navy font-medium py-1 border border-electric-blue/25 rounded-lg hover:bg-electric-blue/10">
                  Mese
                </button>
              </div>
            </div>

            {/* Legenda stati */}
            <div className="bg-white border border-ink-navy/10 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">Stato</p>
              {([ ['confermato','Confermato'], ['completato','Completato'], ['no_show','No-show'], ['cancellato','Cancellato'] ] as [string,string][]).map(([key, label]) => {
                const c = STATUS_COLORS[key]
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className={`w-7 h-4 rounded shrink-0 ${c.bg} border-l-2`} style={{ borderLeftColor: '#94a3b8' }} />
                    <span className="text-xs text-ink-navy/60">{label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── VISTA PRINCIPALE ── */}
          <div className="flex-1 min-w-0">

            {viewDay ? (
              /* ── DAY VIEW ── */
              (() => {
                const cols = buildColumns(viewDay)
                const dayLabel = `${GIORNI_FULL[viewDay.getDay()]} ${viewDay.getDate()} ${MESI[viewDay.getMonth()]} ${viewDay.getFullYear()}`
                const appsConfermati = appForDayFiltered(viewDay).filter(a => a.status === 'confermato')
                const totalCoperti = appsConfermati.reduce((s, a) => s + (a.coperti ?? 1), 0)
                const badgeCount = sezione === 'tavoli' ? totalCoperti : appsConfermati.length
                const badgeLabel = sezione === 'tavoli' ? 'coperti' : 'servizi'

                return (
                  <div>
                    {/* Nav giorno */}
                    <div className="flex items-center gap-3 mb-4">
                      <button onClick={() => setViewDay(null)}
                        className="text-sm text-ink-navy/50 hover:text-ink-navy px-3 py-1.5 border border-ink-navy/10 rounded-lg hover:bg-mist transition-colors">
                        ← Settimana
                      </button>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setViewDay(d => addDays(d!, -1))} className="text-ink-navy/35 hover:text-ink-navy/70 px-1.5 py-1 rounded hover:bg-mist">‹</button>
                        <span className="text-sm font-semibold text-ink-navy/70 capitalize">{dayLabel}</span>
                        <button onClick={() => setViewDay(d => addDays(d!, 1))} className="text-ink-navy/35 hover:text-ink-navy/70 px-1.5 py-1 rounded hover:bg-mist">›</button>
                      </div>
                      {badgeCount > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">{badgeCount} {badgeLabel}</span>
                      )}
                    </div>

                    {/* Lista semplice per servizi / altro */}
                    {sezione === 'servizi' && (() => {
                      const apps = appForDayFiltered(viewDay).sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
                      if (apps.length === 0) return (
                        <div className="bg-white border border-ink-navy/10 rounded-xl p-8 text-center text-ink-navy/35 text-sm">
                          Nessun appuntamento per oggi
                        </div>
                      )
                      return (
                        <div className="bg-white border border-ink-navy/10 rounded-xl overflow-y-auto space-y-2 p-3"
                          style={{ maxHeight: 'calc(100vh - 280px)' }}>
                          {apps.map(a => {
                            const tipo = inferTipo(a.servizio)
                            const ts = TIPO_STYLE[tipo]
                            const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.confermato
                            const ora = new Date(a.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                            const [noteOrdine, noteInterna] = (a.note ?? '').split('\n')
                            return (
                              <div key={a.id} onClick={() => setSelected(a)}
                                style={{ borderLeftWidth: 3, borderLeftColor: ts.barColor }}
                                className={`${sc.bg} rounded-r-xl px-3 py-2.5 cursor-pointer hover:brightness-95 transition-all`}>
                                <span className="text-xs font-bold text-ink-navy/50">{ora}</span>
                                <p className="text-sm font-bold text-ink-navy mt-0.5">{a.clienteNome || 'Cliente'}</p>
                                {a.servizio && <p className="text-xs text-ink-navy/50 mt-0.5 truncate">{a.servizio}</p>}
                                {noteOrdine && <p className="text-xs font-medium text-ink-navy/70 mt-1 truncate">{noteOrdine}</p>}
                                {a.allergie && a.allergie.toLowerCase() !== 'nessuna' && (
                                  <p className="text-xs text-red-500 mt-0.5">{a.allergie}</p>
                                )}
                                {noteInterna && <p className="text-xs text-ink-navy/35 mt-0.5 truncate">{noteInterna}</p>}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}

                    {/* Timeline grid — unico contenitore scroll (x+y) con sticky header e sticky ore — solo tavoli */}
                    {sezione === 'tavoli' && <div className="bg-white border border-ink-navy/10 rounded-xl overflow-auto"
                      style={{ maxHeight: 'calc(100vh - 280px)', minWidth: 0 }}>
                      <div style={{ minWidth: 56 + cols.length * 140 }}>

                        {/* Header sticky in alto */}
                        <div className="flex sticky top-0 z-20 border-b border-ink-navy/10">
                          {/* Angolo fisso top-left */}
                          <div className="w-14 shrink-0 sticky left-0 z-30 bg-mist border-r border-ink-navy/10" />
                          {cols.map(col => (
                            <div key={col.id} style={{ minWidth: 140 }}
                              className="flex-1 px-3 py-2 bg-mist border-r border-ink-navy/10 last:border-r-0">
                              <p className="text-xs font-bold text-ink-navy/70">{col.label}</p>
                              {col.sublabel && <p className="text-[10px] text-ink-navy/35">{col.sublabel}</p>}
                              {col.apps.length > 0 && (
                                <p className="text-[10px] text-electric-blue font-semibold mt-0.5">{col.apps.length} prenotaz.</p>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Body */}
                        <div className="flex">
                          {/* Colonna ore sticky a sinistra */}
                          <div className="w-14 shrink-0 sticky left-0 z-20 bg-white border-r border-ink-navy/10 relative"
                            style={{ height: (hourEnd - hourStart) * PX_PER_HOUR }}>
                            {hoursGrid.map(h => (
                              <div key={h} className="absolute left-0 right-0 flex items-start justify-end pr-2"
                                style={{ top: (h - hourStart) * PX_PER_HOUR }}>
                                <span className="text-[10px] font-semibold text-ink-navy/30 -mt-2">{fmtHour(h)}</span>
                              </div>
                            ))}
                          </div>

                          {/* Colonne appuntamenti */}
                          {cols.map(col => (
                            <div key={col.id} className="relative flex-1 border-r border-ink-navy/10 last:border-r-0"
                              style={{ minWidth: 140, height: (hourEnd - hourStart) * PX_PER_HOUR }}>
                            {/* Linee orarie */}
                            {hoursGrid.map(h => (
                              <div key={h}>
                                <div className="absolute left-0 right-0 border-t border-ink-navy/8"
                                  style={{ top: (h - hourStart) * PX_PER_HOUR }} />
                                <div className="absolute left-0 right-0 border-t border-dashed border-ink-navy/5"
                                  style={{ top: (h - hourStart) * PX_PER_HOUR + PX_PER_HOUR / 2 }} />
                              </div>
                            ))}

                            {/* Prenotazioni primarie */}
                            {layoutApps(col.apps).map(({ a, col: subCol, total }) => {
                              const tipo = inferTipo(a.servizio)
                              const ts = TIPO_STYLE[tipo]
                              const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.confermato
                              const dt = new Date(a.data)
                              const startH = dt.getHours() + dt.getMinutes() / 60
                              const top = Math.max(0, (startH - hourStart) * PX_PER_HOUR)
                              const height = Math.max((a.durata / 60) * PX_PER_HOUR, 28)
                              const ora = dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                              const pct = 100 / total
                              const GAP = 2
                              const MIN_H = 32
                              const linkedTavoli = tavoli.filter(t => getTavoliIds(a).includes(t.id)).sort((x,y) => x.numero - y.numero)
                              return (
                                <div key={a.id}
                                  style={{
                                    position: 'absolute', top,
                                    height: Math.max((a.durata / 60) * PX_PER_HOUR, MIN_H) - 2,
                                    left: `calc(${subCol * pct}% + ${GAP}px)`,
                                    width: `calc(${pct}% - ${GAP * 2}px)`,
                                    borderLeftWidth: 3, borderLeftColor: ts.barColor,
                                  }}
                                  onClick={() => setSelected(a)}
                                  className={`${sc.bg} rounded-r-lg px-1.5 py-1 cursor-pointer hover:brightness-95 transition-all overflow-hidden z-10`}>
                                  {height <= MIN_H + 4 ? (
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className="text-[10px] font-bold text-ink-navy/40 shrink-0">{ora}</span>
                                      <p className="text-[10px] font-bold leading-tight truncate text-ink-navy">{a.clienteNome || 'Cliente'}</p>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="text-[10px] font-bold text-ink-navy/40">{ora}</span>
                                      <p className="text-[11px] font-bold leading-tight truncate text-ink-navy">{a.clienteNome || 'Cliente'}</p>
                                      {height > 58 && <p className="text-[10px] opacity-55 truncate mt-0.5">
                                        {linkedTavoli.length > 1 ? linkedTavoli.map(t=>`T${t.numero}`).join('+') : ts.label}
                                        {a.coperti && a.coperti > 1 ? ` · ${a.coperti}p` : ''}
                                      </p>}
                                      {height > 76 && a.allergie && a.allergie.toLowerCase() !== 'nessuna' && (
                                        <p className="text-[10px] text-red-500 truncate">{a.allergie}</p>
                                      )}
                                    </>
                                  )}
                                </div>
                              )
                            })}

                            {/* Ghost: tavoli secondari di una prenotazione multi-tavolo */}
                            {('ghostApps' in col ? col.ghostApps as (Appuntamento & { ghost: true; primaryTavolo: string })[] : []).map(a => {
                              const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.confermato
                              const dt = new Date(a.data)
                              const startH = dt.getHours() + dt.getMinutes() / 60
                              const top = Math.max(0, (startH - hourStart) * PX_PER_HOUR)
                              const height = Math.max((a.durata / 60) * PX_PER_HOUR, 28)
                              return (
                                <div key={`ghost-${a.id}`}
                                  style={{
                                    position: 'absolute', top, height,
                                    left: `calc(2px)`, width: `calc(100% - 4px)`,
                                    borderLeftWidth: 3, borderLeftColor: '#94a3b8',
                                  }}
                                  onClick={() => setSelected(a)}
                                  className={`${sc.bg} opacity-40 rounded-r-lg px-1.5 py-1 cursor-pointer hover:opacity-60 transition-all overflow-hidden z-10`}>
                                  {height <= 36 ? (
                                    <p className="text-[10px] font-bold text-ink-navy/60 truncate">↑ {a.primaryTavolo}</p>
                                  ) : (
                                    <>
                                      <p className="text-[10px] font-bold text-ink-navy/60">↑ {a.primaryTavolo}</p>
                                      <p className="text-[10px] text-ink-navy/40 truncate">{a.clienteNome || 'Cliente'}</p>
                                    </>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ))}
                        </div>{/* fine Body */}
                      </div>{/* fine min-width wrapper */}
                    </div>}
                  </div>
                )
              })()
            ) : (
              /* ── WEEK VIEW ── */
              <div>
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setWeekStart(d => addDays(d, -7))}
                    className="text-sm text-ink-navy/50 hover:text-ink-navy px-3 py-1.5 border border-ink-navy/10 rounded-lg hover:bg-mist transition-colors">
                    ← Prec.
                  </button>
                  <span className="text-sm font-semibold text-ink-navy/70">{weekLabel}</span>
                  <button onClick={() => setWeekStart(d => addDays(d, 7))}
                    className="text-sm text-ink-navy/50 hover:text-ink-navy px-3 py-1.5 border border-ink-navy/10 rounded-lg hover:bg-mist transition-colors">
                    Succ. →
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((day, di) => {
                    const dayApps = appForDayFiltered(day)
                    const isT = isSameDay(day, today)
                    const isPast = day < today && !isT

                    // Contatori per sezione
                    const nTavoli   = dayApps.filter(a => inferTipo(a.servizio) === 'tavolo').length
                    const nServizi  = dayApps.length - nTavoli

                    const chips: { label: string; color: string }[] = []
                    if (sezione === 'tavoli' && nTavoli > 0)
                      chips.push({ label: `${nTavoli} tav.`, color: TIPO_STYLE.tavolo.barColor })
                    if (sezione === 'servizi' && nServizi > 0)
                      chips.push({ label: `${nServizi} serv.`, color: TIPO_STYLE.servizio.barColor })

                    return (
                      <div key={di} onClick={() => setViewDay(day)}
                        className={`min-h-28 rounded-xl cursor-pointer transition-colors border flex flex-col ${
                          isT ? 'bg-electric-blue border-electric-blue text-white' :
                          isPast ? 'bg-mist border-ink-navy/8 text-ink-navy/35' :
                          dayApps.length > 0 ? 'bg-white border-electric-blue/20 hover:border-electric-blue/50 hover:bg-electric-blue/5' :
                          'bg-white border-ink-navy/8 hover:bg-mist'
                        }`}>
                        <div className="px-2 pt-2 pb-1 text-center border-b border-ink-navy/8">
                          <p className={`text-[10px] font-semibold uppercase tracking-wider ${isT ? 'text-white/70' : 'text-ink-navy/40'}`}>{GIORNI_SHORT[di]}</p>
                          <p className={`text-lg font-bold leading-tight ${isT ? 'text-white' : 'text-ink-navy'}`}>{day.getDate()}</p>
                        </div>
                        <div className="flex flex-col gap-1 p-2 flex-1">
                          {chips.length === 0
                            ? <p className={`text-[10px] text-center mt-2 ${isT ? 'text-white/40' : 'text-ink-navy/20'}`}>—</p>
                            : chips.map(chip => (
                              <div key={chip.label} className={`rounded px-1.5 py-1 border-l-2 ${isT ? 'bg-white/20' : 'bg-ink-navy/5'}`}
                                style={{ borderLeftColor: isT ? 'white' : chip.color }}>
                                <p className={`text-[11px] font-bold ${isT ? 'text-white' : 'text-ink-navy/70'}`}>{chip.label}</p>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VISTA MENSILE ── */}
      {vistaMessile && (() => {
        const anno = miniMonth.getFullYear(), mese = miniMonth.getMonth()
        const primoGiorno = new Date(anno, mese, 1)
        const ultimoGiorno = new Date(anno, mese + 1, 0)
        const startOffset = (primoGiorno.getDay() + 6) % 7
        const celle: (Date | null)[] = []
        for (let i = 0; i < startOffset; i++) celle.push(null)
        for (let d = 1; d <= ultimoGiorno.getDate(); d++) celle.push(new Date(anno, mese, d))
        while (celle.length % 7 !== 0) celle.push(null)
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-ink-navy/8">
                <button onClick={() => setMiniMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1))} className="text-ink-navy/35 hover:text-ink-navy/70 text-lg px-2">‹</button>
                <h2 className="text-lg font-bold text-ink-navy">{MESI[mese]} {anno}</h2>
                <button onClick={() => setMiniMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1))} className="text-ink-navy/35 hover:text-ink-navy/70 text-lg px-2">›</button>
                <button onClick={() => setVistaMensile(false)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl ml-4">✕</button>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-7 mb-2">
                  {GIORNI_SHORT.map(g => <div key={g} className="text-center text-xs font-semibold text-ink-navy/35 py-1">{g}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {celle.map((day, i) => {
                    if (!day) return <div key={i} />
                    const dayApps = appForDayFiltered(day)
                    const isT = isSameDay(day, today)
                    const isPast = day < today && !isT
                    return (
                      <button key={i} onClick={() => { setVistaMensile(false); setViewDay(day); jumpToDay(day) }}
                        className={`relative rounded-xl p-1.5 min-h-16 text-left transition-colors border ${
                          isT ? 'bg-electric-blue border-electric-blue text-white' :
                          isPast ? 'bg-mist border-ink-navy/8 text-ink-navy/35' :
                          dayApps.length > 0 ? 'bg-white border-electric-blue/15 hover:border-electric-blue/40 hover:bg-electric-blue/10' :
                          'bg-white border-ink-navy/8 hover:bg-mist'
                        }`}>
                        <p className={`text-xs font-bold mb-1 ${isT ? 'text-white' : isPast ? 'text-ink-navy/35' : 'text-ink-navy/70'}`}>{day.getDate()}</p>
                        {dayApps.length > 0 && (
                          <div className="space-y-0.5">
                            {dayApps.slice(0, 2).map(a => {
                              const tipo = inferTipo(a.servizio)
                              const ts = TIPO_STYLE[tipo]
                              const sc2 = STATUS_COLORS[a.status] ?? STATUS_COLORS.confermato
                              const ora = new Date(a.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                              return (
                                <div key={a.id} className={`${isT ? 'bg-white/20' : sc2.bg} rounded px-1 py-0.5 border-l-2`}
                                  style={{ borderLeftColor: isT ? 'white' : ts.barColor }}>
                                  <p className={`text-[10px] font-semibold truncate leading-tight ${isT ? 'text-white' : 'text-ink-navy'}`}>
                                    {ora} {a.clienteNome?.split(' ')[0]}
                                  </p>
                                </div>
                              )
                            })}
                            {dayApps.length > 2 && (
                              <p className={`text-[10px] font-semibold ${isT ? 'text-white/60' : 'text-ink-navy/35'}`}>+{dayApps.length - 2} altri</p>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── DETTAGLIO APPUNTAMENTO ── */}
      {selected && (() => {
        const tavoliAssegnati = getTavoliIds(selected)
        const tipo = inferTipo(selected.servizio)
        const ts = TIPO_STYLE[tipo]
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: '85vh' }}>
              <div className="px-5 py-4 border-b border-ink-navy/8 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ts.badge}`}>{ts.label}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[selected.status]?.bg ?? 'bg-mist'} ${STATUS_COLORS[selected.status]?.text ?? 'text-ink-navy/60'}`}>
                      {selected.status === 'no_show' ? 'No-show' : selected.status}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-ink-navy mt-1">{selected.clienteNome || 'Appuntamento'}</h2>
                  {selected.clienteEmail && <p className="text-xs text-ink-navy/35">{selected.clienteEmail}</p>}
                </div>
                <button onClick={() => { setSelected(null); setSelectedTavoliIds([]) }} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl mt-1">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                <div className={`${ts.bg} border rounded-xl px-4 py-3 space-y-1.5`} style={{ borderColor: ts.barColor + '40' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: ts.barColor }}>Prenotazione</p>
                  <p className="text-sm font-semibold text-ink-navy">
                    {GIORNI_FULL[new Date(selected.data).getDay()]}{' '}
                    {new Date(selected.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}{' '}
                    alle {new Date(selected.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {selected.servizio && <p className="text-sm text-ink-navy/60">{selected.servizio} · {selected.durata} min</p>}
                  {(selected.coperti ?? 1) > 0 && <p className="text-sm text-ink-navy/60">{selected.coperti ?? 1} {(selected.coperti ?? 1) === 1 ? 'persona' : 'persone'}</p>}
                  {(() => {
                    const ts2 = tavoli.filter(t => tavoliAssegnati.includes(t.id)).sort((a,b)=>a.numero-b.numero)
                    if (ts2.length === 0) return null
                    return <p className="text-sm text-ink-navy/60">{ts2.length === 1 ? `Tavolo ${ts2[0].numero} (${ts2[0].posti} posti)` : `Tavoli ${ts2.map(t=>t.numero).join('+')} (fusi · ${ts2.reduce((s,t)=>s+t.posti,0)} posti)`}</p>
                  })()}
                  {selected.allergie && selected.allergie.toLowerCase() !== 'nessuna' && <p className="text-sm text-red-600 font-medium">{selected.allergie}</p>}
                  {selected.occasione && <p className="text-sm text-purple-600">{selected.occasione}</p>}
                  {selected.note && <p className="text-xs text-ink-navy/40 italic mt-1">{selected.note}</p>}
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">Stato</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'confermato', label: 'Confermato' },
                      { key: 'completato', label: 'Completato' },
                      { key: 'no_show', label: 'No-show' },
                      { key: 'cancellato', label: '✕ Cancellato' },
                    ].map(({ key, label }) => {
                      const c = STATUS_COLORS[key]
                      return (
                        <button key={key} onClick={() => handleStatusApp(selected.id, key)}
                          className={`text-sm py-2 rounded-lg font-medium transition-colors ${selected.status === key ? `${c.bg} ${c.text}` : 'bg-mist text-ink-navy/60 hover:bg-ink-navy/10'}`}>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {tipo === 'tavolo' && tavoli.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider">Tavoli assegnati</p>
                      {tavoliAssegnati.length > 0 && (
                        <span className="text-xs font-bold text-electric-blue">
                          {tavoliAssegnati.length === 1
                            ? `T${tavoli.find(t => t.id === tavoliAssegnati[0])?.numero ?? ''}`
                            : `T${tavoli.filter(t => tavoliAssegnati.includes(t.id)).sort((a,b)=>a.numero-b.numero).map(t=>t.numero).join('+')}`}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5 mb-3">
                      {tavoli.map(t => {
                        const selStart = new Date(selected.data).getTime()
                        const selEnd = selStart + selected.durata * 60000
                        const occupato = appuntamenti.some(a => {
                          if (a.id === selected.id || a.status === 'cancellato') return false
                          const usaTavolo = a.tavoloId === t.id || (() => { try { return (JSON.parse(a.tavoliIds ?? '[]') as string[]).includes(t.id) } catch { return false } })()
                          if (!usaTavolo) return false
                          const aStart = new Date(a.data).getTime()
                          return aStart < selEnd && (aStart + a.durata * 60000) > selStart
                        })
                        const checked = selectedTavoliIds.length > 0 ? selectedTavoliIds.includes(t.id) : tavoliAssegnati.includes(t.id)
                        return (
                          <label key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                            checked ? 'border-electric-blue/40 bg-electric-blue/10' : 'border-ink-navy/10 hover:bg-mist'
                          } ${occupato && !checked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <input type="checkbox" checked={checked} disabled={occupato && !checked}
                              onChange={e => {
                                const base = selectedTavoliIds.length > 0 ? selectedTavoliIds : tavoliAssegnati
                                setSelectedTavoliIds(e.target.checked ? [...base, t.id] : base.filter(id => id !== t.id))
                              }}
                              className="accent-electric-blue w-4 h-4 shrink-0" />
                            <span className="text-sm text-ink-navy/70 flex-1">
                              <span className="font-semibold">Tavolo {t.numero}</span>
                              <span className="text-ink-navy/35"> · {t.posti} posti{t.note ? ` · ${t.note}` : ''}</span>
                            </span>
                            {occupato && !checked && <span className="text-xs text-red-400">occupato</span>}
                          </label>
                        )
                      })}
                    </div>
                    {(() => {
                      const ids = selectedTavoliIds.length > 0 ? selectedTavoliIds : tavoliAssegnati
                      return (
                        <button onClick={() => handleAssegnaTavoli(selected.id, ids)} disabled={assegnaLoading || ids.length === 0}
                          className="w-full text-sm font-semibold bg-electric-blue text-white py-2 rounded-lg hover:bg-electric-blue/90 disabled:opacity-50">
                          {assegnaLoading ? 'Salvataggio…' : ids.length >= 2 ? `Assegna e fondi (T${tavoli.filter(t=>ids.includes(t.id)).sort((a,b)=>a.numero-b.numero).map(t=>t.numero).join('+')})` : 'Assegna tavolo'}
                        </button>
                      )
                    })()}
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-ink-navy/8">
                <button onClick={() => handleDeleteApp(selected.id)}
                  className="text-sm text-ink-navy/40 font-medium py-2 px-3 border border-ink-navy/10 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors" title="Elimina">
                  <span className="w-3.5 h-3.5 inline-block"><IconTrash /></span>
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── NUOVO APPUNTAMENTO ── */}
      {showNuovo && (() => {
        const inp = 'w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue'

        // Campi comuni: cliente + data/ora
        const campiBase = (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome cliente *</label>
                <input type="text" placeholder="Mario Rossi" value={formApp.clienteNome}
                  onChange={e => setFormApp(f => ({ ...f, clienteNome: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Email</label>
                <input type="email" placeholder="mario@email.com" value={formApp.clienteEmail}
                  onChange={e => setFormApp(f => ({ ...f, clienteEmail: e.target.value }))} className={inp} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Data *</label>
                <input type="date" value={formApp.data}
                  onChange={e => setFormApp(f => ({ ...f, data: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Ora *</label>
                <input type="time" value={formApp.ora}
                  onChange={e => setFormApp(f => ({ ...f, ora: e.target.value }))} className={inp} />
              </div>
            </div>
          </>
        )

        const campiNote = (
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note interne</label>
            <textarea value={formApp.note} onChange={e => setFormApp(f => ({ ...f, note: e.target.value }))}
              rows={2} className={`${inp} resize-none`} />
          </div>
        )

        const titleMap = { tavoli: 'Nuova prenotazione tavolo', servizi: 'Nuovo appuntamento' }
        const saveLabel = { tavoli: 'Salva prenotazione', servizi: 'Salva appuntamento' }

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 my-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-ink-navy">{titleMap[sezione]}</h2>
                  <p className="text-xs text-ink-navy/40 mt-0.5">{sezioneInfo[sezione].label}</p>
                </div>
                <button onClick={() => setShowNuovo(false)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
              </div>

              <div className="space-y-3">
                {campiBase}

                {/* ── TAVOLI ── */}
                {sezione === 'tavoli' && (<>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-ink-navy/70 mb-1">N° persone</label>
                      <input type="number" min={1} value={formApp.coperti}
                        onChange={e => setFormApp(f => ({ ...f, coperti: Number(e.target.value) }))} className={inp} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-navy/70 mb-1">Durata</label>
                      <select value={formApp.durata} onChange={e => setFormApp(f => ({ ...f, durata: Number(e.target.value) }))} className={inp}>
                        {[60, 90, 120, 150, 180].map(d => <option key={d} value={d}>{d} min</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-ink-navy/70 mb-1">Allergie</label>
                      <input type="text" placeholder="nessuna" value={formApp.allergie}
                        onChange={e => setFormApp(f => ({ ...f, allergie: e.target.value }))} className={inp} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-navy/70 mb-1">Occasione</label>
                      <input type="text" placeholder="compleanno…" value={formApp.occasione}
                        onChange={e => setFormApp(f => ({ ...f, occasione: e.target.value }))} className={inp} />
                    </div>
                  </div>
                  {tavoli.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-medium text-ink-navy/70">Tavoli</label>
                        {(() => {
                          const ids: string[] = (() => { try { return formApp.tavoloId ? JSON.parse(formApp.tavoloId) : [] } catch { return formApp.tavoloId ? [formApp.tavoloId] : [] } })()
                          return ids.length >= 2 ? <span className="text-xs font-bold text-orange-600">T{tavoli.filter(t=>ids.includes(t.id)).sort((a,b)=>a.numero-b.numero).map(t=>t.numero).join('+')} — fusi</span> : null
                        })()}
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {tavoli.map(t => {
                          const selIds: string[] = (() => { try { return formApp.tavoloId ? JSON.parse(formApp.tavoloId) : [] } catch { return formApp.tavoloId ? [formApp.tavoloId] : [] } })()
                          const checked = selIds.includes(t.id)
                          const selStart = formApp.data && formApp.ora ? new Date(`${formApp.data}T${formApp.ora}`).getTime() : null
                          const selEnd = selStart ? selStart + formApp.durata * 60000 : null
                          const occupato = !checked && selStart !== null && selEnd !== null && appuntamenti.some(a => {
                            if (a.status === 'cancellato') return false
                            const usa = a.tavoloId === t.id || (() => { try { return (JSON.parse(a.tavoliIds ?? '[]') as string[]).includes(t.id) } catch { return false } })()
                            if (!usa) return false
                            const aStart = new Date(a.data).getTime()
                            return aStart < selEnd! && (aStart + a.durata * 60000) > selStart!
                          })
                          return (
                            <label key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${occupato ? 'border-red-200 bg-red-50 cursor-not-allowed opacity-60' : checked ? 'border-electric-blue/40 bg-electric-blue/10 cursor-pointer' : 'border-ink-navy/10 hover:bg-mist cursor-pointer'}`}>
                              <input type="checkbox" checked={checked} disabled={occupato}
                                onChange={e => {
                                  const newIds = e.target.checked ? [...selIds, t.id] : selIds.filter(id => id !== t.id)
                                  setFormApp(f => ({ ...f, tavoloId: newIds.length === 0 ? '' : newIds.length === 1 ? newIds[0] : JSON.stringify(newIds) }))
                                }}
                                className="accent-electric-blue w-4 h-4 shrink-0" />
                              <span className="text-sm text-ink-navy/70 flex-1">
                                <span className="font-semibold">T{t.numero}</span>
                                <span className="text-ink-navy/35"> · {t.posti}p{t.note ? ` · ${t.note}` : ''}</span>
                              </span>
                              {occupato && <span className="text-xs text-red-500">occupato</span>}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>)}

{/* ── SERVIZI ── */}
                {sezione === 'servizi' && (<>
                  <div>
                    <label className="block text-sm font-medium text-ink-navy/70 mb-1">Tipo di servizio *</label>
                    <input type="text" placeholder="es. Consulenza, Corso di cucina, Degustazione…" value={formApp.servizio}
                      onChange={e => setFormApp(f => ({ ...f, servizio: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-navy/70 mb-1">Durata</label>
                    <select value={formApp.durata} onChange={e => setFormApp(f => ({ ...f, durata: Number(e.target.value) }))} className={inp}>
                      {[30, 45, 60, 90, 120, 180].map(d => <option key={d} value={d}>{d} min</option>)}
                    </select>
                  </div>
                  {campiNote}
                </>)}

                {sezione !== 'servizi' && campiNote}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowNuovo(false)}
                  className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">
                  Annulla
                </button>
                <button onClick={handleSaveApp}
                  disabled={!formApp.clienteNome || !formApp.data || !formApp.ora || (sezione === 'servizi' && !formApp.servizio)}
                  className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 disabled:opacity-40">
                  {saveLabel[sezione]}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

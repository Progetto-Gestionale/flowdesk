'use client'

import { useEffect, useRef, useState } from 'react'
import OrarioSelect from '@/app/components/OrarioSelect'
import { IconTrash } from '@/app/components/icons'
import { getCache, setCache } from '@/lib/pageCache'
import { Skeleton, SkeletonCards } from '@/app/components/Skeleton'

// Cache navigazione (stale-while-revalidate): al ritorno sulla pagina mostra subito
// l'ultimo dato noto invece di "Caricamento…", poi ricarica in background.
const CAL_CACHE_KEY = 'food:calendario'
type CalCache = { appuntamenti: Appuntamento[]; tavoli: Tavolo[]; hourStart: number; hourEnd: number }

const GIORNI_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const GIORNI_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

const PX_PER_HOUR = 80

// Estrae la fascia oraria [start, end] (in ore intere) che la griglia del calendario
// deve coprire, a partire dagli orari di apertura settimanali. Gestisce:
//  - più fasce per giorno separate da virgola ("12:00-15:00, 19:00-23:00")
//  - orari con minuti (apertura arrotondata per difetto, chiusura per eccesso)
//  - chiusura a mezzanotte ("...-00:00" / "...-24:00") trattata come le 24
//  - chiusura dopo mezzanotte ("19:00-02:00"): la fascia prosegue oltre le 24
//    (es. chiusura 02:00 → end 26), così la griglia continua nel giorno lavorativo
// Garantisce sempre end > start, così la griglia non sparisce mai. Cap a 30 (06:00).
function parseOrariRange(orariApertura: Record<string, string>): { start: number; end: number } {
  let minStart = 24, maxEnd = 0

  const toHour = (s: string, mode: 'floor' | 'ceil'): number | null => {
    const t = s.trim()
    if (!t) return null
    const [hRaw, mRaw] = t.split(':')
    const h = parseInt(hRaw, 10)
    if (isNaN(h)) return null
    const m = parseInt(mRaw ?? '0', 10) || 0
    return mode === 'ceil' ? h + (m > 0 ? 1 : 0) : h
  }

  Object.values(orariApertura).forEach(giorno => {
    if (!giorno) return
    // Ogni giorno può contenere più fasce separate da virgola.
    giorno.split(',').forEach(fascia => {
      const parts = fascia.split(/[-–]/)
      if (parts.length < 2) return
      const open = toHour(parts[0], 'floor')
      let close = toHour(parts[1], 'ceil')
      if (open == null || close == null) return
      if (close === 0) close = 24        // "...-00:00" = mezzanotte
      if (close <= open) close += 24     // oltre mezzanotte: es. 19→02 diventa 26
      if (open < minStart) minStart = open
      if (close > maxEnd) maxEnd = close
    })
  })

  if (minStart >= maxEnd) return { start: 11, end: 24 } // nessun orario valido → default
  return { start: Math.max(0, minStart - 1), end: Math.min(30, maxEnd) }
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

// ── Mini calendar dropdown ─────────────────────────────────────────────────
function MiniCalDropdown({ selectedDay, onSelect, onClose }: {
  selectedDay: Date; onSelect: (d: Date) => void; onClose: () => void
}) {
  const [viewYear, setViewYear] = useState(selectedDay.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedDay.getMonth())
  const ref = useRef<HTMLDivElement>(null)
  const GIORNI = ['L','M','M','G','V','S','D']
  const MESI_L = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1))
  const lastDay = new Date(Date.UTC(viewYear, viewMonth + 1, 0))
  let startDow = firstDay.getUTCDay() - 1; if (startDow < 0) startDow = 6
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= lastDay.getUTCDate(); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1) } else setViewMonth(m => m-1) }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1) } else setViewMonth(m => m+1) }
  const today = new Date()

  return (
    <div ref={ref} className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 bg-white rounded-2xl border border-ink-navy/10 shadow-xl p-3 w-64">
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-sm">‹</button>
        <span className="text-xs font-bold text-ink-navy">{MESI_L[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-sm">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {GIORNI.map((g, i) => <span key={i} className="text-center text-[10px] font-semibold text-ink-navy/30 py-0.5">{g}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />
          const d = new Date(viewYear, viewMonth, day)
          const isSelected = isSameDay(d, selectedDay)
          const isToday = isSameDay(d, today)
          return (
            <button key={i} onClick={() => { onSelect(d); onClose() }}
              className={`h-8 w-full rounded-lg text-xs font-medium transition-colors
                ${isSelected ? 'bg-electric-blue text-white font-bold' : isToday ? 'bg-electric-blue/10 text-electric-blue font-bold' : 'hover:bg-mist text-ink-navy'}`}>
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Pagina ────────────────────────────────────────────────────────────────
export default function Calendario() {
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Appuntamento | null>(null)
  const [showNuovo, setShowNuovo] = useState(false)
  const [vista, setVista] = useState<'giorno' | 'mese'>('giorno')

  // Giorno view
  const [currentDay, setCurrentDay] = useState<Date>(() => new Date())
  const [calDropOpen, setCalDropOpen] = useState(false)

  // Mese view
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d
  })

  const [tavoli, setTavoli] = useState<Tavolo[]>([])
  const [formApp, setFormApp] = useState({ clienteNome: '', clienteEmail: '', servizio: '', data: '', ora: '20:00', durata: 120, note: '', coperti: 2, allergie: '', occasione: '', tavoloId: '' })
  const [selectedTavoliIds, setSelectedTavoliIds] = useState<string[]>([])
  const [assegnaLoading, setAssegnaLoading] = useState(false)
  const [hourStart, setHourStart] = useState(11)
  const [hourEnd, setHourEnd] = useState(24)
  const scrollRef = useRef<HTMLDivElement>(null)

  const today = new Date()

  async function fetchAll() {
    const [resApp, resTavoli, resSettings] = await Promise.all([
      fetch('/api/appuntamenti', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/tavoli', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/settings', { credentials: 'include' }),
    ])
    const apps: Appuntamento[] = (await resApp.json()).appuntamenti ?? []
    const tvs: Tavolo[] = (await resTavoli.json()).tavoli ?? []
    const settings = await resSettings.json()
    let hs = 11, he = 24
    if (settings.orariApertura) {
      try {
        const orari: Record<string, string> = JSON.parse(settings.orariApertura)
        const r = parseOrariRange(orari)
        hs = r.start; he = r.end
      } catch { /* usa default */ }
    }
    setAppuntamenti(apps)
    setTavoli(tvs)
    setHourStart(hs)
    setHourEnd(he)
    setCache<CalCache>(CAL_CACHE_KEY, { appuntamenti: apps, tavoli: tvs, hourStart: hs, hourEnd: he })
  }

  useEffect(() => {
    // Idrata subito dall'ultimo dato in cache (se c'è): niente "Caricamento…" al ritorno.
    const cached = getCache<CalCache>(CAL_CACHE_KEY)
    if (cached) {
      setAppuntamenti(cached.appuntamenti)
      setTavoli(cached.tavoli)
      setHourStart(cached.hourStart)
      setHourEnd(cached.hourEnd)
      setLoading(false)
    }
    fetchAll().finally(() => setLoading(false)) // revalidate in background
    const interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  }, [])

  // All'apertura della vista Giorno su OGGI, centra la griglia sull'orario corrente
  // invece di partire dalla mattina. Solo se l'ora attuale rientra nella fascia mostrata.
  useEffect(() => {
    if (loading || vista !== 'giorno') return
    const el = scrollRef.current
    if (!el) return
    const now = new Date()
    if (!isSameDay(currentDay, now)) return
    const nowH = now.getHours() + now.getMinutes() / 60
    if (nowH < hourStart || nowH > hourEnd) return
    const posY = (nowH - hourStart) * PX_PER_HOUR
    el.scrollTop = Math.max(0, posY - el.clientHeight / 2)
  }, [loading, vista, currentDay, hourStart, hourEnd])

  function appForDay(day: Date) {
    // Ore dopo mezzanotte che appartengono al giorno lavorativo PRECEDENTE (es. chiusura 02:00 → 2).
    const cutoff = Math.max(0, hourEnd - 24)
    const domani = addDays(day, 1)
    return appuntamenti
      .filter(a => {
        const dt = new Date(a.data)
        const h = dt.getHours() + dt.getMinutes() / 60
        // Stesso giorno di calendario, escluse le prime ore che appartengono al giorno prima.
        if (isSameDay(dt, day)) return h >= cutoff
        // Dopo mezzanotte: appuntamento del giorno di calendario successivo ma dello stesso turno.
        if (cutoff > 0 && isSameDay(dt, domani)) return h < cutoff
        return false
      })
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  }
  function appForDayFiltered(day: Date) {
    return appForDay(day).filter(a => inferTipo(a.servizio) === 'tavolo')
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
        // chiude il box in automatico dopo aver assegnato e salvato
        setSelected(null)
        setSelectedTavoliIds([])
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
    setFormApp(f => ({ ...f, data: iso, tavoloId: '', allergie: '', occasione: '', note: '', clienteNome: '', clienteEmail: '', servizio: 'Prenotazione tavolo', durata: 90, ora: '20:00', coperti: 2 }))
    setShowNuovo(true)
  }

  // ── Day view columns ──────────────────────────────────────────────────────
  const buildColumns = (day: Date) => {
    const dayApps = appForDayFiltered(day)
    if (tavoli.length > 0) {
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
      dayApps.forEach(a => {
        const ids = getTavoliIds(a)
        if (ids.length === 0 || !ids.some(id => tavoloIds.has(id))) senzaTavolo.push(a)
      })
      if (senzaTavolo.length > 0)
        cols.unshift({ id: '__nessun_tavolo__', label: 'Non assegnati', sublabel: 'da assegnare', apps: senzaTavolo, ghostApps: [] })
      return cols
    }
    return [{ id: 'all', label: 'Tavoli', sublabel: '', apps: dayApps }]
  }

  const hoursGrid = Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i)
  const fmtHour = (h: number) => `${String(h % 24).padStart(2, '0')}:00`

  // ── Month grid ────────────────────────────────────────────────────────────
  const monthCells = (() => {
    const anno = currentMonth.getFullYear(), mese = currentMonth.getMonth()
    const primoGiorno = new Date(anno, mese, 1)
    const ultimoGiorno = new Date(anno, mese + 1, 0)
    const startOffset = (primoGiorno.getDay() + 6) % 7
    const cells: (Date | null)[] = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= ultimoGiorno.getDate(); d++) cells.push(new Date(anno, mese, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  })()

  const dayLabel = `${GIORNI_FULL[currentDay.getDay()]} ${currentDay.getDate()} ${MESI[currentDay.getMonth()]} ${currentDay.getFullYear()}`
  const isCurrentDayToday = isSameDay(currentDay, today)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-ink-navy">Calendario tavoli</h1>
        <div className="flex items-center gap-3">
          {/* Selettore vista */}
          <div className="flex gap-1 bg-mist rounded-xl p-1">
            {(['giorno', 'mese'] as const).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${vista === v ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => openNuovoConData(currentDay)}
            className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90">
            + Prenota tavolo
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><SkeletonCards count={6} /></div>
        </div>
      ) : (

        vista === 'giorno' ? (
          /* ── VISTA GIORNO ──────────────────────────────────── */
          <div>
            {/* Nav giorno */}
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setCurrentDay(d => addDays(d, -1))}
                className="text-ink-navy/35 hover:text-ink-navy/70 px-1.5 py-1 rounded hover:bg-mist">‹</button>
              <div className="flex-1 flex items-center justify-center gap-2">
                <div className="relative">
                  <button onClick={() => setCalDropOpen(v => !v)}
                    className="text-sm font-semibold text-ink-navy/70 px-3 py-1.5 border border-ink-navy/10 rounded-lg hover:bg-mist transition-colors whitespace-nowrap capitalize">
                    {dayLabel}
                  </button>
                  {calDropOpen && (
                    <MiniCalDropdown
                      selectedDay={currentDay}
                      onSelect={d => setCurrentDay(d)}
                      onClose={() => setCalDropOpen(false)}
                    />
                  )}
                </div>
                {!isCurrentDayToday && (
                  <button onClick={() => setCurrentDay(new Date())}
                    className="text-xs text-electric-blue hover:text-ink-navy font-medium py-1 px-2 border border-electric-blue/25 rounded-lg hover:bg-electric-blue/10">
                    Oggi
                  </button>
                )}
              </div>
              <button onClick={() => setCurrentDay(d => addDays(d, 1))}
                className="text-ink-navy/35 hover:text-ink-navy/70 px-1.5 py-1 rounded hover:bg-mist">›</button>
            </div>

            {/* Griglia tavoli */}
            {(() => {
              const dayApps = appForDayFiltered(currentDay)
              const appsConfermati = dayApps.filter(a => a.status === 'confermato')
              const totalCoperti = appsConfermati.reduce((s, a) => s + (a.coperti ?? 1), 0)

              // Layout calcolato una volta sola + larghezza minima per casella:
              // se in una fascia ci sono troppe prenotazioni affiancate, la lane si allarga
              // (min-width in px) e il contenitore scorre orizzontalmente invece di stringere le caselle.
              const laid = layoutApps(dayApps)
              const MIN_COL_W = 130
              const maxTotal = Math.max(1, ...laid.map(x => x.total))
              const laneMinWidth = maxTotal * MIN_COL_W

              return (
                <>
                  {totalCoperti > 0 && (
                    <div className="mb-3">
                      <span className="text-xs bg-electric-blue/10 text-electric-blue font-semibold px-2.5 py-1 rounded-full">
                        {totalCoperti} coperti confermati
                      </span>
                    </div>
                  )}
                  <div ref={scrollRef} className="bg-white border border-ink-navy/10 rounded-xl overflow-auto"
                    style={{ height: 'calc(100vh - 220px)', minWidth: 0 }}>
                    <div>
                      {/* Asse orari a sinistra + un'unica lane: le prenotazioni della
                          stessa fascia oraria vengono affiancate sull'orizzontale */}
                      <div className="flex">
                        <div className="w-14 shrink-0 sticky left-0 z-20 bg-white border-r border-ink-navy/10 relative"
                          style={{ height: (hourEnd - hourStart) * PX_PER_HOUR }}>
                          {hoursGrid.map(h => (
                            <div key={h} className="absolute left-0 right-0 flex items-start justify-end pr-2"
                              style={{ top: (h - hourStart) * PX_PER_HOUR }}>
                              <span className="text-[10px] font-semibold text-ink-navy/30 -mt-2">{fmtHour(h)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="relative flex-1"
                          style={{ height: (hourEnd - hourStart) * PX_PER_HOUR, minWidth: laneMinWidth }}>
                          {hoursGrid.map(h => (
                            <div key={h}>
                              <div className="absolute left-0 right-0 border-t border-ink-navy/8" style={{ top: (h - hourStart) * PX_PER_HOUR }} />
                              <div className="absolute left-0 right-0 border-t border-dashed border-ink-navy/5" style={{ top: (h - hourStart) * PX_PER_HOUR + PX_PER_HOUR / 2 }} />
                            </div>
                          ))}
                          {/* Linea "ora corrente": solo quando la griglia mostra oggi e l'ora rientra nella fascia */}
                          {(() => {
                            const now = new Date()
                            if (!isSameDay(currentDay, now)) return null
                            const nowH = now.getHours() + now.getMinutes() / 60
                            if (nowH < hourStart || nowH > hourEnd) return null
                            return (
                              <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                                style={{ top: (nowH - hourStart) * PX_PER_HOUR }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-electric-blue -ml-0.5 shrink-0" />
                                <span className="flex-1 border-t border-electric-blue/70" />
                              </div>
                            )
                          })()}
                          {laid.map(({ a, col: subCol, total }) => {
                            const tipo = inferTipo(a.servizio)
                            const ts = TIPO_STYLE[tipo]
                            const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.confermato
                            const dt = new Date(a.data)
                            // Appuntamento dopo mezzanotte (giorno di calendario successivo) → collocato a ora+24.
                            const startH = (isSameDay(dt, currentDay) ? 0 : 24) + dt.getHours() + dt.getMinutes() / 60
                            const top = Math.max(0, (startH - hourStart) * PX_PER_HOUR)
                            const ora = dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                            const pct = 100 / total
                            const GAP = 3
                            const MIN_H = 32
                            const height = Math.max((a.durata / 60) * PX_PER_HOUR, MIN_H) - 2
                            return (
                              <div key={a.id}
                                style={{
                                  position: 'absolute', top, height,
                                  left: `calc(${subCol * pct}% + ${GAP}px)`,
                                  width: `calc(${pct}% - ${GAP * 2}px)`,
                                  borderLeftWidth: 3, borderLeftColor: ts.barColor,
                                }}
                                onClick={() => setSelected(a)}
                                className={`${sc.bg} rounded-r-lg px-2 py-1 cursor-pointer hover:brightness-95 transition-all overflow-hidden z-10`}>
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className="text-[10px] font-bold text-ink-navy/40 shrink-0">{ora}</span>
                                  <p className="text-[11px] font-bold leading-tight truncate text-ink-navy">{a.clienteNome || 'Cliente'}</p>
                                </div>
                                {height > 44 && a.coperti && a.coperti > 1 && (
                                  <p className="text-[10px] opacity-55 mt-0.5">{a.coperti} coperti</p>
                                )}
                                {height > 62 && a.allergie && a.allergie.toLowerCase() !== 'nessuna' && (
                                  <p className="text-[10px] text-red-500 truncate">{a.allergie}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>

        ) : (
          /* ── VISTA MESE ──────────────────────────────────────── */
          <div className="max-w-5xl">
            {/* Nav mese */}
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1))}
                className="text-ink-navy/35 hover:text-ink-navy/70 px-1.5 py-1 rounded hover:bg-mist">‹</button>
              <div className="flex-1 flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-ink-navy/70">
                  {MESI[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </span>
                {!(currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear()) && (
                  <button onClick={() => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
                    className="text-xs text-electric-blue hover:text-ink-navy font-medium py-1 px-2 border border-electric-blue/25 rounded-lg hover:bg-electric-blue/10">
                    Oggi
                  </button>
                )}
              </div>
              <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1))}
                className="text-ink-navy/35 hover:text-ink-navy/70 px-1.5 py-1 rounded hover:bg-mist">›</button>
            </div>

            {/* Intestazione giorni */}
            <div className="grid grid-cols-7 mb-2">
              {GIORNI_SHORT.map(g => (
                <div key={g} className="text-center text-xs font-semibold text-ink-navy/35 py-1">{g}</div>
              ))}
            </div>

            {/* Celle del mese */}
            <div className="grid grid-cols-7 gap-1.5">
              {monthCells.map((day, i) => {
                if (!day) return <div key={i} />
                const dayApps = appForDayFiltered(day)
                const isT = isSameDay(day, today)
                const isPast = day < today && !isT
                const confermati = dayApps.filter(a => a.status === 'confermato')
                const completatiN = dayApps.filter(a => a.status === 'completato').length
                const noShowN = dayApps.filter(a => a.status === 'no_show').length
                const cancellatiN = dayApps.filter(a => a.status === 'cancellato').length
                const totalCoperti = confermati.reduce((s, a) => s + (a.coperti ?? 1), 0)

                return (
                  <button key={i}
                    onClick={() => { setCurrentDay(day); setVista('giorno') }}
                    className={`min-h-24 rounded-xl text-left transition-colors border flex flex-col overflow-hidden ${
                      isT ? 'bg-electric-blue border-electric-blue' :
                      isPast ? 'bg-mist/60 border-ink-navy/8' :
                      dayApps.length > 0 ? 'bg-white border-electric-blue/20 hover:border-electric-blue/50 hover:bg-electric-blue/5' :
                      'bg-white border-ink-navy/8 hover:bg-mist'
                    }`}>
                    {/* Header cella */}
                    <div className={`px-2 pt-2 pb-1 flex items-baseline justify-between border-b ${isT ? 'border-white/20' : 'border-ink-navy/8'}`}>
                      <p className={`text-sm font-bold leading-tight ${isT ? 'text-white' : isPast ? 'text-ink-navy/30' : 'text-ink-navy'}`}>
                        {day.getDate()}
                      </p>
                      {totalCoperti > 0 && (
                        <span className={`text-[10px] font-bold ${isT ? 'text-white/70' : 'text-ink-navy/40'}`}>
                          {totalCoperti}p
                        </span>
                      )}
                    </div>
                    {/* Riepilogo conteggi per stato con etichetta — clicca per i dettagli */}
                    <div className="flex flex-col gap-0.5 p-1.5 flex-1">
                      {dayApps.length === 0
                        ? <p className={`text-[10px] text-center mt-1 ${isT ? 'text-white/30' : 'text-ink-navy/15'}`}>—</p>
                        : ([
                            ['confermato', 'Confermati', confermati.length] as const,
                            ['completato', 'Completati', completatiN] as const,
                            ['no_show', 'No show', noShowN] as const,
                            ['cancellato', 'Cancellati', cancellatiN] as const,
                          ]).filter(([, , n]) => n > 0).map(([st, etichetta, n]) => {
                            const sc = STATUS_COLORS[st] ?? STATUS_COLORS.confermato
                            return (
                              <span key={st}
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${isT ? 'bg-white/20 text-white' : `${sc.bg} ${sc.text}`}`}>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isT ? 'bg-white/70' : sc.dot}`} />
                                <span className="truncate">{etichetta}</span>
                                <span className="ml-auto font-bold">{n}</span>
                              </span>
                            )
                          })
                      }
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      )}

      {/* ── DETTAGLIO APPUNTAMENTO ── */}
      {selected && (() => {
        const tavoliAssegnati = getTavoliIds(selected)
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: '85vh' }}>
              <div className="px-5 py-4 border-b border-ink-navy/8 flex items-start justify-between">
                <div>
                  <h2 className="text-base font-bold text-ink-navy">{selected.clienteNome || 'Appuntamento'}</h2>
                  {selected.clienteEmail && <p className="text-xs text-ink-navy/35">{selected.clienteEmail}</p>}
                </div>
                <button onClick={() => { setSelected(null); setSelectedTavoliIds([]) }} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl mt-1">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                <div className="bg-electric-blue/5 border border-electric-blue/25 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-electric-blue">Prenotazione</p>
                  <p className="text-sm text-ink-navy">
                    {GIORNI_FULL[new Date(selected.data).getDay()]}{' '}
                    {new Date(selected.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {' '}alle <span className="font-bold text-base">{new Date(selected.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
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

                {/* Assegnazione tavolo rimossa dal modale: il titolare gestisce i tavoli in autonomia.
                    I tavoli eventualmente assegnati restano comunque mostrati nel riepilogo sopra. */}
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
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 my-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink-navy">Nuova prenotazione tavolo</h2>
                <button onClick={() => setShowNuovo(false)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
              </div>
              <div className="space-y-3">
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
                    <OrarioSelect value={formApp.ora}
                      onChange={v => setFormApp(f => ({ ...f, ora: v }))} className={inp} />
                  </div>
                </div>
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
                {/* Assegnazione tavolo rimossa dalla creazione: la prenotazione nasce senza tavolo */}
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note interne</label>
                  <textarea value={formApp.note} onChange={e => setFormApp(f => ({ ...f, note: e.target.value }))}
                    rows={2} className={`${inp} resize-none`} />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowNuovo(false)}
                  className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">
                  Annulla
                </button>
                <button onClick={handleSaveApp}
                  disabled={!formApp.clienteNome || !formApp.data || !formApp.ora}
                  className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 disabled:opacity-40">
                  Salva prenotazione
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

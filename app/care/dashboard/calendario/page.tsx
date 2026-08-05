'use client'

import { useEffect, useRef, useState } from 'react'
import OrarioSelect from '@/app/components/OrarioSelect'
import Link from 'next/link'
import { IconTrash, IconArrowRight, IconClock } from '@/app/components/icons'
import SedutaPopup from './../components/SedutaPopup'
import GrigliaSettimana from './../components/GrigliaSettimana'
import { STATUS_STYLE } from './../components/statiAppuntamento'
import { segnalaAggiornamento } from './../components/notificheUtil'

const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const GIORNI_CODICE = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

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

// Mini calendario a comparsa per saltare velocemente a una data lontana.
function MiniCalDropdown({ selectedDay, onSelect, onClose }: {
  selectedDay: Date; onSelect: (d: Date) => void; onClose: () => void
}) {
  const [viewYear, setViewYear] = useState(selectedDay.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedDay.getMonth())
  const ref = useRef<HTMLDivElement>(null)
  const GIORNI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay = new Date(viewYear, viewMonth + 1, 0)
  let startDow = firstDay.getDay() - 1; if (startDow < 0) startDow = 6
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }
  const today = new Date()

  return (
    <div ref={ref} className="absolute z-50 top-full mt-2 left-0 bg-white rounded-2xl border border-ink-navy/10 shadow-xl p-3 w-64">
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-sm">‹</button>
        <span className="text-xs font-bold text-ink-navy">{MESI[viewMonth]} {viewYear}</span>
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

const NUOVO_PAZIENTE = '__nuovo'
const TIPO_ALTRO = '__altro'

const FORM_VUOTO = {
  pazienteId: '',
  clienteNome: '',
  nuovoEmail: '',
  nuovoTelefono: '',
  tipoSedutaId: '',
  servizio: '',
  ora: '09:00',
  durata: '45',
  note: '',
}

interface TipoSeduta { id: string; nome: string; durata: number; attivo: boolean }

export default function CalendarioPage() {
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>([])
  const [pazienti, setPazienti] = useState<Paziente[]>([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'settimana' | 'mese'>('settimana')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [currentMonth, setCurrentMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [calDropOpen, setCalDropOpen] = useState(false)
  const [selected, setSelected] = useState<Appuntamento | null>(null)
  const [showNuovo, setShowNuovo] = useState<Date | null>(null)
  const [form, setForm] = useState(FORM_VUOTO)
  const [tipiSeduta, setTipiSeduta] = useState<TipoSeduta[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erroreNuovo, setErroreNuovo] = useState('')
  const [notaAperta, setNotaAperta] = useState<Appuntamento | null>(null)
  const [orariSettimanali, setOrariSettimanali] = useState<Record<string, string>>({})
  const [overrides, setOverrides] = useState<Override[]>([])
  const [modalOrari, setModalOrari] = useState<Date | null>(null)
  const [formOrariGiorno, setFormOrariGiorno] = useState('')

  async function fetchAll() {
    const [aRes, pRes, sRes, tRes] = await Promise.all([
      fetch('/api/appuntamenti', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/pazienti', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/settings', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/tipi-seduta', { credentials: 'include', cache: 'no-store' }),
    ])
    const aData = await aRes.json()
    const pData = await pRes.json()
    const sData = await sRes.json()
    const tData = await tRes.json()
    setAppuntamenti(aData.appuntamenti ?? [])
    setPazienti(pData.pazienti ?? [])
    setTipiSeduta((tData.tipiSeduta ?? []).filter((t: TipoSeduta) => t.attivo))
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

  function openSelected(a: Appuntamento) {
    setSelected(a)
  }

  async function handleStatusChange(id: string, status: string) {
    setAppuntamenti(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    setSelected(prev => prev && prev.id === id ? { ...prev, status } : prev)
    await fetch(`/api/appuntamenti/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    segnalaAggiornamento()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/appuntamenti/${id}`, { method: 'DELETE', credentials: 'include' })
    setSelected(null)
    fetchAll()
    segnalaAggiornamento()
  }

  function openNuovo(day: Date) {
    setForm(FORM_VUOTO)
    setErroreNuovo('')
    setShowNuovo(day)
  }

  /** Scegliere un tipo di seduta porta con sé la sua durata standard. */
  function selezionaTipoSeduta(id: string) {
    const tipo = tipiSeduta.find(t => t.id === id)
    setForm(f => ({
      ...f,
      tipoSedutaId: id,
      servizio: id === TIPO_ALTRO ? f.servizio : '',
      durata: tipo ? String(tipo.durata) : f.durata,
    }))
  }

  async function handleCreate() {
    if (!showNuovo || salvando) return
    setSalvando(true)
    setErroreNuovo('')
    try {
      const nuovo = form.pazienteId === NUOVO_PAZIENTE
      let pazienteId = nuovo ? null : (form.pazienteId || null)
      const esistente = pazienti.find(p => p.id === form.pazienteId)
      let nome = esistente?.nome ?? ''
      let email = esistente?.email

      // Un paziente nuovo entra subito in anagrafica, con i suoi contatti
      if (nuovo) {
        const res = await fetch('/api/pazienti', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: form.clienteNome.trim(),
            email: form.nuovoEmail.trim() || null,
            telefono: form.nuovoTelefono.trim() || null,
          }),
        })
        if (!res.ok) {
          setErroreNuovo('Non è stato possibile creare il paziente. Riprova.')
          return
        }
        const d = await res.json()
        pazienteId = d.paziente.id
        nome = d.paziente.nome
        email = d.paziente.email
      }

      const tipo = tipiSeduta.find(t => t.id === form.tipoSedutaId)
      const [h, m] = form.ora.split(':').map(Number)
      const data = new Date(showNuovo)
      data.setHours(h, m, 0, 0)

      const res = await fetch('/api/appuntamenti', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNome: nome,
          clienteEmail: email,
          servizio: tipo?.nome || form.servizio.trim() || null,
          tipoSedutaId: tipo?.id ?? null,
          data: data.toISOString(),
          durata: parseInt(form.durata) || 45,
          note: form.note,
          pazienteId,
        }),
      })
      if (!res.ok) {
        setErroreNuovo('Non è stato possibile salvare l\'appuntamento. Riprova.')
        return
      }
      setShowNuovo(null)
      fetchAll()
      segnalaAggiornamento()
    } finally {
      setSalvando(false)
    }
  }

  const formValido = form.pazienteId === NUOVO_PAZIENTE
    ? Boolean(form.clienteNome.trim() && form.nuovoEmail.trim() && form.nuovoTelefono.trim())
    : Boolean(form.pazienteId)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = addDays(weekStart, 6)
  const label = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${MESI[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekStart.getDate()} ${MESI[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MESI[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`

  const today = new Date()
  const monthLabel = `${MESI[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`

  // Appuntamenti mostrati in calendario: escluse le prenotazioni cancellate e
  // quelle ancora "in attesa" (che vivono nella pagina Richieste finché non le accetti).
  function appsPerGiorno(day: Date) {
    return appuntamenti
      // Fuori anche quelle con una proposta in sospeso: il paziente non ha ancora risposto
      .filter(a => isSameDay(new Date(a.data), day) && a.status !== 'in_attesa' && a.status !== 'proposta_inviata')
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  }

  // Celle del mese: caselle vuote iniziali per allineare al lunedì, poi i giorni.
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

  function vaiIndietro() {
    if (vista === 'mese') setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
    else setWeekStart(addDays(weekStart, -7))
  }
  function vaiAvanti() {
    if (vista === 'mese') setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
    else setWeekStart(addDays(weekStart, 7))
  }
  function vaiOggi() {
    setWeekStart(startOfWeek(new Date()))
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))
  }
  function scegliData(d: Date) {
    setWeekStart(startOfWeek(d))
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  function apriGiorno(d: Date) {
    setWeekStart(startOfWeek(d))
    setVista('settimana')
  }

  /** Nuovo appuntamento cliccando una cella vuota della griglia. */
  function nuovoAllOra(day: Date, ora: number) {
    setForm({ ...FORM_VUOTO, ora: `${String(ora).padStart(2, '0')}:00` })
    setErroreNuovo('')
    setShowNuovo(day)
  }

  /** Il pulsante in alto propone oggi se è nella settimana mostrata. */
  function nuovoDaBarra() {
    openNuovo(days.find(d => isSameDay(d, today)) ?? days[0])
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Calendario</h1>
          <div className="relative inline-block">
            <button onClick={() => setCalDropOpen(v => !v)}
              className="text-ink-navy/50 mt-0.5 capitalize inline-flex items-center gap-1.5 hover:text-ink-navy transition-colors">
              {vista === 'mese' ? monthLabel : label}
              <span className="text-[10px] text-ink-navy/30">▾</span>
            </button>
            {calDropOpen && (
              <MiniCalDropdown
                selectedDay={vista === 'mese' ? currentMonth : weekStart}
                onSelect={scegliData}
                onClose={() => setCalDropOpen(false)}
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-mist rounded-xl p-1">
            {(['settimana', 'mese'] as const).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${vista === v ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={vaiIndietro}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 text-ink-navy/50 hover:bg-mist">‹</button>
          <button onClick={vaiOggi}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-ink-navy/10 text-ink-navy/60 hover:bg-mist">Oggi</button>
          <button onClick={vaiAvanti}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 text-ink-navy/50 hover:bg-mist">›</button>
          <button onClick={nuovoDaBarra}
            className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90 transition-colors">
            + Aggiungi
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : vista === 'mese' ? (
        <div>
          <div className="grid grid-cols-7 mb-2">
            {GIORNI_BREVI.map(g => (
              <div key={g} className="text-center text-xs font-semibold text-ink-navy/35 py-1">{g}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {monthCells.map((day, i) => {
              if (!day) return <div key={i} />
              const dayApps = appsPerGiorno(day)
              const isT = isSameDay(day, today)
              const isPast = day < today && !isT
              const confermatiN = dayApps.filter(a => a.status === 'confermato').length
              const completatiN = dayApps.filter(a => a.status === 'completato').length
              const noShowN = dayApps.filter(a => a.status === 'no_show').length
              const cancellatiN = dayApps.filter(a => a.status === 'cancellato').length
              return (
                <button key={i} onClick={() => apriGiorno(day)}
                  className={`min-h-24 rounded-xl text-left transition-colors border flex flex-col overflow-hidden ${
                    isT ? 'bg-electric-blue border-electric-blue' :
                    isPast ? 'bg-mist/60 border-ink-navy/8' :
                    dayApps.length > 0 ? 'bg-white border-electric-blue/20 hover:border-electric-blue/50 hover:bg-electric-blue/5' :
                    'bg-white border-ink-navy/8 hover:bg-mist'
                  }`}>
                  <div className={`px-2 pt-2 pb-1 flex items-baseline justify-between border-b ${isT ? 'border-white/20' : 'border-ink-navy/8'}`}>
                    <p className={`text-sm font-bold leading-tight ${isT ? 'text-white' : isPast ? 'text-ink-navy/30' : 'text-ink-navy'}`}>{day.getDate()}</p>
                    {dayApps.length > 0 && (
                      <span className={`text-[10px] font-bold ${isT ? 'text-white/70' : 'text-ink-navy/40'}`}>{dayApps.length}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 p-1.5 flex-1">
                    {dayApps.length === 0
                      ? <p className={`text-[10px] text-center mt-1 ${isT ? 'text-white/30' : 'text-ink-navy/15'}`}>—</p>
                      : ([
                          ['confermato', 'Confermati', confermatiN] as const,
                          ['completato', 'Completati', completatiN] as const,
                          ['no_show', 'No-show', noShowN] as const,
                          ['cancellato', 'Cancellati', cancellatiN] as const,
                        ]).filter(([, , n]) => n > 0).map(([st, etichetta, n]) => {
                          const sc = STATUS_STYLE[st] ?? STATUS_STYLE.confermato
                          return (
                            <span key={st}
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${isT ? 'bg-white/20 text-white' : `${sc.bg} ${sc.text}`}`}>
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
      ) : (
        <GrigliaSettimana
          giorni={days}
          oggi={today}
          appuntamentiDi={appsPerGiorno}
          orarioDi={day => {
            const o = orarioEffettivo(day)
            return { testo: o.testo, personalizzato: Boolean(o.override) }
          }}
          onNuovo={nuovoAllOra}
          onApri={a => openSelected(a as Appuntamento)}
          onOrari={apriModalOrari}
        />
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
                  {selected.servizio && <p className="font-bold text-ink-navy">{selected.servizio}</p>}
                  <button onClick={() => { setNotaAperta(selected); setSelected(null) }}
                    className="w-full text-left bg-mist hover:bg-ink-navy/10 rounded-lg px-3 py-2 transition-colors mt-1">
                    <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wider">Nota della seduta</p>
                    <p className="text-sm text-ink-navy/70 mt-0.5">
                      {selected.note || 'Aggiungi una nota o un allegato'}
                    </p>
                  </button>
                </div>

                {selected.pazienteId && (
                  <Link href={`/care/dashboard/pazienti/${selected.pazienteId}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-electric-blue hover:underline">
                    Apri cartella clinica <span className="w-3 h-3"><IconArrowRight /></span>
                  </Link>
                )}

                <div>
                  <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">Stato</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(STATUS_STYLE).map(([key, s]) => (
                      <button key={key} onClick={() => handleStatusChange(selected.id, key)}
                        className={`text-sm py-2 rounded-lg font-medium transition-colors ${selected.status === key ? `${s.bg} ${s.text}` : 'bg-mist text-ink-navy/60 hover:bg-ink-navy/10'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-ink-navy/8">
                <button onClick={() => handleDelete(selected.id)}
                  className="inline-flex items-center gap-2 text-sm text-ink-navy/50 font-medium py-2 px-3 border border-ink-navy/10 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
                  <span className="w-3.5 h-3.5"><IconTrash /></span> Elimina definitivamente
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal nuovo appuntamento */}
      {showNuovo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 overflow-y-auto" style={{ maxHeight: '90vh' }}>
            <h2 className="text-lg font-bold text-ink-navy">
              Nuovo appuntamento — {showNuovo.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <div className="space-y-3">
              {/* Il giorno si sceglie qui: partendo dal pulsante in alto non lo
                  si è indicato cliccando una colonna */}
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Data</label>
                <input type="date" value={toDateStr(showNuovo)}
                  onChange={e => { if (e.target.value) setShowNuovo(new Date(`${e.target.value}T12:00:00`)) }}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Paziente</label>
                <select value={form.pazienteId} onChange={e => setForm({ ...form, pazienteId: e.target.value })}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
                  <option value="">— Seleziona paziente —</option>
                  {pazienti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  <option value={NUOVO_PAZIENTE}>+ Nuovo paziente</option>
                </select>
              </div>
              {form.pazienteId === NUOVO_PAZIENTE && (
                <div className="bg-mist rounded-xl p-3 space-y-3">
                  <p className="text-xs font-semibold text-ink-navy/45 uppercase tracking-wider">Nuovo paziente</p>
                  <div>
                    <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome e cognome *</label>
                    <input value={form.clienteNome} onChange={e => setForm({ ...form, clienteNome: e.target.value })}
                      placeholder="Mario Rossi" autoFocus
                      className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-ink-navy/70 mb-1">Email *</label>
                      <input type="email" value={form.nuovoEmail} onChange={e => setForm({ ...form, nuovoEmail: e.target.value })}
                        placeholder="mario@email.com"
                        className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-navy/70 mb-1">Telefono *</label>
                      <input type="tel" value={form.nuovoTelefono} onChange={e => setForm({ ...form, nuovoTelefono: e.target.value })}
                        placeholder="333 1234567"
                        className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                    </div>
                  </div>
                  <p className="text-xs text-ink-navy/40">Verrà aggiunto automaticamente alla lista pazienti.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Ora</label>
                  <OrarioSelect value={form.ora} onChange={v => setForm({ ...form, ora: v })}
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
                <select value={form.tipoSedutaId} onChange={e => selezionaTipoSeduta(e.target.value)}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
                  <option value="">— Seleziona —</option>
                  {tipiSeduta.map(t => <option key={t.id} value={t.id}>{t.nome} · {t.durata} min</option>)}
                  <option value={TIPO_ALTRO}>Altro</option>
                </select>
                {tipiSeduta.length === 0 && (
                  <p className="text-xs text-ink-navy/40 mt-1">
                    Non hai ancora tipi di seduta. <Link href="/care/dashboard/sedute" className="text-electric-blue font-semibold hover:underline">Creane uno</Link>.
                  </p>
                )}
              </div>
              {form.tipoSedutaId === TIPO_ALTRO && (
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Specifica il trattamento</label>
                  <input value={form.servizio} onChange={e => setForm({ ...form, servizio: e.target.value })}
                    placeholder="Es. Valutazione posturale"
                    className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note</label>
                <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2}
                  className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
              </div>
            </div>
            {erroreNuovo && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erroreNuovo}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowNuovo(null)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
              <button onClick={handleCreate} disabled={salvando || !formValido}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 disabled:opacity-40">
                {salvando ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notaAperta?.pazienteId && (
        <SedutaPopup
          pazienteId={notaAperta.pazienteId}
          appuntamentoId={notaAperta.id}
          data={notaAperta.data}
          tipo={notaAperta.servizio}
          noteIniziali={notaAperta.note}
          onChiudi={() => setNotaAperta(null)}
          onSalvato={fetchAll}
        />
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

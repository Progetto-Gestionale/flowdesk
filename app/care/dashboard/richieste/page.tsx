'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import OrarioSelect from '@/app/components/OrarioSelect'
import { IconArrowRight } from '@/app/components/icons'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const GIORNI_INIZIALE = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  proposta_inviata: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Proposta inviata' },
  confermato: { bg: 'bg-electric-blue/15', text: 'text-electric-blue', label: 'Confermato' },
  completato: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completato' },
  no_show: { bg: 'bg-orange-100', text: 'text-orange-600', label: 'No-show' },
  cancellato: { bg: 'bg-red-100', text: 'text-red-500', label: 'Cancellato' },
}

// Proposta mandata al paziente: non è ancora né confermata né rifiutata
const PROPOSTA = 'proposta_inviata'
const TIPO_ALTRO = '__altro'

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
  messaggioProposta?: string | null
  createdAt: string
}

interface TipoSeduta { id: string; nome: string; durata: number }

// ── Helpers data ────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftDay(k: string, n: number) {
  const d = new Date(`${k}T12:00:00`); d.setDate(d.getDate() + n); return toDateStr(d)
}
function fmtGiornoLabel(k: string) {
  const oggi = toDateStr(new Date())
  if (k === oggi) return 'Oggi'
  if (k === shiftDay(oggi, -1)) return 'Ieri'
  if (k === shiftDay(oggi, 1)) return 'Domani'
  return new Date(`${k}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtGiornoLungo(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtOra(iso: string) {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

// ── Mini calendario a comparsa ──────────────────────────────────────────────
function MiniCal({ value, onChange, onClose }: {
  value: string; onChange: (d: string) => void; onClose: () => void
}) {
  const [viewYear, setViewYear] = useState(() => parseInt(value.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => parseInt(value.slice(5, 7)) - 1)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay = new Date(viewYear, viewMonth + 1, 0)
  let startDow = firstDay.getDay() - 1; if (startDow < 0) startDow = 6
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  function prevM() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  function nextM() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }
  const oggi = toDateStr(new Date())

  return (
    <div ref={ref} className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 bg-white rounded-2xl border border-ink-navy/10 shadow-xl p-3 w-64">
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevM} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-sm">‹</button>
        <span className="text-xs font-bold text-ink-navy">{MESI[viewMonth]} {viewYear}</span>
        <button onClick={nextM} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-sm">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">{GIORNI_INIZIALE.map((g, i) => <span key={i} className="text-center text-[10px] font-semibold text-ink-navy/30 py-0.5">{g}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />
          const k = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isSel = k === value
          const isToday = k === oggi
          return (
            <button key={i} onClick={() => { onChange(k); onClose() }}
              className={`h-8 w-full rounded-lg text-xs font-medium transition-colors ${isSel ? 'bg-electric-blue text-white font-bold' : isToday ? 'bg-electric-blue/10 text-electric-blue font-bold' : 'hover:bg-mist text-ink-navy'}`}>
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Modal nuova richiesta manuale ───────────────────────────────────────────
function NuovaModal({ tipi, onClose, onSave }: {
  tipi: TipoSeduta[]
  onClose: () => void
  onSave: (data: { clienteNome: string; clienteEmail: string; servizio: string; data: string; ora: string; durata: number; note: string }) => void
}) {
  const [form, setForm] = useState({ clienteNome: '', clienteEmail: '', servizio: '', data: toDateStr(new Date()), ora: '09:00', durata: 45, note: '' })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 my-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-navy">Nuova richiesta</h2>
          <button onClick={onClose} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome paziente *</label>
              <input value={form.clienteNome} onChange={e => setForm({ ...form, clienteNome: e.target.value })} placeholder="Mario Rossi" autoFocus
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Email</label>
              <input value={form.clienteEmail} onChange={e => setForm({ ...form, clienteEmail: e.target.value })} placeholder="paziente@email.com"
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Tipo di seduta</label>
            <select value={form.servizio}
              onChange={e => {
                const t = tipi.find(x => x.nome === e.target.value)
                setForm({ ...form, servizio: e.target.value, durata: t?.durata ?? form.durata })
              }}
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
              <option value="">— Seleziona —</option>
              {tipi.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Data</label>
              <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })}
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Ora</label>
              <OrarioSelect value={form.ora} onChange={v => setForm({ ...form, ora: v })}
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Durata</label>
              <input type="number" value={form.durata} onChange={e => setForm({ ...form, durata: Number(e.target.value) })}
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note</label>
            <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2}
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
          <button onClick={() => onSave(form)} disabled={!form.clienteNome.trim()}
            className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 disabled:opacity-40">Salva</button>
        </div>
      </div>
    </div>
  )
}

// ── Proposta di un altro orario ─────────────────────────────────────────────
function PropostaModal({ app, tipi, invio, errore, onClose, onInvia }: {
  app: Appuntamento
  tipi: TipoSeduta[]
  invio: boolean
  errore: string
  onClose: () => void
  onInvia: (dati: Record<string, unknown>) => void
}) {
  const iniziale = new Date(app.data)
  const [form, setForm] = useState({
    data: toDateStr(iniziale),
    ora: `${String(iniziale.getHours()).padStart(2, '0')}:${String(iniziale.getMinutes()).padStart(2, '0')}`,
    tipoSedutaId: tipi.find(t => t.nome === app.servizio)?.id ?? '',
    servizioAltro: tipi.some(t => t.nome === app.servizio) ? '' : (app.servizio ?? ''),
    messaggio: '',
  })

  // La durata segue il tipo di seduta scelto; se è "Altro" resta quella della richiesta
  const durataProposta = tipi.find(t => t.id === form.tipoSedutaId)?.durata ?? app.durata

  function selezionaTipo(id: string) {
    setForm(f => ({
      ...f,
      tipoSedutaId: id,
      servizioAltro: id === TIPO_ALTRO ? f.servizioAltro : '',
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 overflow-y-auto"
        style={{ maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold text-ink-navy">Proponi un altro orario</h2>
          <p className="text-xs text-ink-navy/50 mt-0.5">
            {app.clienteNome || 'Paziente'}{app.clienteEmail ? ` · ${app.clienteEmail}` : ''}
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          Il paziente riceve una email e risponde con un click. Se accetta, l&apos;appuntamento
          si sposta da solo e tu ricevi la notifica.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Data</label>
            <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })}
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Ora</label>
            <OrarioSelect value={form.ora} onChange={v => setForm({ ...form, ora: v })}
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-1">Tipo di seduta</label>
          <select value={form.tipoSedutaId} onChange={e => selezionaTipo(e.target.value)}
            className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
            <option value="">— Seleziona —</option>
            {tipi.map(t => <option key={t.id} value={t.id}>{t.nome} · {t.durata} min</option>)}
            <option value={TIPO_ALTRO}>Altro</option>
          </select>
          {/* La durata arriva dal tipo di seduta: non si imposta a mano */}
          <p className="text-xs text-ink-navy/35 mt-1">Durata: {durataProposta} minuti</p>
        </div>

        {form.tipoSedutaId === TIPO_ALTRO && (
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Specifica il trattamento</label>
            <input value={form.servizioAltro} onChange={e => setForm({ ...form, servizioAltro: e.target.value })}
              placeholder="Es. Valutazione posturale"
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-1">Messaggio per il paziente *</label>
          <textarea value={form.messaggio} onChange={e => setForm({ ...form, messaggio: e.target.value })} rows={3}
            placeholder="Es. Alle 17:00 sono già occupato, ma posso alle 18:30 dello stesso giorno."
            className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
        </div>

        {errore && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errore}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
          <button
            onClick={() => onInvia({
              data: form.data,
              ora: form.ora,
              durata: durataProposta,
              tipoSedutaId: form.tipoSedutaId && form.tipoSedutaId !== TIPO_ALTRO ? form.tipoSedutaId : null,
              tipoSeduta: form.servizioAltro.trim() || null,
              messaggio: form.messaggio,
            })}
            disabled={invio || !form.messaggio.trim()}
            className="flex-1 bg-amber-500 text-white font-semibold py-2.5 rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-40">
            {invio ? 'Invio...' : 'Invia proposta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pagina ──────────────────────────────────────────────────────────────────
export default function RichiestePage() {
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>([])
  const [tipi, setTipi] = useState<TipoSeduta[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Appuntamento | null>(null)
  const [showNuovo, setShowNuovo] = useState(false)
  const [prenotazioniAperte, setPrenotazioniAperte] = useState(true)
  const [giorno, setGiorno] = useState(() => toDateStr(new Date()))
  const [calOpen, setCalOpen] = useState(false)
  const [proposta, setProposta] = useState<Appuntamento | null>(null)
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState('')

  async function fetchAll() {
    const [aRes, tRes] = await Promise.all([
      fetch('/api/appuntamenti', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/tipi-seduta', { credentials: 'include', cache: 'no-store' }),
    ])
    const aData = await aRes.json()
    const tData = await tRes.json()
    setAppuntamenti(aData.appuntamenti ?? [])
    setTipi(tData.tipiSeduta ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  }, [])

  // Conferma / rifiuto / proposta passano dall'API di Care, che è quella che
  // manda le email al paziente. Una PATCH diretta su /api/appuntamenti no.
  async function rispondi(id: string, azione: 'conferma' | 'rifiuta' | 'proposta', extra: Record<string, unknown> = {}) {
    setInvio(true)
    setErrore('')
    try {
      const res = await fetch(`/api/care/richieste/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ azione, ...extra }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErrore(d.error ?? 'Operazione non riuscita, riprova.')
        return false
      }
      setSelected(null)
      setProposta(null)
      fetchAll()
      return true
    } finally {
      setInvio(false)
    }
  }

  const accetta = (id: string) => rispondi(id, 'conferma')
  const rifiuta = (id: string) => rispondi(id, 'rifiuta')

  async function cambiaStato(id: string, status: string) {
    setAppuntamenti(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    setSelected(prev => prev && prev.id === id ? { ...prev, status } : prev)
    await fetch(`/api/appuntamenti/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  async function eliminaApp(id: string) {
    await fetch(`/api/appuntamenti/${id}`, { method: 'DELETE', credentials: 'include' })
    setSelected(null)
    fetchAll()
  }

  async function creaManuale(form: { clienteNome: string; clienteEmail: string; servizio: string; data: string; ora: string; durata: number; note: string }) {
    const [h, m] = form.ora.split(':').map(Number)
    const d = new Date(form.data); d.setHours(h, m, 0, 0)
    await fetch('/api/appuntamenti', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteNome: form.clienteNome,
        clienteEmail: form.clienteEmail || null,
        servizio: form.servizio || null,
        data: d.toISOString(),
        durata: form.durata || 45,
        note: form.note || null,
        status: 'in_attesa',
      }),
    })
    setShowNuovo(false)
    fetchAll()
  }

  // Da verificare: solo quelle a cui non abbiamo ancora risposto
  const daVerificare = appuntamenti
    .filter(a => a.status === 'in_attesa')
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  // Processate: già accettate, rifiutate o con una proposta in attesa di risposta.
  // Il giorno è quello in cui la richiesta è ARRIVATA, non quello dell'appuntamento:
  // altrimenti questa sezione diventa un doppione del calendario.
  const processate = appuntamenti
    .filter(a => a.status !== 'in_attesa' && toDateStr(new Date(a.createdAt)) === giorno)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const oggi = toDateStr(new Date())

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Richieste</h1>
        </div>
        <button onClick={() => setShowNuovo(true)}
          className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90 transition-colors">
          + Nuova
        </button>
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : (
        <div className="space-y-6">

          {/* ── DA VERIFICARE ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-electric-blue uppercase tracking-wider">Da verificare</span>
              {daVerificare.length > 0 && <span className="bg-electric-blue/10 text-electric-blue text-xs font-bold px-2 py-0.5 rounded-full">{daVerificare.length}</span>}
            </div>
            {daVerificare.length === 0 ? (
              <p className="text-sm text-ink-navy/30 py-3">Nessuna richiesta da verificare</p>
            ) : (
              <div className="bg-white border-2 border-electric-blue/25 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-electric-blue/5 border-b border-electric-blue/15">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-electric-blue uppercase tracking-wider">Paziente</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-electric-blue uppercase tracking-wider">Data</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-electric-blue uppercase tracking-wider">Orario</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-electric-blue uppercase tracking-wider">Seduta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-electric-blue/10">
                    {daVerificare.map(a => (
                      <tr key={a.id} onClick={() => setSelected(a)} className="hover:bg-electric-blue/5 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-ink-navy">{a.clienteNome || 'Paziente'}</p>
                            {a.status === PROPOSTA && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide shrink-0">
                                Proposta inviata
                              </span>
                            )}
                          </div>
                          {a.clienteEmail && <p className="text-xs text-ink-navy/40">{a.clienteEmail}</p>}
                        </td>
                        <td className="px-4 py-3"><span className="text-base font-bold text-ink-navy capitalize">{fmtGiornoLungo(a.data)}</span></td>
                        <td className="px-4 py-3"><span className="text-base font-bold text-ink-navy">{fmtOra(a.data)}</span></td>
                        <td className="px-4 py-3 text-ink-navy/60">{a.servizio || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── RICHIESTE PROCESSATE PER GIORNO ── */}
          <div>
            <button onClick={() => setPrenotazioniAperte(v => !v)} className="w-full flex items-center gap-3 py-2 text-left group">
              <div className="h-px flex-1 bg-ink-navy/8" />
              <span className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wider group-hover:text-ink-navy/60 transition-colors flex items-center gap-1.5">
                Richieste processate
                <span className="bg-mist text-ink-navy/40 px-2 py-0.5 rounded-full normal-case tracking-normal">{processate.length}</span>
                <span className="text-ink-navy/30">{prenotazioniAperte ? '▲' : '▼'}</span>
              </span>
              <div className="h-px flex-1 bg-ink-navy/8" />
            </button>

            {prenotazioniAperte && (
              <div className="mt-3 space-y-3">
                {/* Navigazione data */}
                <div className="flex items-center gap-2">
                  <button onClick={() => setGiorno(shiftDay(giorno, -1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:bg-mist transition-colors text-sm">‹</button>
                  <div className="flex-1 flex justify-center relative">
                    <button onClick={() => setCalOpen(v => !v)}
                      className="text-sm font-semibold text-ink-navy py-1 px-3 rounded-lg border border-ink-navy/10 bg-white hover:bg-mist transition-colors select-none whitespace-nowrap capitalize">
                      Arrivate {fmtGiornoLabel(giorno).toLowerCase()}
                      <span className="ml-1.5 text-ink-navy/30 text-xs">▾</span>
                    </button>
                    {calOpen && <MiniCal value={giorno} onChange={setGiorno} onClose={() => setCalOpen(false)} />}
                  </div>
                  <div className="flex items-center gap-2">
                    {giorno !== oggi && (
                      <button onClick={() => setGiorno(oggi)}
                        className="text-xs text-electric-blue font-semibold px-2.5 py-1.5 rounded-lg border border-electric-blue/25 hover:bg-electric-blue/10 transition-colors">Oggi</button>
                    )}
                    <button onClick={() => setGiorno(shiftDay(giorno, 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:bg-mist transition-colors text-sm">›</button>
                  </div>
                </div>

                {processate.length === 0 ? (
                  <p className="text-sm text-ink-navy/30 text-center py-4">Nessuna richiesta processata per {fmtGiornoLabel(giorno).toLowerCase()}</p>
                ) : (
                  <div className="bg-white border border-ink-navy/10 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-mist border-b border-ink-navy/10">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Paziente</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Appuntamento</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Seduta</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Stato</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {processate.map(a => {
                          const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.confermato
                          return (
                            <tr key={a.id} onClick={() => setSelected(a)} className="hover:bg-mist cursor-pointer transition-colors">
                              <td className="px-4 py-3">
                                <p className="font-semibold text-ink-navy">{a.clienteNome || 'Paziente'}</p>
                                {a.clienteEmail && <p className="text-xs text-ink-navy/40">{a.clienteEmail}</p>}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm font-bold text-ink-navy capitalize">{fmtGiornoLungo(a.data)}</span>
                                <span className="text-sm font-bold text-ink-navy"> · {fmtOra(a.data)}</span>
                              </td>
                              <td className="px-4 py-3 text-ink-navy/60">{a.servizio || '—'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {showNuovo && <NuovaModal tipi={tipi} onClose={() => setShowNuovo(false)} onSave={creaManuale} />}

      {/* ── DETTAGLIO ── */}
      {proposta && (
        <PropostaModal
          app={proposta} tipi={tipi} invio={invio} errore={errore}
          onClose={() => { setProposta(null); setErrore('') }}
          onInvia={(dati) => rispondi(proposta.id, 'proposta', dati)}
        />
      )}

      {selected && (() => {
        const isAttesa = selected.status === 'in_attesa' || selected.status === PROPOSTA
        const st = STATUS_STYLE[selected.status] ?? STATUS_STYLE.confermato
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style={{ maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 pt-5 pb-4">
                <div className="flex items-start justify-between">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${isAttesa ? 'bg-blue-100 text-blue-700' : `${st.bg} ${st.text}`}`}>
                    {isAttesa ? 'In attesa' : st.label}
                  </span>
                  <button onClick={() => setSelected(null)} className="text-ink-navy/25 hover:text-ink-navy/60 transition-colors p-1 -mr-1 -mt-1">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                </div>
                <h2 className="text-xl font-bold text-ink-navy mt-3">{selected.clienteNome || 'Paziente'}</h2>
                {selected.clienteEmail && <p className="text-sm text-ink-navy/40 mt-0.5">{selected.clienteEmail}</p>}
              </div>

              <div className="overflow-y-auto flex-1">
                {/* Dettagli */}
                <div className="px-6 pb-2">
                  <div className="divide-y divide-ink-navy/6">
                    <div className="flex gap-3 py-2.5">
                      <span className="text-xs text-ink-navy/40 w-20 shrink-0 pt-0.5">Data</span>
                      <span className="text-sm font-bold text-ink-navy capitalize">{new Date(selected.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                    </div>
                    <div className="flex gap-3 py-2.5">
                      <span className="text-xs text-ink-navy/40 w-20 shrink-0 pt-0.5">Orario</span>
                      <span className="text-sm font-bold text-ink-navy">{fmtOra(selected.data)} · {selected.durata} min</span>
                    </div>
                    {selected.servizio && (
                      <div className="flex gap-3 py-2.5">
                        <span className="text-xs text-ink-navy/40 w-20 shrink-0 pt-0.5">Seduta</span>
                        <span className="text-sm font-medium text-ink-navy">{selected.servizio}</span>
                      </div>
                    )}
                    {selected.note && (
                      <div className="flex gap-3 py-2.5">
                        <span className="text-xs text-ink-navy/40 w-20 shrink-0 pt-0.5">Note</span>
                        <span className="text-sm font-medium text-ink-navy">{selected.note}</span>
                      </div>
                    )}
                  </div>

                  {selected.pazienteId && (
                    <Link href={`/care/dashboard/pazienti/${selected.pazienteId}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-electric-blue hover:underline">
                      Apri cartella clinica <span className="w-3 h-3"><IconArrowRight /></span>
                    </Link>
                  )}
                </div>

                {/* Azioni */}
                <div className="px-6 py-5">
                  {isAttesa ? (
                    <div className="space-y-2">
                      {selected.status === PROPOSTA && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-3">
                          <p className="text-xs font-semibold text-amber-800">In attesa della risposta del paziente</p>
                          {selected.messaggioProposta && (
                            <p className="text-xs text-amber-700/80 mt-1">“{selected.messaggioProposta}”</p>
                          )}
                          <p className="text-xs text-amber-700/70 mt-1">
                            Se accetta dall&apos;email, l&apos;appuntamento si conferma da solo.
                          </p>
                        </div>
                      )}
                      <button onClick={() => accetta(selected.id)} disabled={invio}
                        className="w-full bg-electric-blue text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 transition-colors disabled:opacity-40">
                        {invio ? 'Invio...' : 'Conferma e avvisa'}
                      </button>
                      <button onClick={() => { setProposta(selected); setSelected(null) }}
                        disabled={!selected.clienteEmail}
                        title={selected.clienteEmail ? undefined : 'Serve l\'email del paziente'}
                        className="w-full border border-amber-300 text-amber-700 text-sm font-semibold py-2.5 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
                        Proponi un altro orario
                      </button>
                      <button onClick={() => rifiuta(selected.id)} disabled={invio}
                        className="w-full text-red-500 text-sm font-medium py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40">
                        Rifiuta
                      </button>
                      {errore && <p className="text-xs text-red-500 text-center pt-1">{errore}</p>}
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">Stato</p>
                      <div className="grid grid-cols-2 gap-2">
                        {/* "Proposta inviata" non è uno stato che si sceglie: lo imposta l'invio della proposta */}
                        {Object.entries(STATUS_STYLE).filter(([k]) => k !== PROPOSTA).map(([key, s]) => (
                          <button key={key} onClick={() => cambiaStato(selected.id, key)}
                            className={`text-sm py-2 rounded-lg font-medium transition-colors ${selected.status === key ? `${s.bg} ${s.text}` : 'bg-mist text-ink-navy/60 hover:bg-ink-navy/10'}`}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => eliminaApp(selected.id)}
                        className="mt-3 text-xs text-ink-navy/40 font-medium hover:text-red-500 transition-colors">
                        Elimina definitivamente
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Turno {
  id: string
  data: string
  oraInizio: string
  oraFine: string
  ruolo: string | null
  note: string | null
}

interface Richiesta {
  id: string
  tipo: string
  data: string | null
  dataFine: string | null
  note: string | null
  oraInizio: string | null
  oraFine: string | null
  status: string
  createdAt: string
}

interface Dipendente {
  id: string
  nome: string
  ruolo: string | null
  turni: Turno[]
  richieste: Richiesta[]
}

interface GiornoDisponibile {
  data: string
  oraInizio: string
  oraFine: string
  note: string
}

const TIPO_LABEL: Record<string, string> = {
  assenza: 'Assenza',
  malattia: 'Malattia',
  permesso: 'Permesso',
  ferie: 'Ferie',
  preferenza_orario: 'Preferenza orario',
}
const STATUS_COLOR: Record<string, string> = {
  in_attesa: 'bg-amber-50 text-amber-600 border border-amber-200',
  approvata: 'bg-green-50 text-green-600 border border-green-200',
  rifiutata: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL: Record<string, string> = {
  in_attesa: 'In attesa',
  approvata: 'Approvata',
  rifiutata: 'Rifiutata',
}
const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

function getLunedi(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function StaffAreaPage() {
  const { token } = useParams<{ token: string }>()
  const [dipendente, setDipendente] = useState<Dipendente | null>(null)
  const [errore, setErrore] = useState('')
  const [tab, setTab] = useState<'turni' | 'richieste' | 'disponibilita'>('turni')

  // Form richiesta
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ tipo: 'malattia', data: '', dataFine: '', note: '', oraInizio: '', oraFine: '' })
  const [editingRichiesta, setEditingRichiesta] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Disponibilità
  const [meseDisp, setMeseDisp] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [giorniDisp, setGiorniDisp] = useState<GiornoDisponibile[]>([])
  const [giornoDettaglio, setGiornoDettaglio] = useState<string | null>(null)
  const [savingDisp, setSavingDisp] = useState(false)
  const [dispSalvata, setDispSalvata] = useState(false)
  const [dispModificata, setDispModificata] = useState(false)

  // Calendario mensile
  const [meseCal, setMeseCal] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [turnoSelezionato, setTurnoSelezionato] = useState<Turno | null>(null)

  async function fetchMe() {
    const res = await fetch(`/api/staff/me?token=${token}`)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErrore(d.error || 'Accesso non valido')
      return
    }
    const d = await res.json()
    setDipendente(d.dipendente)
  }

  async function fetchDisponibilita() {
    const mese = toISO(meseDisp)
    const res = await fetch(`/api/disponibilita?token=${token}&mese=${mese}`)
    if (!res.ok) return
    const d = await res.json()
    const mia = d.disponibilita?.find((x: any) => true)
    setGiorniDisp(mia ? JSON.parse(mia.giorni) : [])
    setDispSalvata(!!mia)
    setDispModificata(false)
  }

  useEffect(() => { fetchMe() }, [token])
  useEffect(() => { if (tab === 'disponibilita') fetchDisponibilita() }, [tab, meseDisp])

  async function inviaRichiesta() {
    setSaving(true)
    try {
      const method = editingRichiesta ? 'PATCH' : 'POST'
      const body = editingRichiesta ? { id: editingRichiesta, ...form } : form
      const res = await fetch(`/api/staff/me?token=${token}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Errore durante il salvataggio')
        return
      }
      setShowForm(false)
      setEditingRichiesta(null)
      setForm({ tipo: 'malattia', data: '', dataFine: '', note: '', oraInizio: '', oraFine: '' })
      fetchMe()
    } finally {
      setSaving(false)
    }
  }

  async function eliminaRichiesta(id: string) {
    if (!confirm('Rimuovere questa richiesta?')) return
    await fetch(`/api/staff/me?token=${token}&richiestaId=${id}`, { method: 'DELETE' })
    fetchMe()
  }

  function apriModifica(r: Richiesta) {
    setEditingRichiesta(r.id)
    setForm({
      tipo: r.tipo,
      data: r.data ? r.data.split('T')[0] : '',
      dataFine: r.dataFine ? r.dataFine.split('T')[0] : '',
      note: r.note ?? '',
      oraInizio: r.oraInizio ?? '',
      oraFine: r.oraFine ?? '',
    })
    setShowForm(true)
  }

  function toggleGiorno(dataStr: string) {
    setDispModificata(true)
    setGiorniDisp(prev => {
      const esiste = prev.find(g => g.data === dataStr)
      if (esiste) {
        if (giornoDettaglio === dataStr) setGiornoDettaglio(null)
        return prev.filter(g => g.data !== dataStr)
      }
      return [...prev, { data: dataStr, oraInizio: '', oraFine: '', note: '' }]
    })
  }

  function aggiornaGiorno(dataStr: string, campo: keyof GiornoDisponibile, valore: string) {
    setDispModificata(true)
    setGiorniDisp(prev => prev.map(g => g.data === dataStr ? { ...g, [campo]: valore } : g))
  }

  async function salvaDisponibilita() {
    setSavingDisp(true)
    await fetch(`/api/disponibilita?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mese: toISO(meseDisp), giorni: giorniDisp }),
    })
    setSavingDisp(false)
    setDispSalvata(true)
    setDispModificata(false)
  }

  if (errore) return (
    <div className="min-h-screen bg-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
        <div className="text-5xl mb-4">⛔</div>
        <h2 className="text-lg font-bold text-gray-900">Accesso non valido</h2>
        <p className="text-gray-500 text-sm mt-2">{errore}</p>
        <a href="/staff" className="mt-4 inline-block text-indigo-600 text-sm font-medium hover:underline">Richiedi un nuovo link</a>
      </div>
    </div>
  )

  if (!dipendente) return (
    <div className="min-h-screen bg-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Caricamento...</p>
    </div>
  )

  const oggi = new Date().toISOString().split('T')[0]

  const primoGiornoMese = new Date(meseCal.getFullYear(), meseCal.getMonth(), 1)
  const ultimoGiornoMese = new Date(meseCal.getFullYear(), meseCal.getMonth() + 1, 0)
  const offsetInizio = primoGiornoMese.getDay() === 0 ? 6 : primoGiornoMese.getDay() - 1
  const totaleCelle = Math.ceil((offsetInizio + ultimoGiornoMese.getDate()) / 7) * 7

  const primoGiornoDisp = new Date(meseDisp.getFullYear(), meseDisp.getMonth(), 1)
  const ultimoGiornoDisp = new Date(meseDisp.getFullYear(), meseDisp.getMonth() + 1, 0)
  const offsetDisp = primoGiornoDisp.getDay() === 0 ? 6 : primoGiornoDisp.getDay() - 1
  const totaleCelleDisp = Math.ceil((offsetDisp + ultimoGiornoDisp.getDate()) / 7) * 7

  const dettaglio = giornoDettaglio ? giorniDisp.find(g => g.data === giornoDettaglio) : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Ciao, {dipendente.nome} 👋</h1>
            {dipendente.ruolo && <p className="text-sm text-gray-500">{dipendente.ruolo}</p>}
          </div>
          <button onClick={() => setShowForm(true)}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors">
            + Richiesta
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Tab */}
        <div className="flex gap-2 flex-wrap">
          {(['turni', 'disponibilita', 'richieste'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {t === 'turni' ? '📅 I miei turni' : t === 'disponibilita' ? '📆 Disponibilità' : '📋 Le mie richieste'}
            </button>
          ))}
        </div>

        {/* ── TURNI — calendario mensile ── */}
        {tab === 'turni' && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Navigazione mese */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <button onClick={() => setMeseCal(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">←</button>
                <span className="font-semibold text-gray-800 text-sm capitalize">
                  {meseCal.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => setMeseCal(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">→</button>
              </div>
              {/* Intestazioni */}
              <div className="grid grid-cols-7 border-b border-gray-100">
                {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((g, i) => (
                  <div key={i} className={`py-3 text-center text-xs font-bold ${i >= 5 ? 'text-indigo-400' : 'text-gray-400'}`}>{g}</div>
                ))}
              </div>
              {/* Celle */}
              <div className="grid grid-cols-7">
                {Array.from({ length: totaleCelle }, (_, idx) => {
                  const giornoNum = idx - offsetInizio + 1
                  const isDelMese = giornoNum >= 1 && giornoNum <= ultimoGiornoMese.getDate()
                  const dataCorrente = isDelMese
                    ? `${meseCal.getFullYear()}-${String(meseCal.getMonth() + 1).padStart(2, '0')}-${String(giornoNum).padStart(2, '0')}`
                    : null
                  const turniGiorno = dataCorrente
                    ? dipendente.turni.filter(t => t.data.split('T')[0] === dataCorrente)
                    : []
                  const isOggi = dataCorrente === oggi
                  const isWeekend = idx % 7 >= 5

                  return (
                    <div key={idx} className={`min-h-[72px] p-1.5 border-b border-r border-gray-100
                      ${!isDelMese ? 'bg-gray-50/60' : isWeekend ? 'bg-indigo-50/30' : 'bg-white'}`}>
                      {isDelMese && (
                        <>
                          <p className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1
                            ${isOggi ? 'bg-indigo-600 text-white' : isWeekend ? 'text-indigo-500' : 'text-gray-700'}`}>
                            {giornoNum}
                          </p>
                          {turniGiorno.map((t, i) => (
                            <div key={i} onClick={() => setTurnoSelezionato(turnoSelezionato?.id === t.id ? null : t)}
                              className="bg-indigo-500 text-white rounded-lg px-1.5 py-1 text-xs font-semibold mb-1 cursor-pointer hover:bg-indigo-600 transition-colors">
                              {t.oraInizio}–{t.oraFine}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {dipendente.turni.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-gray-500 text-sm">Nessun turno assegnato</p>
              </div>
            )}

            {/* Dettaglio turno selezionato */}
            {turnoSelezionato && (
              <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {new Date(turnoSelezionato.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-indigo-600 font-bold text-lg mt-1">{turnoSelezionato.oraInizio} – {turnoSelezionato.oraFine}</p>
                    {turnoSelezionato.ruolo && <p className="text-gray-500 text-sm mt-0.5">{turnoSelezionato.ruolo}</p>}
                    {turnoSelezionato.note && <p className="text-gray-400 text-xs mt-1">{turnoSelezionato.note}</p>}
                  </div>
                  <button onClick={() => setTurnoSelezionato(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DISPONIBILITÀ — calendario mensile ── */}
        {tab === 'disponibilita' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 px-1">Tocca i giorni in cui sei disponibile — diventano verdi, di default tutto il giorno.</p>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Navigazione mese */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <button onClick={() => { setMeseDisp(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setGiornoDettaglio(null) }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">←</button>
                <span className="font-semibold text-gray-800 text-sm capitalize">
                  {meseDisp.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => { setMeseDisp(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setGiornoDettaglio(null) }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">→</button>
              </div>
              {/* Intestazioni */}
              <div className="grid grid-cols-7 border-b border-gray-100">
                {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((g, i) => (
                  <div key={i} className={`py-2 text-center text-xs font-bold ${i >= 5 ? 'text-indigo-400' : 'text-gray-400'}`}>{g}</div>
                ))}
              </div>
              {/* Celle */}
              <div className="grid grid-cols-7">
                {Array.from({ length: totaleCelleDisp }, (_, idx) => {
                  const giornoNum = idx - offsetDisp + 1
                  const isDelMese = giornoNum >= 1 && giornoNum <= ultimoGiornoDisp.getDate()
                  const dataStr = isDelMese
                    ? `${meseDisp.getFullYear()}-${String(meseDisp.getMonth() + 1).padStart(2, '0')}-${String(giornoNum).padStart(2, '0')}`
                    : null
                  const isDisp = dataStr ? giorniDisp.some(g => g.data === dataStr) : false
                  const hasOrario = dataStr ? giorniDisp.some(g => g.data === dataStr && g.oraInizio) : false
                  const isOggi = dataStr === oggi
                  const isWeekend = idx % 7 >= 5

                  return (
                    <div key={idx}
                      onClick={() => { if (!isDelMese || !dataStr) return; toggleGiorno(dataStr) }}
                      className={`min-h-[52px] p-1 border-b border-r border-gray-100 flex flex-col items-center justify-start pt-1.5 transition-colors
                        ${!isDelMese ? 'bg-gray-50/60' : isDisp ? 'bg-green-100 cursor-pointer hover:bg-green-200' : isWeekend ? 'bg-indigo-50/20 cursor-pointer hover:bg-indigo-50' : 'bg-white cursor-pointer hover:bg-gray-50'}`}>
                      {isDelMese && (
                        <>
                          <p className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full
                            ${isOggi ? 'bg-indigo-600 text-white' : isDisp ? 'text-green-700' : isWeekend ? 'text-indigo-400' : 'text-gray-700'}`}>
                            {giornoNum}
                          </p>
                          {hasOrario && <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5"></span>}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Tasto salva — sopra la lista giorni */}
            <button onClick={salvaDisponibilita} disabled={savingDisp || (!dispModificata && dispSalvata)}
              className={`w-full font-semibold py-2.5 rounded-xl text-sm transition-colors
                ${!dispModificata && dispSalvata
                  ? 'bg-green-100 text-green-700 border border-green-300 cursor-default'
                  : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50'}`}>
              {savingDisp ? 'Salvataggio...' : (!dispModificata && dispSalvata) ? '✅ Salvato' : 'Salva disponibilità'}
            </button>

            {/* Lista giorni selezionati con banner "Decidi orario" */}
            {giorniDisp.length > 0 && (
              <div className="space-y-2">
                {[...giorniDisp].sort((a, b) => a.data.localeCompare(b.data)).map(g => {
                  const isOpen = giornoDettaglio === g.data
                  const haOrario = !!g.oraInizio
                  return (
                    <div key={g.data} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {/* Riga principale */}
                      <div className="flex items-center justify-between px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
                          <span className="text-sm font-medium text-gray-800">
                            {new Date(g.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${haOrario ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {haOrario ? `${g.oraInizio} – ${g.oraFine}` : 'Tutto il giorno'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setGiornoDettaglio(isOpen ? null : g.data)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium transition-colors">
                            {isOpen ? 'Chiudi' : haOrario ? '✏️ Orario' : 'Decidi orario'}
                          </button>
                          <button onClick={() => toggleGiorno(g.data)} className="text-gray-300 hover:text-red-400 p-1 transition-colors">✕</button>
                        </div>
                      </div>

                      {/* Pannello orario espandibile */}
                      {isOpen && (
                        <div className="border-t border-gray-100 px-3 py-3 bg-gray-50 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Dalle</label>
                              <input type="time" value={g.oraInizio}
                                onChange={e => aggiornaGiorno(g.data, 'oraInizio', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 bg-white" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Alle</label>
                              <input type="time" value={g.oraFine}
                                onChange={e => aggiornaGiorno(g.data, 'oraFine', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 bg-white" />
                            </div>
                          </div>
                          <input value={g.note}
                            onChange={e => aggiornaGiorno(g.data, 'note', e.target.value)}
                            placeholder="Note (opzionale)..."
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 bg-white" />
                          {haOrario && (
                            <button onClick={() => { aggiornaGiorno(g.data, 'oraInizio', ''); aggiornaGiorno(g.data, 'oraFine', '') }}
                              className="text-xs text-gray-400 hover:text-gray-600">
                              Rimuovi orario → Tutto il giorno
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <button onClick={salvaDisponibilita} disabled={savingDisp || (!dispModificata && dispSalvata)}
              className={`w-full font-semibold py-2.5 rounded-xl text-sm transition-colors
                ${!dispModificata && dispSalvata
                  ? 'bg-green-100 text-green-700 border border-green-300 cursor-default'
                  : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50'}`}>
              {savingDisp ? 'Salvataggio...' : (!dispModificata && dispSalvata) ? '✅ Salvato' : 'Salva disponibilità'}
            </button>
          </div>
        )}

        {/* ── RICHIESTE ── */}
        {tab === 'richieste' && (
          <div className="space-y-3">
            {dipendente.richieste.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-gray-500 text-sm">Nessuna richiesta inviata</p>
              </div>
            )}
            {dipendente.richieste.map(r => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{TIPO_LABEL[r.tipo] || r.tipo}</p>
                    {r.tipo === 'preferenza_orario' ? (
                      r.oraInizio && <p className="text-gray-500 text-xs mt-0.5">{r.oraInizio} – {r.oraFine}{r.data && `, ${new Date(r.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`}</p>
                    ) : (
                      r.data && (
                        <p className="text-gray-500 text-xs mt-0.5">
                          {new Date(r.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                          {r.dataFine && r.dataFine !== r.data && ` → ${new Date(r.dataFine).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`}
                        </p>
                      )
                    )}
                    {r.note && <p className="text-gray-400 text-xs mt-1 truncate">{r.note}</p>}
                    {(r.status === 'in_attesa' || r.tipo === 'preferenza_orario') && (
                      <div className="flex gap-2 mt-2">
                        {r.status === 'in_attesa' && (
                          <button onClick={() => apriModifica(r)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium transition-colors">
                            Modifica
                          </button>
                        )}
                        <button onClick={() => eliminaRichiesta(r.id)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-medium transition-colors">
                          Rimuovi
                        </button>
                      </div>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal nuova richiesta */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">{editingRichiesta ? 'Modifica richiesta' : 'Nuova richiesta'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="malattia">Malattia</option>
                  <option value="assenza">Assenza</option>
                  <option value="permesso">Permesso</option>
                  <option value="ferie">Ferie</option>
                  <option value="preferenza_orario">Preferenza orario</option>
                </select>
              </div>
              {form.tipo === 'preferenza_orario' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giorno (opzionale)</label>
                    <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Dalle</label>
                      <input type="time" value={form.oraInizio} onChange={e => setForm(f => ({ ...f, oraInizio: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Alle</label>
                      <input type="time" value={form.oraFine} onChange={e => setForm(f => ({ ...f, oraFine: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dal</label>
                    <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Al (opzionale)</label>
                    <input type="date" value={form.dataFine} onChange={e => setForm(f => ({ ...f, dataFine: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Descrivi la tua richiesta..."
                  rows={3} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowForm(false); setEditingRichiesta(null); setForm({ tipo: 'malattia', data: '', dataFine: '', note: '', oraInizio: '', oraFine: '' }) }}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                Annulla
              </button>
              <button onClick={inviaRichiesta} disabled={saving || (form.tipo !== 'preferenza_orario' && !form.data)}
                className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50">
                {saving ? 'Invio...' : 'Invia richiesta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

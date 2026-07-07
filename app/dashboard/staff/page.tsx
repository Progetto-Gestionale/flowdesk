'use client'
import { useEffect, useRef, useState } from 'react'

interface Dipendente {
  id: string
  nome: string
  email: string
  ruolo: string | null
}

interface Turno {
  id: string
  data: string
  oraInizio: string
  oraFine: string
  ruolo: string | null
  note: string | null
  dipendente: { id: string; nome: string; ruolo: string | null }
}

interface Richiesta {
  id: string
  tipo: string
  data: string | null
  dataFine: string | null
  note: string | null
  status: string
  createdAt: string
  dipendente: { id: string; nome: string; ruolo: string | null }
}

interface GiornoDisponibile {
  data: string
  oraInizio: string
  oraFine: string
  note: string
}

interface Requisito {
  giorno: number
  fascia: string
  oraInizio: string
  oraFine: string
  persone: number
  ruolo: string
}

interface TurnoGenerato {
  dipendenteId: string
  nome: string
  giorno: number
  data: string
  oraInizio: string
  oraFine: string
  ruolo: string | null
  note: string | null
}

const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const GIORNI_LUNGHI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
const COLORI = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-pink-100 text-pink-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700']

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

export default function StaffPage() {
  const [tab, setTab] = useState<'turni' | 'dipendenti' | 'richieste' | 'genera'>('turni')
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([])
  const [turni, setTurni] = useState<Turno[]>([])
  const [richieste, setRichieste] = useState<Richiesta[]>([])
  const [settimana, setSettimana] = useState(getLunedi(new Date()))
  const [showModalDip, setShowModalDip] = useState(false)
  const [showModalTurno, setShowModalTurno] = useState(false)
  const [formDip, setFormDip] = useState({ nome: '', email: '', ruolo: '' })
  const [formTurno, setFormTurno] = useState({ dipendenteId: '', data: '', oraInizio: '09:00', oraFine: '17:00', ruolo: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [linkInviato, setLinkInviato] = useState<string | null>(null)
  const [dipendenteDaModificare, setDipendenteDaModificare] = useState<Dipendente | null>(null)
  const [formModifica, setFormModifica] = useState({ nome: '', email: '', ruolo: '' })

  // Vista turni
  const [vistaTurni, setVistaTurni] = useState<'settimana' | 'mese'>('settimana')
  const [meseCal, setMeseCal] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [turnoDettaglio, setTurnoDettaglio] = useState<Turno | null>(null)

  // Modal click-su-cella
  const [cellModal, setCellModal] = useState<{ dipendenteId: string; nome: string; data: string; dataLabel: string; oraInizio: string; oraFine: string } | null>(null)
  const [savingCell, setSavingCell] = useState(false)

  // Fabbisogno (caricato dalle impostazioni, usato come base per la settimana)
  const [fabbisogno, setFabbisogno] = useState<Requisito[]>([])
  const fabbisognoLoaded = useRef(false)

  // Genera turni
  const [fabbisognoSett, setFabbisognoSett] = useState<Requisito[]>([])
  const [noteGenerazione, setNoteGenerazione] = useState('')
  const [generando, setGenerando] = useState(false)
  const [turniGenerati, setTurniGenerati] = useState<TurnoGenerato[] | null>(null)
  const [spiegazioneAI, setSpiegazioneAI] = useState('')
  const [salvandoTurni, setSalvandoTurni] = useState(false)
  const [inviandoReminder, setInviandoReminder] = useState(false)
  const [reminderOk, setReminderOk] = useState<string | null>(null)
  const [copiando, setCopiando] = useState(false)
  const [cancellandoSett, setCancellandoSett] = useState(false)
  const [confirmCancella, setConfirmCancella] = useState(false)

  // Disponibilità di tutti i dipendenti per la settimana corrente (per banner nella griglia)
  const [tutteDisp, setTutteDisp] = useState<{ dipendenteId: string; giorni: GiornoDisponibile[] }[]>([])

  // Modal disponibilità dipendente
  const [dispModal, setDispModal] = useState<{ dipendente: Dipendente } | null>(null)
  const [dispMese, setDispMese] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [dispGiorni, setDispGiorni] = useState<GiornoDisponibile[]>([])
  const [loadingDisp, setLoadingDisp] = useState(false)
  const [dispGiornoSel, setDispGiornoSel] = useState<string | null>(null)

  async function fetchAll() {
    const safeJson = async (res: Response) => { try { return await res.json() } catch { return {} } }
    const [d, t, r] = await Promise.all([
      fetch('/api/dipendenti', { credentials: 'include' }).then(safeJson),
      fetch(`/api/turni?settimana=${toISO(settimana)}`, { credentials: 'include' }).then(safeJson),
      fetch('/api/richieste-staff', { credentials: 'include' }).then(safeJson),
    ])
    setDipendenti(d.dipendenti ?? [])
    setTurni(t.turni ?? [])
    setRichieste(r.richieste ?? [])
  }

  async function fetchFabbisogno() {
    const safeJson = async (res: Response) => { try { return await res.json() } catch { return {} } }
    const s = await fetch('/api/settings', { credentials: 'include' }).then(safeJson)
    try {
      const parsed: Requisito[] = s.fabbisognoStaff ? JSON.parse(s.fabbisognoStaff) : []
      setFabbisogno(parsed)
      fabbisognoLoaded.current = true
    } catch { /* mantieni stato corrente */ }
  }

  const [turniMese, setTurniMese] = useState<Turno[]>([])
  async function fetchTurniMese() {
    const safeJson = async (r: Response) => { try { return await r.json() } catch { return {} } }
    // carica tutte e 5 le settimane possibili del mese
    const primo = new Date(meseCal)
    const promises = []
    for (let i = 0; i < 5; i++) {
      const lun = getLunedi(new Date(primo.getFullYear(), primo.getMonth(), 1 + i * 7))
      promises.push(fetch(`/api/turni?settimana=${toISO(lun)}`, { credentials: 'include' }).then(safeJson))
    }
    const results = await Promise.all(promises)
    const tutti = results.flatMap(r => r.turni ?? [])
    // deduplica per id
    const map = new Map(tutti.map((t: Turno) => [t.id, t]))
    setTurniMese(Array.from(map.values()))
  }

  async function fetchDisp(lun: Date) {
    const mesoStr = `${lun.getFullYear()}-${String(lun.getMonth() + 1).padStart(2, '0')}-01`
    const safeJson = async (r: Response) => { try { return await r.json() } catch { return {} } }
    const data = await fetch(`/api/disponibilita?mese=${mesoStr}`, { credentials: 'include' }).then(safeJson)
    const result = (data.disponibilita ?? []).map((x: any) => ({
      dipendenteId: x.dipendenteId,
      giorni: (() => { try { return JSON.parse(x.giorni) } catch { return [] } })(),
    }))
    setTutteDisp(result)
  }

  useEffect(() => { fetchFabbisogno() }, [])

  // Quando arriva il template dalle impostazioni: carica da localStorage se esiste, altrimenti usa template
  useEffect(() => {
    if (fabbisogno.length === 0) return
    const key = `fabb_${toISO(settimana)}`
    const saved = localStorage.getItem(key)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) { setFabbisognoSett(parsed); return }
      } catch {}
    }
    setFabbisognoSett(fabbisogno)
  }, [settimana, fabbisogno])

  // Salva fabbisognoSett in localStorage quando viene modificato dall'utente
  useEffect(() => {
    if (fabbisognoSett.length === 0) return
    const key = `fabb_${toISO(settimana)}`
    localStorage.setItem(key, JSON.stringify(fabbisognoSett))
  }, [fabbisognoSett, settimana])

  useEffect(() => { fetchAll(); fetchDisp(settimana) }, [settimana])
  useEffect(() => { if (vistaTurni === 'mese') fetchTurniMese() }, [meseCal, vistaTurni])


  async function apriDispModal(dip: Dipendente) {
    setDispModal({ dipendente: dip })
    setDispGiornoSel(null)
    await caricaDisp(dip.id, dispMese)
  }

  async function caricaDisp(dipendenteId: string, mese: Date) {
    setLoadingDisp(true)
    const safeJson = async (r: Response) => { try { return await r.json() } catch { return {} } }
    const data = await fetch(`/api/disponibilita?mese=${toISO(mese)}`, { credentials: 'include' }).then(safeJson)
    const mia = (data.disponibilita ?? []).find((x: any) => x.dipendenteId === dipendenteId)
    setDispGiorni(mia ? JSON.parse(mia.giorni) : [])
    setLoadingDisp(false)
  }

  async function aggiungiDipendente() {
    setSaving(true)
    const res = await fetch('/api/dipendenti', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formDip),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { alert(data.error || 'Errore nel salvataggio'); return }
    setShowModalDip(false)
    setFormDip({ nome: '', email: '', ruolo: '' })
    await fetchAll()
  }

  function apriModifica(d: Dipendente) {
    setDipendenteDaModificare(d)
    setFormModifica({ nome: d.nome, email: d.email, ruolo: d.ruolo ?? '' })
  }

  async function salvaDipendente() {
    if (!dipendenteDaModificare) return
    setSaving(true)
    await fetch(`/api/dipendenti/${dipendenteDaModificare.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: formModifica.nome, email: formModifica.email, ruolo: formModifica.ruolo || null }),
    })
    setSaving(false)
    setDipendenteDaModificare(null)
    await fetchAll()
  }

  async function eliminaDipendente(id: string) {
    if (!confirm('Eliminare questo dipendente e tutti i suoi turni?')) return
    await fetch(`/api/dipendenti/${id}`, { method: 'DELETE', credentials: 'include' })
    fetchAll()
  }

  async function aggiungiTurno() {
    setSaving(true)
    await fetch('/api/turni', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formTurno),
    })
    setSaving(false)
    setShowModalTurno(false)
    setFormTurno({ dipendenteId: '', data: '', oraInizio: '09:00', oraFine: '17:00', ruolo: '', note: '' })
    fetchAll()
  }

  async function eliminaTurno(id: string) {
    await fetch(`/api/turni/${id}`, { method: 'DELETE', credentials: 'include' })
    fetchAll()
  }

  async function salvaDaCella() {
    if (!cellModal) return
    setSavingCell(true)
    await fetch('/api/turni', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dipendenteId: cellModal.dipendenteId, data: cellModal.data, oraInizio: cellModal.oraInizio, oraFine: cellModal.oraFine }),
    })
    setSavingCell(false)
    setCellModal(null)
    fetchAll()
  }

  async function aggiornaRichiesta(id: string, status: string) {
    await fetch(`/api/richieste-staff/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchAll()
  }

  async function inviaLink(email: string, nome: string) {
    await fetch('/api/staff/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setLinkInviato(nome)
    setTimeout(() => setLinkInviato(null), 3000)
  }

  async function generaTurni() {
    setGenerando(true)
    setTurniGenerati(null)
    const res = await fetch('/api/genera-turni', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settimana: toISO(settimana), requisiti: fabbisognoSett, note: noteGenerazione }),
    })
    const data = await res.json().catch(() => ({}))
    setGenerando(false)
    if (!res.ok) { alert(data.error || 'Errore nella generazione'); return }
    setTurniGenerati(data.turni)
    setSpiegazioneAI(data.spiegazione)
  }

  async function cancellaSettimana() {
    const turniDaCancellare = turni.filter(t => {
      const d = toISO(new Date(t.data))
      return d >= toISO(giorni[0]) && d <= toISO(giorni[6])
    })
    setCancellandoSett(true)
    await Promise.all(turniDaCancellare.map(t =>
      fetch(`/api/turni/${t.id}`, { method: 'DELETE', credentials: 'include' })
    ))
    setCancellandoSett(false)
    setConfirmCancella(false)
    await fetchAll()
  }

  async function copiaDaSettimanaPrec() {
    setCopiando(true)
    const settPrec = new Date(settimana)
    settPrec.setDate(settPrec.getDate() - 7)
    const safeJson = async (r: Response) => { try { return await r.json() } catch { return {} } }
    const { turni: turniPrec } = await fetch(`/api/turni?settimana=${toISO(settPrec)}`, { credentials: 'include' }).then(safeJson)
    if (!turniPrec || turniPrec.length === 0) { alert('Nessun turno nella settimana precedente'); setCopiando(false); return }
    await Promise.all((turniPrec as Turno[]).map((t: Turno) => {
      const nuovaData = new Date(t.data)
      nuovaData.setDate(nuovaData.getDate() + 7)
      return fetch('/api/turni', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipendenteId: t.dipendente.id, data: toISO(nuovaData), oraInizio: t.oraInizio, oraFine: t.oraFine, ruolo: t.ruolo, note: t.note }),
      })
    }))
    setCopiando(false)
    await fetchAll()
  }

  async function inviaReminder() {
    setInviandoReminder(true)
    const res = await fetch('/api/turni/reminder', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settimana: toISO(settimana) }),
    })
    const data = await res.json().catch(() => ({}))
    setInviandoReminder(false)
    if (!res.ok) { alert(data.error || 'Errore'); return }
    setReminderOk(`Reminder inviato a ${data.inviati} dipendent${data.inviati === 1 ? 'e' : 'i'}`)
    setTimeout(() => setReminderOk(null), 4000)
  }

  async function salvaTurniGenerati() {
    if (!turniGenerati) return
    setSalvandoTurni(true)
    await Promise.all(turniGenerati.map(t =>
      fetch('/api/turni', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipendenteId: t.dipendenteId, data: t.data, oraInizio: t.oraInizio, oraFine: t.oraFine, ruolo: t.ruolo, note: t.note }),
      })
    ))
    setSalvandoTurni(false)
    setTurniGenerati(null)
    setSpiegazioneAI('')
    setTab('turni')
    await fetchAll()
  }

  const giorni = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(settimana)
    d.setDate(d.getDate() + i)
    return d
  })

  const colorMap: Record<string, string> = {}
  dipendenti.forEach((d, i) => { colorMap[d.id] = COLORI[i % COLORI.length] })

  const richiesteInAttesa = richieste.filter(r => r.status === 'in_attesa')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Staff</h1>
          <p className="text-gray-500 text-sm mt-0.5">Turni, dipendenti e richieste</p>
        </div>
        <div className="flex gap-2">
          {tab === 'dipendenti' && (
            <button onClick={() => setShowModalDip(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 text-sm">
              + Dipendente
            </button>
          )}
          {tab === 'turni' && (
            <button onClick={() => setShowModalTurno(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 text-sm">
              + Turno
            </button>
          )}
        </div>
      </div>

      {linkInviato && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm font-medium">
          ✅ Link inviato a {linkInviato}
        </div>
      )}

      {/* Tab */}
      <div className="flex gap-2 flex-wrap">
        {([
          ['turni', '📅 Turni'],
          ['dipendenti', '👥 Dipendenti'],
          ['richieste', `📋 Richieste${richiesteInAttesa.length > 0 ? ` (${richiesteInAttesa.length})` : ''}`],
          ['genera', '✨ Genera con AI'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB TURNI ── */}
      {tab === 'turni' && (
        <div className="space-y-4">
          {/* Barra controlli */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle settimana/mese */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setVistaTurni('settimana')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vistaTurni === 'settimana' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Settimana
              </button>
              <button onClick={() => setVistaTurni('mese')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vistaTurni === 'mese' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Mese
              </button>
            </div>

            {/* Navigazione */}
            {vistaTurni === 'settimana' ? (
              <>
                <button onClick={() => { const d = new Date(settimana); d.setDate(d.getDate() - 7); setSettimana(d) }}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600">←</button>
                <span className="text-sm font-medium text-gray-700">
                  {settimana.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – {giorni[6].toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => { const d = new Date(settimana); d.setDate(d.getDate() + 7); setSettimana(d) }}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600">→</button>
                <button onClick={() => setSettimana(getLunedi(new Date()))}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Oggi</button>
              </>
            ) : (
              <>
                <button onClick={() => setMeseCal(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600">←</button>
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {meseCal.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => setMeseCal(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600">→</button>
                <button onClick={() => setMeseCal(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Oggi</button>
              </>
            )}

            <div className="ml-auto flex gap-2">
              {vistaTurni === 'settimana' && (
                <>
                  <button onClick={copiaDaSettimanaPrec} disabled={copiando}
                    className="text-xs px-3 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 font-medium disabled:opacity-50 transition-colors">
                    {copiando ? 'Copia...' : '📋 Copia sett. prec.'}
                  </button>
                  <button onClick={() => setConfirmCancella(true)} disabled={turni.length === 0}
                    className="text-xs px-3 py-1.5 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100 font-medium disabled:opacity-40 transition-colors">
                    🗑️ Cancella settimana
                  </button>
                </>
              )}
              <button onClick={inviaReminder} disabled={inviandoReminder}
                className="text-xs px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100 font-medium disabled:opacity-50 transition-colors">
                {inviandoReminder ? 'Invio...' : '📨 Invia reminder'}
              </button>
            </div>
          </div>

          {reminderOk && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 rounded-xl text-sm font-medium">
              ✅ {reminderOk}
            </div>
          )}

          {vistaTurni === 'settimana' && <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-8 border-b border-gray-200">
              <div className="p-3 text-xs font-semibold text-gray-400 uppercase"></div>
              {giorni.map((g, i) => {
                const isOggi = toISO(g) === toISO(new Date())
                return (
                  <div key={i} className={`p-3 text-center border-l border-gray-200 ${isOggi ? 'bg-indigo-50' : ''}`}>
                    <p className="text-xs font-semibold text-gray-400 uppercase">{GIORNI_BREVI[i]}</p>
                    <p className={`text-sm font-bold mt-0.5 ${isOggi ? 'text-indigo-600' : 'text-gray-700'}`}>{g.getDate()}</p>
                  </div>
                )
              })}
            </div>
            {dipendenti.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Aggiungi dipendenti per creare i turni</div>
            ) : (
              dipendenti.map(dip => (
                <div key={dip.id} className="grid grid-cols-8 border-b border-gray-100 last:border-0">
                  <div className="p-3 flex items-center gap-2 border-r border-gray-100">
                    <span className={`w-2 h-2 rounded-full ${colorMap[dip.id].split(' ')[0].replace('100', '500')}`}></span>
                    <div>
                      <p className="text-xs font-semibold text-gray-800 truncate max-w-[80px]">{dip.nome}</p>
                      {dip.ruolo && <p className="text-xs text-gray-400 truncate max-w-[80px]">{dip.ruolo}</p>}
                    </div>
                  </div>
                  {giorni.map((g, i) => {
                    const dataStr = toISO(g)
                    const turniGiorno = turni.filter(t => t.dipendente.id === dip.id && toISO(new Date(t.data)) === dataStr)
                    // Disponibilità
                    const dispDip = tutteDisp.find(d => d.dipendenteId === dip.id)
                    const haDisp = dispDip ? dispDip.giorni.some(gd => gd.data === dataStr) : null // null = dati non ancora caricati
                    const noDisp = dispDip !== undefined && !haDisp
                    // Richieste per questo giorno
                    const richiesteGiorno = richieste.filter(r => {
                      if (r.dipendente.id !== dip.id) return false
                      if (!r.data) return false
                      const rStart = r.data.split('T')[0]
                      const rEnd = r.dataFine ? r.dataFine.split('T')[0] : rStart
                      return dataStr >= rStart && dataStr <= rEnd
                    })
                    const tipiAssenza = ['assenza', 'malattia', 'permesso', 'ferie']
                    const assenza = richiesteGiorno.find(r => tipiAssenza.includes(r.tipo))
                    const preferenza = richiesteGiorno.find(r => !tipiAssenza.includes(r.tipo))
                    return (
                      <div key={i}
                        onClick={() => setCellModal({ dipendenteId: dip.id, nome: dip.nome, data: dataStr, dataLabel: g.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }), oraInizio: '09:00', oraFine: '17:00' })}
                        className={`border-l border-gray-100 min-h-[64px] p-1.5 space-y-1 cursor-pointer transition-colors group ${assenza ? '' : haDisp ? 'bg-green-50/50 hover:bg-green-50' : noDisp ? 'bg-gray-50 hover:bg-gray-100/60' : 'hover:bg-indigo-50/40'}`}>
                        {/* Indicatore disponibilità */}
                        {!assenza && haDisp && turniGiorno.length === 0 && (
                          <span className="inline-block text-[10px] font-medium text-green-500 leading-none">● disp.</span>
                        )}
                        {!assenza && noDisp && turniGiorno.length === 0 && (
                          <span className="inline-block text-[10px] font-medium text-gray-300 leading-none">✕ n.d.</span>
                        )}
                        {turniGiorno.map(t => {
                          const dispGiorno = (tutteDisp.find(d => d.dipendenteId === dip.id)?.giorni ?? []).find(gd => gd.data === dataStr)
                          const fuoriOrario = dispGiorno?.oraInizio && (t.oraInizio < dispGiorno.oraInizio || t.oraFine > dispGiorno.oraFine)
                          const warnTurno = noDisp || fuoriOrario
                          return (
                            <div key={t.id} className={`rounded-lg px-2 py-1 text-xs ${warnTurno ? 'bg-amber-100 text-amber-800' : colorMap[dip.id]} relative`}
                              onClick={e => e.stopPropagation()}
                              title={noDisp ? 'Non disponibile questo giorno' : fuoriOrario ? `Disponibile ${dispGiorno?.oraInizio}–${dispGiorno?.oraFine}` : undefined}>
                              <p className="font-semibold">{warnTurno ? '⚠️ ' : ''}{t.oraInizio}–{t.oraFine}</p>
                              {t.ruolo && <p className="opacity-75 truncate">{t.ruolo}</p>}
                              <button onClick={e => { e.stopPropagation(); eliminaTurno(t.id) }}
                                className="absolute top-0.5 right-0.5 text-red-400 hover:text-red-600 text-xs leading-none opacity-0 group-hover:opacity-100">✕</button>
                            </div>
                          )
                        })}
                        {/* Banner avvisi */}
                        {assenza && (
                          <div className={`rounded px-1.5 py-0.5 text-[10px] font-semibold truncate uppercase tracking-wide ${assenza.status === 'approvata' ? 'bg-red-100 text-red-500' : 'bg-amber-50 text-amber-500 border border-amber-200'}`}
                            title={assenza.note ?? undefined}>
                            {assenza.status === 'approvata' ? assenza.tipo.replace('_', ' ') : `${assenza.tipo.replace('_', ' ')} ?`}
                          </div>
                        )}
                        {preferenza && (
                          <div className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-400 truncate uppercase tracking-wide border border-blue-100"
                            title={preferenza.note ?? undefined}>
                            pref. orario
                          </div>
                        )}

                        <p className="text-indigo-200 group-hover:text-indigo-400 text-center text-base leading-none transition-colors">+</p>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>}

          {/* ── VISTA MESE ── */}
          {vistaTurni === 'mese' && (() => {
            const primoGiornoMese = new Date(meseCal.getFullYear(), meseCal.getMonth(), 1)
            const ultimoGiornoMese = new Date(meseCal.getFullYear(), meseCal.getMonth() + 1, 0)
            const offsetInizio = primoGiornoMese.getDay() === 0 ? 6 : primoGiornoMese.getDay() - 1
            const totaleCelle = Math.ceil((offsetInizio + ultimoGiornoMese.getDate()) / 7) * 7
            return (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="grid grid-cols-7 border-b border-gray-200">
                  {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((g, i) => (
                    <div key={i} className={`py-3 text-center text-xs font-bold ${i >= 5 ? 'text-indigo-400' : 'text-gray-400'}`}>{g}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({ length: totaleCelle }, (_, idx) => {
                    const giornoNum = idx - offsetInizio + 1
                    const isDelMese = giornoNum >= 1 && giornoNum <= ultimoGiornoMese.getDate()
                    const dataCorrente = isDelMese
                      ? `${meseCal.getFullYear()}-${String(meseCal.getMonth() + 1).padStart(2, '0')}-${String(giornoNum).padStart(2, '0')}`
                      : null
                    const turniGiorno = dataCorrente ? turniMese.filter(t => t.data.split('T')[0] === dataCorrente) : []
                    const isOggi = dataCorrente === toISO(new Date())
                    const isWeekend = idx % 7 >= 5
                    return (
                      <div key={idx} className={`min-h-[80px] p-1.5 border-b border-r border-gray-100
                        ${!isDelMese ? 'bg-gray-50/60' : isWeekend ? 'bg-indigo-50/20' : 'bg-white'}`}>
                        {isDelMese && (
                          <>
                            <p className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1
                              ${isOggi ? 'bg-indigo-600 text-white' : isWeekend ? 'text-indigo-500' : 'text-gray-700'}`}>
                              {giornoNum}
                            </p>
                            {turniGiorno.map((t, i) => (
                              <div key={i}
                                onClick={() => setTurnoDettaglio(turnoDettaglio?.id === t.id ? null : t)}
                                className={`rounded px-1.5 py-0.5 text-xs font-semibold mb-0.5 cursor-pointer truncate ${colorMap[t.dipendente.id] ?? 'bg-gray-100 text-gray-600'}`}>
                                {t.dipendente.nome.split(' ')[0]} {t.oraInizio}–{t.oraFine}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Dettaglio turno mese */}
          {vistaTurni === 'mese' && turnoDettaglio && (
            <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{turnoDettaglio.dipendente.nome}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {new Date(turnoDettaglio.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-indigo-600 font-bold text-lg mt-1">{turnoDettaglio.oraInizio} – {turnoDettaglio.oraFine}</p>
                  {turnoDettaglio.ruolo && <p className="text-gray-500 text-sm mt-0.5">{turnoDettaglio.ruolo}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => eliminaTurno(turnoDettaglio.id).then(() => setTurnoDettaglio(null))}
                    className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 font-medium">Elimina</button>
                  <button onClick={() => setTurnoDettaglio(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>
              </div>
            </div>
          )}

          {/* Legenda colori dipendenti (vista mese) */}
          {vistaTurni === 'mese' && dipendenti.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {dipendenti.map((d, i) => (
                <div key={d.id} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full ${COLORI[i % COLORI.length].split(' ')[0].replace('100','400')}`}></span>
                  <span className="text-xs text-gray-600">{d.nome}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB DIPENDENTI ── */}
      {tab === 'dipendenti' && (
        <div className="space-y-3">
          {dipendenti.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
              <div className="text-5xl mb-4">👥</div>
              <h3 className="text-lg font-semibold text-gray-800">Nessun dipendente</h3>
              <p className="text-gray-500 text-sm mt-2">Aggiungi i tuoi dipendenti per gestire i turni</p>
            </div>
          ) : dipendenti.map((d, i) => (
            <div key={d.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${COLORI[i % COLORI.length]}`}>
                    {d.nome[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{d.nome}</p>
                    <p className="text-sm text-gray-500">{d.email}</p>
                    {d.ruolo && <p className="text-xs text-gray-400">{d.ruolo}</p>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <button onClick={() => apriDispModal(d)}
                    className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium">
                    📆 Disponibilità
                  </button>
                  <button onClick={() => inviaLink(d.email, d.nome)}
                    className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-medium">
                    📨 Invia link
                  </button>
                  <button onClick={() => apriModifica(d)}
                    className="text-gray-400 hover:text-indigo-500 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors">✏️</button>
                  <button onClick={() => eliminaDipendente(d.id)}
                    className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB RICHIESTE ── */}
      {tab === 'richieste' && (
        <div className="space-y-3">
          {richieste.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
              <p className="text-gray-400 text-sm">Nessuna richiesta ricevuta</p>
            </div>
          ) : richieste.map(r => (
            <div key={r.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${r.status === 'in_attesa' ? 'border-amber-200' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{r.dipendente.nome}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                      {r.tipo.replace('_', ' ')}
                    </span>
                  </div>
                  {r.data && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {new Date(r.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                      {r.dataFine && r.dataFine !== r.data && ` → ${new Date(r.dataFine).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`}
                    </p>
                  )}
                  {r.note && <p className="text-xs text-gray-400 mt-1 truncate">{r.note}</p>}
                  <p className="text-xs text-gray-300 mt-1">{new Date(r.createdAt).toLocaleDateString('it-IT')}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.status === 'in_attesa' && (
                    <>
                      <button onClick={() => aggiornaRichiesta(r.id, 'approvata')}
                        className="text-xs px-2.5 py-1 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 font-medium border border-green-200">Approva</button>
                      <button onClick={() => aggiornaRichiesta(r.id, 'rifiutata')}
                        className="text-xs px-2.5 py-1 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 font-medium border border-gray-200">Rifiuta</button>
                    </>
                  )}
                  {r.status !== 'in_attesa' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'approvata' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.status === 'approvata' ? 'Approvata' : 'Rifiutata'}
                    </span>
                  )}
                  <button onClick={async () => {
                    if (!confirm('Eliminare questa richiesta?')) return
                    await fetch(`/api/richieste-staff/${r.id}`, { method: 'DELETE', credentials: 'include' })
                    fetchAll()
                  }} className="text-xs px-2 py-1 text-gray-300 hover:text-red-400 rounded-lg hover:bg-red-50 transition-colors font-medium">
                    Elimina
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB GENERA CON AI ── */}
      {tab === 'genera' && (
        <div className="space-y-5">

          {/* ── Genera turni ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-900">Genera piano turni con AI</h3>

            {/* Settimana */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium w-20">Settimana</span>
              <button onClick={() => { const d = new Date(settimana); d.setDate(d.getDate() - 7); setSettimana(d) }}
                className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm">←</button>
              <span className="text-sm font-semibold text-indigo-700 flex-1 text-center">
                {settimana.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – {giorni[6].toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => { const d = new Date(settimana); d.setDate(d.getDate() + 7); setSettimana(d) }}
                className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm">→</button>
              <button onClick={() => setSettimana(getLunedi(new Date()))}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Oggi</button>
            </div>

            {/* Fabbisogno modificabile per questa settimana */}
            <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">Fabbisogno per questa settimana <span className="font-normal text-gray-400">(copia del template, modificabile)</span></p>
                <div className="flex items-center gap-2">
                  <button onClick={() => { localStorage.removeItem(`fabb_${toISO(settimana)}`); setFabbisognoSett(fabbisogno) }}
                    className="text-xs text-gray-400 hover:text-indigo-600 font-medium transition-colors">↺ Ripristina</button>
                  <button onClick={() => setFabbisognoSett(s => [...s, { giorno: 0, fascia: 'libera', oraInizio: '09:00', oraFine: '17:00', persone: 1, ruolo: '' }])}
                    className="text-xs px-2.5 py-1 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">+ Aggiungi</button>
                </div>
              </div>
              {fabbisognoSett.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">
                  Nessun fabbisogno configurato —{' '}
                  <a href="/dashboard/impostazioni?sezione=staff" className="text-indigo-500 hover:underline">configuralo in Impostazioni → Staff</a>
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-[110px_1fr_1fr_1fr_1fr_24px] gap-1.5 px-0.5">
                    {['Giorno', 'Dalle', 'Alle', 'N°', 'Ruolo', ''].map((h, i) => (
                      <span key={i} className="text-xs font-semibold text-gray-400 uppercase">{h}</span>
                    ))}
                  </div>
                  {fabbisognoSett.map((r, i) => (
                    <div key={i} className="grid grid-cols-[110px_1fr_1fr_1fr_1fr_24px] gap-1.5 items-center">
                      <select value={r.giorno} onChange={e => setFabbisognoSett(s => s.map((x, idx) => idx === i ? { ...x, giorno: Number(e.target.value) } : x))}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                        {GIORNI_LUNGHI.map((g, idx) => <option key={idx} value={idx}>{g}</option>)}
                      </select>
                      <input type="time" value={r.oraInizio} onChange={e => setFabbisognoSett(s => s.map((x, idx) => idx === i ? { ...x, oraInizio: e.target.value } : x))}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                      <input type="time" value={r.oraFine} onChange={e => setFabbisognoSett(s => s.map((x, idx) => idx === i ? { ...x, oraFine: e.target.value } : x))}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                      <input type="number" min={1} max={20} value={r.persone} onChange={e => setFabbisognoSett(s => s.map((x, idx) => idx === i ? { ...x, persone: Number(e.target.value) } : x))}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                      <input placeholder="ruolo" value={r.ruolo} onChange={e => setFabbisognoSett(s => s.map((x, idx) => idx === i ? { ...x, ruolo: e.target.value } : x))}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                      <button onClick={() => setFabbisognoSett(s => s.filter((_, idx) => idx !== i))}
                        className="text-gray-300 hover:text-red-500 text-sm font-bold transition-colors">✕</button>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Note aggiuntive */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Note aggiuntive <span className="text-gray-400 font-normal">(opzionale)</span></label>
              <textarea value={noteGenerazione} onChange={e => setNoteGenerazione(e.target.value)}
                placeholder="es. questa settimana abbiamo un evento sabato sera, servono 2 persone in più..."
                rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </div>

            <button onClick={generaTurni} disabled={generando || dipendenti.length === 0}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm">
              {generando ? <><span className="animate-spin inline-block">⟳</span> L'AI sta elaborando il piano...</> : '✨ Genera piano turni'}
            </button>
            {dipendenti.length === 0 && (
              <p className="text-center text-xs text-gray-400">Aggiungi almeno un dipendente prima di generare i turni</p>
            )}
          </div>

          {/* ── Risultato AI ── */}
          {turniGenerati && (
            <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">✨</span>
                <div>
                  <h3 className="font-bold text-gray-900">Piano turni generato</h3>
                  {spiegazioneAI && <p className="text-sm text-gray-500 mt-1">{spiegazioneAI}</p>}
                </div>
              </div>
              <p className="text-xs text-gray-400">Modifica i turni se vuoi, poi conferma per salvarli nella griglia.</p>
              <div className="space-y-3">
                {GIORNI_LUNGHI.map((giorno, idx) => {
                  const turniGiorno = turniGenerati.map((t, gIdx) => ({ ...t, gIdx })).filter(t => t.giorno === idx)
                  if (turniGiorno.length === 0) return null
                  return (
                    <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-bold text-gray-500 uppercase">{giorno}</p>
                      {turniGiorno.map(({ gIdx, ...t }) => (
                        <div key={gIdx} className="grid grid-cols-[1fr_80px_80px_28px] gap-2 items-center bg-gray-50 rounded-lg p-2">
                          <select value={t.dipendenteId}
                            onChange={e => { const dip = dipendenti.find(d => d.id === e.target.value); setTurniGenerati(prev => prev!.map((x, i) => i === gIdx ? { ...x, dipendenteId: e.target.value, nome: dip?.nome ?? x.nome } : x)) }}
                            className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                            {dipendenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                          </select>
                          <input type="time" value={t.oraInizio}
                            onChange={e => setTurniGenerati(prev => prev!.map((x, i) => i === gIdx ? { ...x, oraInizio: e.target.value } : x))}
                            className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                          <input type="time" value={t.oraFine}
                            onChange={e => setTurniGenerati(prev => prev!.map((x, i) => i === gIdx ? { ...x, oraFine: e.target.value } : x))}
                            className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                          <button onClick={() => setTurniGenerati(prev => prev!.filter((_, i) => i !== gIdx))}
                            className="text-gray-300 hover:text-red-500 text-sm font-bold transition-colors">✕</button>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setTurniGenerati(null); setSpiegazioneAI('') }}
                  className="flex-1 border border-red-300 text-red-600 font-semibold py-2.5 rounded-xl hover:bg-red-50 text-sm">✕ Annulla proposta</button>
                <button onClick={salvaTurniGenerati} disabled={salvandoTurni}
                  className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-xl hover:bg-green-700 text-sm disabled:opacity-50">
                  {salvandoTurni ? 'Salvataggio...' : '✓ Conferma e salva'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal aggiungi turno da cella */}
      {cellModal && (() => {
        const dispCella = (tutteDisp.find(d => d.dipendenteId === cellModal.dipendenteId)?.giorni ?? []).find(gd => gd.data === cellModal.data)
        const hasDispCella = tutteDisp.some(d => d.dipendenteId === cellModal.dipendenteId)
        const noDispCella = hasDispCella && !dispCella
        const fuoriOrarioCella = dispCella?.oraInizio && (cellModal.oraInizio < dispCella.oraInizio || cellModal.oraFine > dispCella.oraFine)
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">{cellModal.nome}</h3>
              <p className="text-sm text-gray-500">{cellModal.dataLabel}</p>
            </div>
            {noDispCella && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium">
                ⚠️ Questo dipendente non ha dichiarato disponibilità per questo giorno.
              </div>
            )}
            {fuoriOrarioCella && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium">
                ⚠️ Disponibile solo dalle {dispCella?.oraInizio} alle {dispCella?.oraFine}.
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Dalle</label>
                <input type="time" value={cellModal.oraInizio}
                  onChange={e => setCellModal(m => m ? { ...m, oraInizio: e.target.value } : m)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Alle</label>
                <input type="time" value={cellModal.oraFine}
                  onChange={e => setCellModal(m => m ? { ...m, oraFine: e.target.value } : m)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCellModal(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">Annulla</button>
              <button onClick={salvaDaCella} disabled={savingCell}
                className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50">
                {savingCell ? '...' : 'Salva turno'}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Modal modifica dipendente */}
      {dipendenteDaModificare && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Modifica dipendente</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input value={formModifica.nome} onChange={e => setFormModifica(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={formModifica.email} onChange={e => setFormModifica(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ruolo</label>
                <input placeholder="es. Cameriere, Chef..." value={formModifica.ruolo} onChange={e => setFormModifica(f => ({ ...f, ruolo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setDipendenteDaModificare(null)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">Annulla</button>
              <button onClick={salvaDipendente} disabled={saving || !formModifica.nome || !formModifica.email}
                className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50">
                {saving ? 'Salvataggio...' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuovo dipendente */}
      {showModalDip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Nuovo dipendente</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input value={formDip.nome} onChange={e => setFormDip(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={formDip.email} onChange={e => setFormDip(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ruolo</label>
                <input placeholder="es. Cameriere, Chef, Cassiere..." value={formDip.ruolo} onChange={e => setFormDip(f => ({ ...f, ruolo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModalDip(false)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">Annulla</button>
              <button onClick={aggiungiDipendente} disabled={saving || !formDip.nome || !formDip.email}
                className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50">
                {saving ? 'Salvataggio...' : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal disponibilità dipendente */}
      {dispModal && (() => {
        const primoG = new Date(dispMese.getFullYear(), dispMese.getMonth(), 1)
        const ultimoG = new Date(dispMese.getFullYear(), dispMese.getMonth() + 1, 0)
        const offset = primoG.getDay() === 0 ? 6 : primoG.getDay() - 1
        const totCelle = Math.ceil((offset + ultimoG.getDate()) / 7) * 7
        const oggi = toISO(new Date())
        const detSel = dispGiornoSel ? dispGiorni.find(g => g.data === dispGiornoSel) : null
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Disponibilità — {dispModal.dipendente.nome}</h3>
                  <p className="text-xs text-gray-400">{dispModal.dipendente.ruolo || dispModal.dipendente.email}</p>
                </div>
                <button onClick={() => setDispModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>

              {/* Navigazione mese */}
              <div className="flex items-center justify-between">
                <button onClick={async () => { const m = new Date(dispMese.getFullYear(), dispMese.getMonth() - 1, 1); setDispMese(m); setDispGiornoSel(null); await caricaDisp(dispModal.dipendente.id, m) }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">←</button>
                <span className="font-semibold text-gray-800 text-sm capitalize">
                  {dispMese.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={async () => { const m = new Date(dispMese.getFullYear(), dispMese.getMonth() + 1, 1); setDispMese(m); setDispGiornoSel(null); await caricaDisp(dispModal.dipendente.id, m) }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">→</button>
              </div>

              {loadingDisp ? (
                <p className="text-center text-sm text-gray-400 py-4">Caricamento...</p>
              ) : (
                <>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-gray-100">
                      {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((g, i) => (
                        <div key={i} className={`py-2 text-center text-xs font-bold ${i >= 5 ? 'text-indigo-400' : 'text-gray-400'}`}>{g}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {Array.from({ length: totCelle }, (_, idx) => {
                        const gNum = idx - offset + 1
                        const isDelMese = gNum >= 1 && gNum <= ultimoG.getDate()
                        const dataStr = isDelMese ? `${dispMese.getFullYear()}-${String(dispMese.getMonth() + 1).padStart(2, '0')}-${String(gNum).padStart(2, '0')}` : null
                        const dispGiorno = dataStr ? dispGiorni.find(g => g.data === dataStr) : null
                        const isDisp = !!dispGiorno
                        const hasOrario = !!(dispGiorno?.oraInizio)
                        const isSel = dataStr === dispGiornoSel
                        const isOggi = dataStr === oggi
                        return (
                          <div key={idx}
                            onClick={() => isDelMese && dataStr && isDisp && setDispGiornoSel(isSel ? null : dataStr)}
                            className={`min-h-[44px] p-1 border-b border-r border-gray-100 flex flex-col items-center justify-start pt-1.5
                              ${!isDelMese ? 'bg-gray-50/60' : isDisp ? 'bg-green-100 cursor-pointer hover:bg-green-200' : 'bg-white'}
                              ${isSel ? 'ring-2 ring-inset ring-green-500' : ''}`}>
                            {isDelMese && (
                              <>
                                <p className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                                  ${isOggi ? 'bg-indigo-600 text-white' : isDisp ? 'text-green-700' : 'text-gray-400'}`}>
                                  {gNum}
                                </p>
                                {hasOrario && <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-0.5" title="Orario specifico"></span>}
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {dispGiorni.length === 0 ? (
                    <p className="text-center text-sm text-gray-400">Nessuna disponibilità inviata per questo mese</p>
                  ) : (
                    <div className="flex items-center gap-4 flex-wrap">
                      <p className="text-xs text-green-700 font-medium">{dispGiorni.length} giorn{dispGiorni.length === 1 ? 'o' : 'i'} disponibil{dispGiorni.length === 1 ? 'e' : 'i'}</p>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span className="w-2 h-2 rounded-full bg-red-400"></span>Orario specifico
                      </div>
                    </div>
                  )}

                  {detSel && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-1">
                      <p className="font-semibold text-green-900 text-sm">
                        {new Date(detSel.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                      <p className="text-green-800 font-bold">
                        {detSel.oraInizio ? `${detSel.oraInizio} – ${detSel.oraFine}` : 'Tutto il giorno'}
                      </p>
                      {detSel.note && <p className="text-green-600 text-xs">{detSel.note}</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Modal conferma cancella settimana */}
      {confirmCancella && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="text-lg font-bold text-gray-900">Cancella tutti i turni</h3>
              <p className="text-sm text-gray-500 mt-2">
                Stai per eliminare <span className="font-semibold text-red-600">{turni.length} turni</span> della settimana<br />
                <span className="font-medium">{settimana.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – {giorni[6].toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </p>
              <p className="text-xs text-red-500 mt-2 font-medium">Questa azione non è reversibile.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmCancella(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                Annulla
              </button>
              <button onClick={cancellaSettimana} disabled={cancellandoSett}
                className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 text-sm disabled:opacity-50">
                {cancellandoSett ? 'Cancellazione...' : 'Sì, cancella tutto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuovo turno */}
      {showModalTurno && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Nuovo turno</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dipendente *</label>
                <select value={formTurno.dipendenteId} onChange={e => setFormTurno(f => ({ ...f, dipendenteId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Seleziona...</option>
                  {dipendenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                <input type="date" value={formTurno.data} onChange={e => setFormTurno(f => ({ ...f, data: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inizio *</label>
                  <input type="time" value={formTurno.oraInizio} onChange={e => setFormTurno(f => ({ ...f, oraInizio: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fine *</label>
                  <input type="time" value={formTurno.oraFine} onChange={e => setFormTurno(f => ({ ...f, oraFine: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ruolo specifico</label>
                <input placeholder="es. Sala, Cucina..." value={formTurno.ruolo} onChange={e => setFormTurno(f => ({ ...f, ruolo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <input value={formTurno.note} onChange={e => setFormTurno(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModalTurno(false)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">Annulla</button>
              <button onClick={aggiungiTurno} disabled={saving || !formTurno.dipendenteId || !formTurno.data}
                className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50">
                {saving ? 'Salvataggio...' : 'Aggiungi turno'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

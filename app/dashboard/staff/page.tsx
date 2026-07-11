'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { IconUsers, IconTrash, IconPencil } from '../../components/icons'

interface Dipendente {
  id: string
  nome: string
  email: string
  ruolo: string | null
  fotoUrl: string | null
  username: string | null
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


const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const GIORNI_LUNGHI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
const COLORI = ['bg-electric-blue/15 text-electric-blue', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-pink-100 text-pink-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700']

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
  const [tab, setTab] = useState<'turni' | 'dipendenti' | 'richieste' | 'presenze'>('presenze')
  const [qrDip, setQrDip] = useState<{ nome: string; url: string } | null>(null)
  const [publicId, setPublicId] = useState<string | null>(null)
  const [nomeLocale, setNomeLocale] = useState<string | null>(null)

  // Presenze
  const oggiStr = (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}` })()
  const [presenzeData, setPresenzeData] = useState(oggiStr)
  const [presenzeList, setPresenzeList] = useState<{ id: string; tipo: string; timestamp: string; dipendente: { nome: string; ruolo: string | null } }[]>([])
  const [presenzeLoading, setPresenzeLoading] = useState(false)

  async function fetchPresenze(d: string, silent = false) {
    if (!silent) setPresenzeLoading(true)
    const res = await fetch(`/api/qr-timbratura/storico?data=${d}`, { credentials: 'include' })
    if (res.ok) { const j = await res.json(); setPresenzeList(j.timbrature) }
    if (!silent) setPresenzeLoading(false)
  }
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([])
  const [turni, setTurni] = useState<Turno[]>([])
  const [richieste, setRichieste] = useState<Richiesta[]>([])
  const [settimana, setSettimana] = useState(getLunedi(new Date()))
  const [showModalDip, setShowModalDip] = useState(false)
  const [showModalTurno, setShowModalTurno] = useState(false)
  const [formDip, setFormDip] = useState({ nome: '', email: '', ruolo: '', fotoUrl: '' })
  const [formTurno, setFormTurno] = useState({ dipendenteId: '', data: '', oraInizio: '09:00', oraFine: '17:00', ruolo: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [dipPasswordModal, setDipPasswordModal] = useState<Dipendente | null>(null)
  const [nuovaPasswordDip, setNuovaPasswordDip] = useState('')
  const [usernameGenerato, setUsernameGenerato] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [linkInviato, setLinkInviato] = useState<string | null>(null)
  const [dipendenteDaModificare, setDipendenteDaModificare] = useState<Dipendente | null>(null)
  const [formModifica, setFormModifica] = useState({ nome: '', email: '', ruolo: '', fotoUrl: '' })

  // Vista turni
  const [vistaTurni, setVistaTurni] = useState<'settimana' | 'mese'>('settimana')
  const [meseCal, setMeseCal] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [turnoDettaglio, setTurnoDettaglio] = useState<Turno | null>(null)

  // Modal click-su-cella
  const [cellModal, setCellModal] = useState<{ dipendenteId: string; nome: string; data: string; dataLabel: string; oraInizio: string; oraFine: string } | null>(null)
  const [savingCell, setSavingCell] = useState(false)

  // Modifica turno
  const [editTurno, setEditTurno] = useState<Turno | null>(null)
  const [editForm, setEditForm] = useState({ oraInizio: '09:00', oraFine: '17:00', ruolo: '', note: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  // Fabbisogno (caricato dalle impostazioni, usato come base per la settimana)
  const [fabbisogno, setFabbisogno] = useState<Requisito[]>([])
  const fabbisognoLoaded = useRef(false)

  const [inviandoReminder, setInviandoReminder] = useState(false)
  const [reminderOk, setReminderOk] = useState<string | null>(null)
  const [copiando, setCopiando] = useState(false)
  const [cancellandoSett, setCancellandoSett] = useState(false)
  const [confirmCancella, setConfirmCancella] = useState(false)
  const [conferma, setConferma] = useState<{ msg: string; onConfirm: () => void } | null>(null)

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
    setPublicId(s.publicId ?? null)
    setNomeLocale(s.nomeLocale ?? null)
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


  useEffect(() => { fetchAll(); fetchDisp(settimana) }, [settimana])
  useEffect(() => { if (vistaTurni === 'mese') fetchTurniMese() }, [meseCal, vistaTurni])
  useEffect(() => { if (tab === 'presenze') fetchPresenze(presenzeData) }, [tab, presenzeData])
  useEffect(() => {
    if (tab !== 'presenze' || presenzeData !== oggiStr) return
    const t = setInterval(() => fetchPresenze(oggiStr, true), 15000)
    return () => clearInterval(t)
  }, [tab, presenzeData])


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
    setFormDip({ nome: '', email: '', ruolo: '', fotoUrl: '' })
    await fetchAll()
  }

  function apriModifica(d: Dipendente) {
    setDipendenteDaModificare(d)
    setFormModifica({ nome: d.nome, email: d.email, ruolo: d.ruolo ?? '', fotoUrl: d.fotoUrl ?? '' })
  }

  async function salvaDipendente() {
    if (!dipendenteDaModificare) return
    setSaving(true)
    await fetch(`/api/dipendenti/${dipendenteDaModificare.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: formModifica.nome, email: formModifica.email, ruolo: formModifica.ruolo || null, fotoUrl: formModifica.fotoUrl || null }),
    })
    setSaving(false)
    setDipendenteDaModificare(null)
    await fetchAll()
  }

  async function impostaPassword() {
    if (!dipPasswordModal || !nuovaPasswordDip) return
    setSavingPassword(true)
    try {
      const res = await fetch(`/api/dipendenti/${dipPasswordModal.id}/set-password`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: nuovaPasswordDip }),
      })
      const text = await res.text()
      if (res.ok) {
        const d = JSON.parse(text)
        setUsernameGenerato(d.username)
        setNuovaPasswordDip('')
        await fetchAll()
      } else {
        alert(`Errore ${res.status}: ${text || '(risposta vuota)'}`)
      }
    } catch (err) {
      alert('Errore: ' + String(err))
    } finally {
      setSavingPassword(false)
    }
  }

  async function eliminaDipendente(id: string) {
    setConferma({ msg: 'Eliminare questo dipendente e tutti i suoi turni?', onConfirm: async () => {
      await fetch(`/api/dipendenti/${id}`, { method: 'DELETE', credentials: 'include' })
      fetchAll()
    }})
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

  async function modificaTurno() {
    if (!editTurno) return
    setSavingEdit(true)
    await fetch(`/api/turni/${editTurno.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setSavingEdit(false)
    setEditTurno(null)
    setTurnoDettaglio(null)
    fetchAll(); fetchTurniMese()
  }

  function apriEditTurno(t: Turno) {
    setEditForm({ oraInizio: t.oraInizio, oraFine: t.oraFine, ruolo: t.ruolo ?? '', note: t.note ?? '' })
    setEditTurno(t)
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
    const res = await fetch('/api/staff/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      setLinkInviato(nome)
      setTimeout(() => setLinkInviato(null), 3000)
    } else {
      const data = await res.json()
      setLinkInviato(`Errore: ${data.error || 'impossibile inviare'}`)
      setTimeout(() => setLinkInviato(null), 4000)
    }
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
          <h1 className="text-2xl font-bold text-ink-navy">Gestione Staff</h1>
          <p className="text-ink-navy/50 text-sm mt-0.5">Turni, dipendenti e richieste</p>
        </div>
        <div className="flex gap-2">
          {tab === 'dipendenti' && (
            <button onClick={() => setShowModalDip(true)} className="bg-electric-blue text-white px-4 py-2 rounded-xl font-medium hover:bg-electric-blue/90 text-sm">
              + Dipendente
            </button>
          )}
          {tab === 'turni' && (
            <button onClick={() => setShowModalTurno(true)} className="bg-electric-blue text-white px-4 py-2 rounded-xl font-medium hover:bg-electric-blue/90 text-sm">
              + Turno
            </button>
          )}
        </div>
      </div>

      {linkInviato && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${linkInviato.startsWith('Errore:') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
          {linkInviato.startsWith('Errore:') ? linkInviato : `✉️ Link inviato a ${linkInviato}`}
        </div>
      )}

      {/* Tab */}
      <div className="flex gap-2 flex-wrap">
        {([
          ['presenze', 'Presenze'],
          ['dipendenti', 'Dipendenti'],
          ['turni', 'Turni'],
          ['richieste', `Richieste${richiesteInAttesa.length > 0 ? ` (${richiesteInAttesa.length})` : ''}`],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === id ? 'bg-electric-blue text-white' : 'bg-white border border-ink-navy/15 text-ink-navy/60 hover:bg-mist'}`}>
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
            <div className="flex bg-mist rounded-lg p-0.5">
              <button onClick={() => setVistaTurni('settimana')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vistaTurni === 'settimana' ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                Settimana
              </button>
              <button onClick={() => setVistaTurni('mese')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vistaTurni === 'mese' ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                Mese
              </button>
            </div>

            {/* Navigazione */}
            {vistaTurni === 'settimana' ? (
              <>
                <button onClick={() => { const d = new Date(settimana); d.setDate(d.getDate() - 7); setSettimana(d) }}
                  className="p-2 rounded-lg border border-ink-navy/15 hover:bg-mist text-ink-navy/60">←</button>
                <span className="text-sm font-medium text-ink-navy/70">
                  {settimana.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – {giorni[6].toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => { const d = new Date(settimana); d.setDate(d.getDate() + 7); setSettimana(d) }}
                  className="p-2 rounded-lg border border-ink-navy/15 hover:bg-mist text-ink-navy/60">→</button>
                <button onClick={() => setSettimana(getLunedi(new Date()))}
                  className="text-xs text-electric-blue hover:text-ink-navy font-medium">Oggi</button>
              </>
            ) : (
              <>
                <button onClick={() => setMeseCal(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  className="p-2 rounded-lg border border-ink-navy/15 hover:bg-mist text-ink-navy/60">←</button>
                <span className="text-sm font-medium text-ink-navy/70 capitalize">
                  {meseCal.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => setMeseCal(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  className="p-2 rounded-lg border border-ink-navy/15 hover:bg-mist text-ink-navy/60">→</button>
                <button onClick={() => setMeseCal(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                  className="text-xs text-electric-blue hover:text-ink-navy font-medium">Oggi</button>
              </>
            )}

            <div className="ml-auto flex gap-2">
              {vistaTurni === 'settimana' && (
                <>
                  <button onClick={copiaDaSettimanaPrec} disabled={copiando}
                    className="text-xs px-3 py-1.5 bg-mist text-ink-navy/60 border border-ink-navy/10 rounded-lg hover:bg-mist font-medium disabled:opacity-50 transition-colors">
                    {copiando ? 'Copia...' : 'Copia sett. prec.'}
                  </button>
                  <button onClick={() => setConfirmCancella(true)} disabled={turni.length === 0}
                    className="text-xs px-3 py-1.5 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100 font-medium disabled:opacity-40 transition-colors">
                     Cancella settimana
                  </button>
                </>
              )}
              <button onClick={inviaReminder} disabled={inviandoReminder}
                className="text-xs px-3 py-1.5 bg-violet-50 text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-100 font-medium disabled:opacity-50 transition-colors">
                {inviandoReminder ? 'Invio...' : 'Invia reminder'}
              </button>
            </div>
          </div>

          {reminderOk && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 rounded-xl text-sm font-medium">
              {reminderOk}
            </div>
          )}

          {vistaTurni === 'settimana' && <div className="bg-white rounded-2xl border border-ink-navy/10 overflow-hidden shadow-sm">
            <div className="grid grid-cols-8 border-b border-ink-navy/10">
              <div className="p-3 text-xs font-semibold text-ink-navy/35 uppercase"></div>
              {giorni.map((g, i) => {
                const isOggi = toISO(g) === toISO(new Date())
                return (
                  <div key={i} className={`p-3 text-center border-l border-ink-navy/10 ${isOggi ? 'bg-electric-blue/10' : ''}`}>
                    <p className="text-xs font-semibold text-ink-navy/35 uppercase">{GIORNI_BREVI[i]}</p>
                    <p className={`text-sm font-bold mt-0.5 ${isOggi ? 'text-electric-blue' : 'text-ink-navy/70'}`}>{g.getDate()}</p>
                  </div>
                )
              })}
            </div>
            {dipendenti.length === 0 ? (
              <div className="p-8 text-center text-ink-navy/35 text-sm">Aggiungi dipendenti per creare i turni</div>
            ) : (
              dipendenti.map(dip => (
                <div key={dip.id} className="grid grid-cols-8 border-b border-ink-navy/8 last:border-0">
                  <div className="p-3 flex items-center gap-2 border-r border-ink-navy/8">
                    <span className={`w-2 h-2 rounded-full ${colorMap[dip.id].split(' ')[0].replace('100', '500')}`}></span>
                    <div>
                      <p className="text-xs font-semibold text-ink-navy truncate max-w-[80px]">{dip.nome}</p>
                      {dip.ruolo && <p className="text-xs text-ink-navy/35 truncate max-w-[80px]">{dip.ruolo}</p>}
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
                    const assenza = richiesteGiorno.find(r => tipiAssenza.includes(r.tipo) && r.status !== 'rifiutata')
                    const preferenza = richiesteGiorno.find(r => !tipiAssenza.includes(r.tipo) && r.status !== 'rifiutata')
                    return (
                      <div key={i}
                        onClick={() => setCellModal({ dipendenteId: dip.id, nome: dip.nome, data: dataStr, dataLabel: g.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }), oraInizio: '09:00', oraFine: '17:00' })}
                        className={`border-l border-ink-navy/8 min-h-[64px] p-1.5 space-y-1 cursor-pointer transition-colors group ${assenza ? '' : haDisp ? 'bg-green-50/50 hover:bg-green-50' : noDisp ? 'bg-mist hover:bg-mist/60' : 'hover:bg-electric-blue/10'}`}>
                        {/* Indicatore disponibilità */}
                        {!assenza && haDisp && turniGiorno.length === 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-500 leading-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            disp.
                          </span>
                        )}
                        {!assenza && noDisp && turniGiorno.length === 0 && (
                          <span className="inline-block text-[10px] font-medium text-ink-navy/25 leading-none">✕ n.d.</span>
                        )}
                        {turniGiorno.map(t => {
                          const dispGiorno = (tutteDisp.find(d => d.dipendenteId === dip.id)?.giorni ?? []).find(gd => gd.data === dataStr)
                          const fuoriOrario = dispGiorno?.oraInizio && (t.oraInizio < dispGiorno.oraInizio || t.oraFine > dispGiorno.oraFine)
                          const assenzaApp = assenza?.status === 'approvata'
                          const warnTurno = noDisp || !!fuoriOrario || assenzaApp
                          const warnTitle = assenzaApp ? `${assenza!.tipo.replace('_',' ')} approvata` : noDisp ? 'Non disponibile questo giorno' : fuoriOrario ? `Disponibile ${dispGiorno?.oraInizio}–${dispGiorno?.oraFine}` : undefined
                          return (
                            <div key={t.id} className={`rounded-lg px-2 py-1 text-xs ${assenzaApp ? 'bg-red-100 text-red-700' : warnTurno ? 'bg-amber-100 text-amber-800' : colorMap[dip.id]} relative`}
                              onClick={e => { e.stopPropagation(); apriEditTurno(t) }}
                              title={warnTitle}>
                              <p className="font-semibold">{warnTurno ? ' ' : ''}{t.oraInizio}–{t.oraFine}</p>
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

                        <p className="text-electric-blue/50 group-hover:text-electric-blue text-center text-base leading-none transition-colors">+</p>
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
              <div className="bg-white rounded-2xl border border-ink-navy/10 overflow-hidden shadow-sm">
                <div className="grid grid-cols-7 border-b border-ink-navy/10">
                  {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((g, i) => (
                    <div key={i} className={`py-3 text-center text-xs font-bold ${i >= 5 ? 'text-electric-blue' : 'text-ink-navy/35'}`}>{g}</div>
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
                      <div key={idx} className={`min-h-[80px] p-1.5 border-b border-r border-ink-navy/8
                        ${!isDelMese ? 'bg-mist/60' : isWeekend ? 'bg-electric-blue/5' : 'bg-white'}`}>
                        {isDelMese && (
                          <>
                            <p className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1
                              ${isOggi ? 'bg-electric-blue text-white' : isWeekend ? 'text-electric-blue' : 'text-ink-navy/70'}`}>
                              {giornoNum}
                            </p>
                            {turniGiorno.map((t, i) => (
                              <div key={i}
                                onClick={() => setTurnoDettaglio(turnoDettaglio?.id === t.id ? null : t)}
                                className={`rounded px-1.5 py-0.5 text-xs font-semibold mb-0.5 cursor-pointer truncate ${colorMap[t.dipendente.id] ?? 'bg-mist text-ink-navy/60'}`}>
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
            <div className="bg-white rounded-2xl border border-electric-blue/25 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-ink-navy">{turnoDettaglio.dipendente.nome}</p>
                  <p className="text-sm text-ink-navy/50 mt-0.5">
                    {new Date(turnoDettaglio.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-electric-blue font-bold text-lg mt-1">{turnoDettaglio.oraInizio} – {turnoDettaglio.oraFine}</p>
                  {turnoDettaglio.ruolo && <p className="text-ink-navy/50 text-sm mt-0.5">{turnoDettaglio.ruolo}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => apriEditTurno(turnoDettaglio)}
                    className="text-xs px-2 py-1 bg-electric-blue/10 text-electric-blue rounded-lg hover:bg-electric-blue/20 font-medium">Modifica</button>
                  <button onClick={() => eliminaTurno(turnoDettaglio.id).then(() => setTurnoDettaglio(null))}
                    className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 font-medium">Elimina</button>
                  <button onClick={() => setTurnoDettaglio(null)} className="text-ink-navy/35 hover:text-ink-navy/60 text-lg">✕</button>
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
                  <span className="text-xs text-ink-navy/60">{d.nome}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB DIPENDENTI ── */}
      {tab === 'dipendenti' && (
        <div className="space-y-3">
          {/* Reminder configurazione mancante */}
          {!nomeLocale && (
            <Link href="/dashboard/impostazioni#generale" className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 hover:bg-amber-100 transition-colors">
              <span className="text-amber-500 text-lg shrink-0">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">Inserisci il nome del locale</p>
                <p className="text-xs text-amber-600 mt-0.5">Il link di accesso dipendenti viene generato automaticamente dal nome del locale. Impostalo nelle impostazioni generali.</p>
              </div>
              <span className="text-amber-400 shrink-0">›</span>
            </Link>
          )}

          {/* Banner link + QR area dipendenti */}
          <div className="bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-purple-800">Link area dipendenti</p>
              <p className="text-xs text-purple-600 font-mono mt-0.5 truncate">
                {typeof window !== 'undefined' ? window.location.origin : ''}/dipendente/login/{publicId ?? '…'}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/dipendente/login/${publicId ?? ''}`)}
                  className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors">
                  Copia link
                </button>
                <button
                  onClick={() => setQrDip({ nome: 'Area dipendenti', url: `${window.location.origin}/dipendente/login/${publicId ?? ''}` })}
                  className="text-xs px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-100 font-medium transition-colors">
                  Mostra QR
                </button>
              </div>
            </div>
          </div>

          {dipendenti.length === 0 ? (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-3 mx-auto mb-4">
                <IconUsers />
              </div>
              <h3 className="text-lg font-semibold text-ink-navy">Nessun dipendente</h3>
              <p className="text-ink-navy/50 text-sm mt-2">Aggiungi i tuoi dipendenti per gestire i turni</p>
            </div>
          ) : dipendenti.map((d, i) => (
            <div key={d.id} className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm hover:border-electric-blue/30 hover:shadow-none hover:translate-y-[2px] active:translate-y-[3px] active:shadow-none transition-all group">
              <div className="flex items-center justify-between gap-3 p-4">
                {/* Parte cliccabile → pagina dettaglio */}
                <Link href={`/dashboard/staff/${d.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  {d.fotoUrl ? (
                    <img src={d.fotoUrl} alt={d.nome} className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${COLORI[i % COLORI.length]}`}>
                      {d.nome[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-navy group-hover:text-electric-blue transition-colors truncate">{d.nome}</p>
                    <p className="text-sm text-ink-navy/50 truncate">{d.email}</p>
                    {d.ruolo && <p className="text-xs text-ink-navy/35">{d.ruolo}</p>}
                    {d.username
                      ? <p className="text-xs text-electric-blue font-mono mt-0.5">@{d.username}</p>
                      : <p className="text-xs text-amber-500 font-medium mt-0.5">Accesso non configurato</p>
                    }
                  </div>
                  <span className="text-ink-navy/20 group-hover:text-electric-blue/40 transition-colors text-lg shrink-0">›</span>
                </Link>

                {/* Azioni rapide */}
                <div className="flex gap-1.5 shrink-0">
<button onClick={() => apriModifica(d)}
                    className="text-ink-navy/35 hover:text-electric-blue p-1.5 rounded-lg hover:bg-electric-blue/10 transition-colors">
                    <span className="w-3.5 h-3.5 block"><IconPencil /></span>
                  </button>
                  <button onClick={() => eliminaDipendente(d.id)}
                    className="text-ink-navy/35 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                    <span className="w-3.5 h-3.5 block"><IconTrash /></span>
                  </button>
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
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-12 text-center shadow-sm">
              <p className="text-ink-navy/35 text-sm">Nessuna richiesta ricevuta</p>
            </div>
          ) : richieste.map(r => (
            <div key={r.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${r.status === 'in_attesa' ? 'border-amber-200' : 'border-ink-navy/10'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink-navy">{r.dipendente.nome}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-mist text-ink-navy/60 capitalize">
                      {r.tipo.replace('_', ' ')}
                    </span>
                  </div>
                  {r.data && (
                    <p className="text-sm text-ink-navy/50 mt-0.5">
                      {new Date(r.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                      {r.dataFine && r.dataFine !== r.data && ` → ${new Date(r.dataFine).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`}
                    </p>
                  )}
                  {r.note && <p className="text-xs text-ink-navy/35 mt-1 truncate">{r.note}</p>}
                  <p className="text-xs text-ink-navy/25 mt-1">{new Date(r.createdAt).toLocaleDateString('it-IT')}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.status === 'in_attesa' && (
                    <>
                      <button onClick={() => aggiornaRichiesta(r.id, 'approvata')}
                        className="text-xs px-2.5 py-1 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 font-medium border border-green-200">Approva</button>
                      <button onClick={() => aggiornaRichiesta(r.id, 'rifiutata')}
                        className="text-xs px-2.5 py-1 bg-mist text-ink-navy/50 rounded-lg hover:bg-mist font-medium border border-ink-navy/10">Rifiuta</button>
                    </>
                  )}
                  {r.status !== 'in_attesa' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'approvata' ? 'bg-green-100 text-green-700' : 'bg-mist text-ink-navy/50'}`}>
                      {r.status === 'approvata' ? 'Approvata' : 'Rifiutata'}
                    </span>
                  )}
                  <button onClick={() => setConferma({ msg: 'Eliminare questa richiesta?', onConfirm: async () => {
                    await fetch(`/api/richieste-staff/${r.id}`, { method: 'DELETE', credentials: 'include' })
                    fetchAll()
                  }})} className="text-xs px-2 py-1 text-ink-navy/25 hover:text-red-400 rounded-lg hover:bg-red-50 transition-colors font-medium">
                    Elimina
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB PRESENZE ── */}
      {tab === 'presenze' && (() => {
        const fmtOra = (ts: string) => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        const fmtGiorno = (d: string) => {
          if (d === oggiStr) return 'Oggi'
          const ieri = new Date(Date.now() - 86400000).toISOString().split('T')[0]
          if (d === ieri) return 'Ieri'
          return new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
        }
        const goBack = () => {
          const d = new Date(presenzeData + 'T12:00:00')
          d.setDate(d.getDate() - 1)
          setPresenzeData(d.toISOString().split('T')[0])
        }
        const goForward = () => {
          if (presenzeData >= oggiStr) return
          const d = new Date(presenzeData + 'T12:00:00')
          d.setDate(d.getDate() + 1)
          setPresenzeData(d.toISOString().split('T')[0])
        }

        // Raggruppa per dipendente
        const perDip = presenzeList.reduce<Record<string, { nome: string; ruolo: string | null; entrate: string[]; uscite: string[] }>>((acc, t) => {
          const k = t.dipendente.nome
          if (!acc[k]) acc[k] = { nome: t.dipendente.nome, ruolo: t.dipendente.ruolo, entrate: [], uscite: [] }
          if (t.tipo === 'entrata') acc[k].entrate.push(t.timestamp)
          else acc[k].uscite.push(t.timestamp)
          return acc
        }, {})
        const dipList = Object.values(perDip).sort((a, b) => {
          const aLast = [...a.entrate, ...a.uscite].sort().pop() ?? ''
          const bLast = [...b.entrate, ...b.uscite].sort().pop() ?? ''
          return bLast.localeCompare(aLast)
        })
        const presenti = dipList.filter(d => {
          const ul = [...d.entrate].sort().pop()
          const uu = [...d.uscite].sort().pop()
          return ul && (!uu || uu < ul)
        })

        return (
          <div className="flex gap-5 items-start">

            {/* Colonna sinistra: lista */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Nav data */}
              <div className="flex items-center justify-between bg-white rounded-2xl border border-ink-navy/10 shadow-sm px-4 py-3 gap-3">
                <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-mist text-ink-navy/50 hover:text-ink-navy transition-colors shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <p className="font-semibold text-ink-navy capitalize text-sm">{fmtGiorno(presenzeData)}</p>
                  <input
                    type="date" value={presenzeData} max={oggiStr}
                    onChange={e => e.target.value && setPresenzeData(e.target.value)}
                    className="text-xs border border-ink-navy/15 rounded-lg px-2 py-1 text-ink-navy/50 focus:outline-none focus:ring-2 focus:ring-electric-blue/40 bg-white"
                  />
                </div>
                <button onClick={goForward} disabled={presenzeData >= oggiStr}
                  className="p-1.5 rounded-lg hover:bg-mist text-ink-navy/50 hover:text-ink-navy transition-colors disabled:opacity-20 disabled:cursor-not-allowed shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              {presenzeLoading ? (
                <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-10 text-center">
                  <p className="text-sm text-ink-navy/30 font-mono">Caricamento...</p>
                </div>
              ) : presenzeList.length === 0 ? (
                <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-12 text-center">
                  <p className="text-ink-navy/25 text-sm">Nessuna timbratura per questo giorno</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dipList.map(d => {
                    const entrate = [...d.entrate].sort()
                    const uscite = [...d.uscite].sort()
                    const primaEntrata = entrate[0]
                    const ultimaUscita = uscite[uscite.length - 1]
                    const presente = primaEntrata && (!ultimaUscita || ultimaUscita < entrate[entrate.length - 1])
                    let ore: string | null = null
                    if (primaEntrata && ultimaUscita && new Date(ultimaUscita) > new Date(primaEntrata)) {
                      const ms = new Date(ultimaUscita).getTime() - new Date(primaEntrata).getTime()
                      ore = `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
                    }
                    return (
                      <div key={d.nome} className="bg-white rounded-xl border border-ink-navy/10 shadow-sm px-4 py-3.5 flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${presente ? 'bg-green-400' : 'bg-ink-navy/15'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-ink-navy text-sm">{d.nome}</p>
                          {d.ruolo && <p className="text-xs text-ink-navy/35">{d.ruolo}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                            {primaEntrata ? fmtOra(primaEntrata) : '—'}
                          </span>
                          <span className="text-ink-navy/20 text-xs">→</span>
                          {presente ? (
                            <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">In corso</span>
                          ) : (
                            <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${ultimaUscita ? 'text-red-600 bg-red-50' : 'text-ink-navy/25 bg-ink-navy/5'}`}>
                              {ultimaUscita ? fmtOra(ultimaUscita) : '—'}
                            </span>
                          )}
                          {ore && <span className="text-xs font-semibold text-electric-blue bg-electric-blue/10 px-2 py-1 rounded-lg ml-1">{ore}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Colonna destra: chi c'è ora (solo oggi) */}
            <div className="w-80 shrink-0 sticky top-6">
              <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-ink-navy/8 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${presenzeData === oggiStr && presenti.length > 0 ? 'bg-green-400 animate-pulse' : 'bg-ink-navy/15'}`} />
                  <p className="text-xs font-semibold text-ink-navy/60 uppercase tracking-wide">In servizio ora</p>
                </div>
                {presenzeData !== oggiStr ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-xs text-ink-navy/30">Dato disponibile solo per oggi</p>
                  </div>
                ) : presenzeLoading ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-xs text-ink-navy/25 font-mono">...</p>
                  </div>
                ) : presenti.length === 0 ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-xs text-ink-navy/30">Nessuno in servizio</p>
                  </div>
                ) : (
                  <div className="divide-y divide-ink-navy/6">
                    {presenti.map(d => {
                      const entrata = [...d.entrate].sort().pop()!
                      const now = Date.now()
                      const ms = now - new Date(entrata).getTime()
                      const h = Math.floor(ms / 3600000)
                      const m = Math.floor((ms % 3600000) / 60000)
                      return (
                        <div key={d.nome} className="px-4 py-3">
                          <p className="text-sm font-semibold text-ink-navy truncate">{d.nome.split(' ')[0]}</p>
                          <p className="text-xs text-ink-navy/40 mt-0.5">
                            dalle {fmtOra(entrata)} · {h > 0 ? `${h}h ` : ''}{m}m
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        )
      })()}

      {/* Modal aggiungi turno da cella */}
      {cellModal && (() => {
        const dispCella = (tutteDisp.find(d => d.dipendenteId === cellModal.dipendenteId)?.giorni ?? []).find(gd => gd.data === cellModal.data)
        const hasDispCella = tutteDisp.some(d => d.dipendenteId === cellModal.dipendenteId)
        const noDispCella = hasDispCella && !dispCella
        const fuoriOrarioCella = dispCella?.oraInizio && (cellModal.oraInizio < dispCella.oraInizio || cellModal.oraFine > dispCella.oraFine)
        const tipiAssenzaCella = ['assenza', 'malattia', 'permesso', 'ferie']
        const assenzaApprovata = richieste.find(r =>
          r.dipendente.id === cellModal.dipendenteId &&
          r.status === 'approvata' &&
          tipiAssenzaCella.includes(r.tipo) &&
          r.data && cellModal.data >= r.data.split('T')[0] &&
          cellModal.data <= (r.dataFine ? r.dataFine.split('T')[0] : r.data.split('T')[0])
        )
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-ink-navy">{cellModal.nome}</h3>
              <p className="text-sm text-ink-navy/50">{cellModal.dataLabel}</p>
            </div>
            {assenzaApprovata && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 font-medium">
                 {cellModal.nome.split(' ')[0]} ha {assenzaApprovata.tipo.replace('_', ' ')} approvata in questo giorno.
              </div>
            )}
            {!assenzaApprovata && noDispCella && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium">
                 Questo dipendente non ha dichiarato disponibilità per questo giorno.
              </div>
            )}
            {!assenzaApprovata && fuoriOrarioCella && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium">
                 Disponibile solo dalle {dispCella?.oraInizio} alle {dispCella?.oraFine}.
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-ink-navy/60 mb-1">Dalle</label>
                <input type="time" value={cellModal.oraInizio}
                  onChange={e => setCellModal(m => m ? { ...m, oraInizio: e.target.value } : m)}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-ink-navy/60 mb-1">Alle</label>
                <input type="time" value={cellModal.oraFine}
                  onChange={e => setCellModal(m => m ? { ...m, oraFine: e.target.value } : m)}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCellModal(null)}
                className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl hover:bg-mist text-sm">Annulla</button>
              <button onClick={salvaDaCella} disabled={savingCell}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-xl hover:bg-electric-blue/90 text-sm disabled:opacity-50">
                {savingCell ? '...' : 'Salva turno'}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Modal imposta password dipendente */}
      {dipPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink-navy">
              {dipPasswordModal.username ? 'Reimposta password' : 'Imposta accesso area dipendenti'}
            </h3>
            <div className="bg-mist rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs text-ink-navy/50 font-medium">Dipendente</p>
              <p className="text-sm font-semibold text-ink-navy">{dipPasswordModal.nome}</p>
              {dipPasswordModal.username ? (
                <p className="text-xs text-purple-600">Username: <span className="font-mono font-semibold">{dipPasswordModal.username}</span></p>
              ) : (
                <p className="text-xs text-ink-navy/40">L'username verrà generato automaticamente dal nome</p>
              )}
            </div>

            {usernameGenerato ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-green-800">✅ Accesso configurato</p>
                  <div className="text-sm text-green-700 space-y-1.5">
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                      <span className="text-xs text-green-600">Username</span>
                      <span className="font-mono font-bold text-green-800">{usernameGenerato}</span>
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                      <span className="text-xs text-green-600">Link accesso</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/dipendente/login/${publicId ?? ''}`)}
                        className="font-mono text-xs text-green-800 hover:text-electric-blue underline underline-offset-2">
                        {typeof window !== 'undefined' ? window.location.origin : ''}/dipendente/login/{publicId ?? '…'}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-green-600">Manda username, password e link al dipendente. Dovrà cambiare la password al primo accesso.</p>
                </div>
                <button onClick={() => { setDipPasswordModal(null); setUsernameGenerato('') }}
                  className="w-full bg-electric-blue text-white font-semibold py-2.5 rounded-xl text-sm">
                  Chiudi
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Password temporanea *</label>
                  <input type="text" value={nuovaPasswordDip} onChange={e => setNuovaPasswordDip(e.target.value)}
                    placeholder="min. 6 caratteri"
                    className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                  <p className="text-xs text-ink-navy/35 mt-1">Il dipendente dovrà cambiarla al primo accesso</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setDipPasswordModal(null); setNuovaPasswordDip('') }}
                    className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl hover:bg-mist text-sm">
                    Annulla
                  </button>
                  <button onClick={impostaPassword} disabled={savingPassword || nuovaPasswordDip.length < 6}
                    className="flex-1 bg-purple-600 text-white font-semibold py-2.5 rounded-xl hover:bg-purple-700 text-sm disabled:opacity-50">
                    {savingPassword ? 'Salvataggio...' : 'Conferma'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal modifica dipendente */}
      {dipendenteDaModificare && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink-navy">Modifica dipendente</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome *</label>
                <input value={formModifica.nome} onChange={e => setFormModifica(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Email *</label>
                <input type="email" value={formModifica.email} onChange={e => setFormModifica(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Ruolo</label>
                <input placeholder="es. Cameriere, Chef..." value={formModifica.ruolo} onChange={e => setFormModifica(f => ({ ...f, ruolo: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">URL foto <span className="text-ink-navy/35 font-normal">(opzionale)</span></label>
                <input type="url" placeholder="https://..." value={formModifica.fotoUrl} onChange={e => setFormModifica(f => ({ ...f, fotoUrl: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setDipendenteDaModificare(null)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl hover:bg-mist text-sm">Annulla</button>
              <button onClick={salvaDipendente} disabled={saving || !formModifica.nome || !formModifica.email}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-xl hover:bg-electric-blue/90 text-sm disabled:opacity-50">
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
            <h3 className="text-lg font-bold text-ink-navy">Nuovo dipendente</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome *</label>
                <input value={formDip.nome} onChange={e => setFormDip(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Email *</label>
                <input type="email" value={formDip.email} onChange={e => setFormDip(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Ruolo</label>
                <input placeholder="es. Cameriere, Chef, Cassiere..." value={formDip.ruolo} onChange={e => setFormDip(f => ({ ...f, ruolo: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">URL foto <span className="text-ink-navy/35 font-normal">(opzionale)</span></label>
                <input type="url" placeholder="https://..." value={formDip.fotoUrl} onChange={e => setFormDip(f => ({ ...f, fotoUrl: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModalDip(false)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl hover:bg-mist text-sm">Annulla</button>
              <button onClick={aggiungiDipendente} disabled={saving || !formDip.nome || !formDip.email}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-xl hover:bg-electric-blue/90 text-sm disabled:opacity-50">
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
                  <h3 className="text-base font-bold text-ink-navy">Disponibilità — {dispModal.dipendente.nome}</h3>
                  <p className="text-xs text-ink-navy/35">{dispModal.dipendente.ruolo || dispModal.dipendente.email}</p>
                </div>
                <button onClick={() => setDispModal(null)} className="text-ink-navy/35 hover:text-ink-navy/60 text-lg">✕</button>
              </div>

              {/* Navigazione mese */}
              <div className="flex items-center justify-between">
                <button onClick={async () => { const m = new Date(dispMese.getFullYear(), dispMese.getMonth() - 1, 1); setDispMese(m); setDispGiornoSel(null); await caricaDisp(dispModal.dipendente.id, m) }}
                  className="p-1.5 rounded-lg hover:bg-mist text-ink-navy/50">←</button>
                <span className="font-semibold text-ink-navy text-sm capitalize">
                  {dispMese.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={async () => { const m = new Date(dispMese.getFullYear(), dispMese.getMonth() + 1, 1); setDispMese(m); setDispGiornoSel(null); await caricaDisp(dispModal.dipendente.id, m) }}
                  className="p-1.5 rounded-lg hover:bg-mist text-ink-navy/50">→</button>
              </div>

              {loadingDisp ? (
                <p className="text-center text-sm text-ink-navy/35 py-4">Caricamento...</p>
              ) : (
                <>
                  <div className="border border-ink-navy/10 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-ink-navy/8">
                      {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((g, i) => (
                        <div key={i} className={`py-2 text-center text-xs font-bold ${i >= 5 ? 'text-electric-blue' : 'text-ink-navy/35'}`}>{g}</div>
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
                            className={`min-h-[44px] p-1 border-b border-r border-ink-navy/8 flex flex-col items-center justify-start pt-1.5
                              ${!isDelMese ? 'bg-mist/60' : isDisp ? 'bg-green-100 cursor-pointer hover:bg-green-200' : 'bg-white'}
                              ${isSel ? 'ring-2 ring-inset ring-green-500' : ''}`}>
                            {isDelMese && (
                              <>
                                <p className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                                  ${isOggi ? 'bg-electric-blue text-white' : isDisp ? 'text-green-700' : 'text-ink-navy/35'}`}>
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
                    <p className="text-center text-sm text-ink-navy/35">Nessuna disponibilità inviata per questo mese</p>
                  ) : (
                    <div className="flex items-center gap-4 flex-wrap">
                      <p className="text-xs text-green-700 font-medium">{dispGiorni.length} giorn{dispGiorni.length === 1 ? 'o' : 'i'} disponibil{dispGiorni.length === 1 ? 'e' : 'i'}</p>
                      <div className="flex items-center gap-1.5 text-xs text-ink-navy/50">
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
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center p-3 mx-auto mb-4">
                <IconTrash />
              </div>
              <h3 className="text-lg font-bold text-ink-navy">Cancella tutti i turni</h3>
              <p className="text-sm text-ink-navy/50 mt-2">
                Stai per eliminare <span className="font-semibold text-red-600">{turni.length} turni</span> della settimana<br />
                <span className="font-medium">{settimana.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – {giorni[6].toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </p>
              <p className="text-xs text-red-500 mt-2 font-medium">Questa azione non è reversibile.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmCancella(false)}
                className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl hover:bg-mist text-sm">
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
            <h3 className="text-lg font-bold text-ink-navy">Nuovo turno</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Dipendente *</label>
                <select value={formTurno.dipendenteId} onChange={e => setFormTurno(f => ({ ...f, dipendenteId: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
                  <option value="">Seleziona...</option>
                  {dipendenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Data *</label>
                <input type="date" value={formTurno.data} onChange={e => setFormTurno(f => ({ ...f, data: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Inizio *</label>
                  <input type="time" value={formTurno.oraInizio} onChange={e => setFormTurno(f => ({ ...f, oraInizio: e.target.value }))}
                    className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Fine *</label>
                  <input type="time" value={formTurno.oraFine} onChange={e => setFormTurno(f => ({ ...f, oraFine: e.target.value }))}
                    className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Ruolo specifico</label>
                <input placeholder="es. Sala, Cucina..." value={formTurno.ruolo} onChange={e => setFormTurno(f => ({ ...f, ruolo: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note</label>
                <input value={formTurno.note} onChange={e => setFormTurno(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModalTurno(false)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl hover:bg-mist text-sm">Annulla</button>
              <button onClick={aggiungiTurno} disabled={saving || !formTurno.dipendenteId || !formTurno.data}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-xl hover:bg-electric-blue/90 text-sm disabled:opacity-50">
                {saving ? 'Salvataggio...' : 'Aggiungi turno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR accesso dipendente */}
      {qrDip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setQrDip(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4 flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <p className="font-bold text-ink-navy">{qrDip.nome}</p>
              <p className="text-xs text-ink-navy/40 mt-0.5">QR per accedere all'area personale</p>
            </div>
            <div className="p-3 border-2 border-ink-navy/8 rounded-xl">
              <QRCodeSVG value={qrDip.url} size={200} bgColor="#ffffff" fgColor="#0f172a" level="M" id="qr-dip-canvas" />
            </div>
            <p className="text-xs font-mono text-ink-navy/30 text-center break-all">{qrDip.url}</p>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => {
                  const svg = document.querySelector('#qr-dip-canvas') as SVGSVGElement | null
                  if (!svg) return
                  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `qr-${qrDip.nome.replace(/\s+/g, '-').toLowerCase()}.svg`
                  a.click()
                }}
                className="flex-1 py-2 bg-electric-blue text-white text-sm font-semibold rounded-xl hover:bg-electric-blue/90 transition-colors">
                Scarica QR
              </button>
              <button onClick={() => setQrDip(null)}
                className="flex-1 py-2 border border-ink-navy/10 text-ink-navy/50 text-sm font-semibold rounded-xl hover:bg-mist transition-colors">
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal modifica turno */}
      {editTurno && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-navy/40" onClick={() => setEditTurno(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6 w-full sm:max-w-sm mx-0 sm:mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-ink-navy">{editTurno.dipendente.nome}</p>
                <p className="text-xs text-ink-navy/50 mt-0.5">
                  {new Date(editTurno.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <button onClick={() => setEditTurno(null)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Inizio</label>
                  <input type="time" value={editForm.oraInizio}
                    onChange={e => setEditForm(f => ({ ...f, oraInizio: e.target.value }))}
                    className="mt-1 w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm text-ink-navy focus:outline-none focus:ring-2 focus:ring-electric-blue/30" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Fine</label>
                  <input type="time" value={editForm.oraFine}
                    onChange={e => setEditForm(f => ({ ...f, oraFine: e.target.value }))}
                    className="mt-1 w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm text-ink-navy focus:outline-none focus:ring-2 focus:ring-electric-blue/30" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Ruolo</label>
                <input type="text" value={editForm.ruolo} placeholder="es. Sala, Cucina…"
                  onChange={e => setEditForm(f => ({ ...f, ruolo: e.target.value }))}
                  className="mt-1 w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm text-ink-navy focus:outline-none focus:ring-2 focus:ring-electric-blue/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Note</label>
                <input type="text" value={editForm.note} placeholder="Note opzionali"
                  onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                  className="mt-1 w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm text-ink-navy focus:outline-none focus:ring-2 focus:ring-electric-blue/30" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditTurno(null)} className="flex-1 py-2.5 rounded-xl border border-ink-navy/10 text-ink-navy/60 text-sm font-medium hover:bg-mist">Annulla</button>
              <button onClick={modificaTurno} disabled={savingEdit}
                className="flex-1 py-2.5 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90 disabled:opacity-50">
                {savingEdit ? 'Salvo…' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {conferma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConferma(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-ink-navy mb-4">{conferma.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setConferma(null)} className="flex-1 py-2 rounded-xl border border-ink-navy/10 text-ink-navy/60 text-sm font-medium hover:bg-mist">Annulla</button>
              <button onClick={async () => { await conferma.onConfirm(); setConferma(null) }} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600">Conferma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

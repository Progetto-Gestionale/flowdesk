'use client'
import { useEffect, useRef, useState } from 'react'
import { IconUsers, IconTrash, IconPencil } from '../../components/icons'

interface Dipendente {
  id: string
  nome: string
  email: string
  ruolo: string | null
  fotoUrl: string | null
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
  const [tab, setTab] = useState<'turni' | 'dipendenti' | 'richieste'>('turni')
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([])
  const [turni, setTurni] = useState<Turno[]>([])
  const [richieste, setRichieste] = useState<Richiesta[]>([])
  const [settimana, setSettimana] = useState(getLunedi(new Date()))
  const [showModalDip, setShowModalDip] = useState(false)
  const [showModalTurno, setShowModalTurno] = useState(false)
  const [formDip, setFormDip] = useState({ nome: '', email: '', ruolo: '', fotoUrl: '' })
  const [formTurno, setFormTurno] = useState({ dipendenteId: '', data: '', oraInizio: '09:00', oraFine: '17:00', ruolo: '', note: '' })
  const [saving, setSaving] = useState(false)
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
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm font-medium">
           Link inviato a {linkInviato}
        </div>
      )}

      {/* Tab */}
      <div className="flex gap-2 flex-wrap">
        {([
          ['turni', 'Turni'],
          ['dipendenti', 'Dipendenti'],
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
                className="text-xs px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100 font-medium disabled:opacity-50 transition-colors">
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
                    const assenza = richiesteGiorno.find(r => tipiAssenza.includes(r.tipo))
                    const preferenza = richiesteGiorno.find(r => !tipiAssenza.includes(r.tipo))
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
                              onClick={e => e.stopPropagation()}
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
          {dipendenti.length === 0 ? (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-3 mx-auto mb-4">
                <IconUsers />
              </div>
              <h3 className="text-lg font-semibold text-ink-navy">Nessun dipendente</h3>
              <p className="text-ink-navy/50 text-sm mt-2">Aggiungi i tuoi dipendenti per gestire i turni</p>
            </div>
          ) : dipendenti.map((d, i) => (
            <div key={d.id} className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {d.fotoUrl ? (
                    <img src={d.fotoUrl} alt={d.nome} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${COLORI[i % COLORI.length]}`}>
                      {d.nome[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-ink-navy">{d.nome}</p>
                    <p className="text-sm text-ink-navy/50">{d.email}</p>
                    {d.ruolo && <p className="text-xs text-ink-navy/35">{d.ruolo}</p>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <button onClick={() => apriDispModal(d)}
                    className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium">
                    Disponibilità
                  </button>
                  <button onClick={() => inviaLink(d.email, d.nome)}
                    className="text-xs px-3 py-1.5 bg-electric-blue/10 text-electric-blue rounded-lg hover:bg-electric-blue/15 transition-colors font-medium">
                    Invia link
                  </button>
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

'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Logo from '@/app/components/Logo'

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
  fotoUrl: string | null
  username: string | null
  mustChangePassword: boolean
  turni: Turno[]
  richieste: Richiesta[]
}

interface TimbraturaDip {
  id: string
  tipo: string
  timestamp: string
}

interface GiornoDisponibile {
  data: string
  oraInizio: string
  oraFine: string
  note: string
}

type Sezione = 'home' | 'timbra' | 'turni' | 'disponibilita' | 'richieste' | 'account'

const TIPO_LABEL: Record<string, string> = {
  assenza: 'Assenza', malattia: 'Malattia', permesso: 'Permesso',
  ferie: 'Ferie', preferenza_orario: 'Preferenza orario',
}
const STATUS_COLOR: Record<string, string> = {
  in_attesa: 'bg-amber-50 text-amber-600 border border-amber-200',
  approvata: 'bg-green-50 text-green-600 border border-green-200',
  rifiutata: 'bg-ink-navy/5 text-ink-navy/40 border border-ink-navy/10',
}
const STATUS_LABEL: Record<string, string> = {
  in_attesa: 'In attesa', approvata: 'Approvata', rifiutata: 'Rifiutata',
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const inp = 'w-full border border-ink-navy/15 rounded-xl px-3 py-2.5 text-sm text-ink-navy placeholder:text-ink-navy/30 focus:outline-none focus:ring-2 focus:ring-electric-blue/40 focus:border-electric-blue/50 transition bg-white'

const NAV_ITEMS: { key: Sezione; label: string; emoji: string; desc: string; color: string }[] = [
  { key: 'timbra',       label: 'Timbra',        emoji: '📷', desc: 'Registra entrata o uscita', color: 'bg-electric-blue' },
  { key: 'turni',        label: 'I miei turni',  emoji: '📅', desc: 'Vedi i turni assegnati',    color: 'bg-violet-500' },
  { key: 'disponibilita',label: 'Disponibilità', emoji: '✅', desc: 'Indica quando sei libero',  color: 'bg-emerald-500' },
  { key: 'richieste',    label: 'Richieste',     emoji: '📋', desc: 'Ferie, permessi, assenze',  color: 'bg-amber-500' },
  { key: 'account',      label: 'Account',       emoji: '⚙️', desc: 'Password e profilo',        color: 'bg-slate-500' },
]

export default function DipendenteDashboard() {
  const router = useRouter()
  const [dipendente, setDipendente] = useState<Dipendente | null>(null)
  const [loading, setLoading] = useState(true)
  const [sezione, setSezione] = useState<Sezione>('home')

  // Timbra
  const [timbratureOggi, setTimbratureOggi] = useState<TimbraturaDip[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ tipo: string; timestamp: string } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrRef = useRef<unknown>(null)

  // Password
  const [nuovaPassword, setNuovaPassword] = useState('')
  const [confermaPassword, setConfermaPassword] = useState('')
  const [errorePassword, setErrorePassword] = useState('')
  const [salvandoPassword, setSalvandoPassword] = useState(false)
  const [passwordCambiata, setPasswordCambiata] = useState(false)
  const [showCambiaPassword, setShowCambiaPassword] = useState(false)

  // Richieste
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

  // Turni
  const [meseCal, setMeseCal] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [turnoSelezionato, setTurnoSelezionato] = useState<Turno | null>(null)

  async function fetchProfilo() {
    const res = await fetch('/api/dipendente/profilo', { credentials: 'include' })
    if (res.status === 401) { router.push('/dipendente/login'); return }
    const d = await res.json()
    setDipendente(d.dipendente)
    setLoading(false)
  }

  async function fetchDisponibilita() {
    const res = await fetch(`/api/dipendente/disponibilita?mese=${toISO(meseDisp)}`, { credentials: 'include' })
    if (!res.ok) return
    const d = await res.json()
    setGiorniDisp(d.giorni ?? [])
    setDispSalvata(d.giorni?.length > 0)
    setDispModificata(false)
  }

  async function fetchTimbrature() {
    const res = await fetch('/api/dipendente/timbrature', { credentials: 'include' })
    if (res.ok) { const d = await res.json(); setTimbratureOggi(d.timbrature ?? []) }
  }

  async function fermaScanner() {
    if (html5QrRef.current) {
      const s = html5QrRef.current as { stop: () => Promise<void> }
      try { await s.stop() } catch { /* ignora */ }
      html5QrRef.current = null
    }
    setScanning(false)
  }

  async function onScanSuccess(token: string) {
    await fermaScanner()
    const res = await fetch('/api/qr-timbratura/scan', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const d = await res.json()
    if (res.ok) { setScanResult({ tipo: d.tipo, timestamp: d.timestamp }); fetchTimbrature() }
    else setScanError(d.error || 'Errore durante la timbratura')
  }

  useEffect(() => {
    if (!scanning || !scannerRef.current) return
    let mounted = true
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!mounted || !scannerRef.current) return
      const scanner = new Html5Qrcode('qr-scanner-div')
      html5QrRef.current = scanner
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => { if (mounted) onScanSuccess(text) },
        () => {}
      ).catch(err => {
        if (mounted) setScanError('Impossibile accedere alla fotocamera: ' + String(err))
        setScanning(false)
      })
    })
    return () => { mounted = false; fermaScanner() }
  }, [scanning])

  useEffect(() => { fetchProfilo() }, [])
  useEffect(() => { if (sezione === 'disponibilita') fetchDisponibilita() }, [sezione, meseDisp])
  useEffect(() => { if (sezione === 'timbra') fetchTimbrature() }, [sezione])

  async function handleLogout() {
    await fetch('/api/dipendente/logout', { method: 'POST', credentials: 'include' })
    router.push('/dipendente/login')
  }

  async function cambiaPassword(e: React.FormEvent) {
    e.preventDefault()
    setErrorePassword('')
    if (nuovaPassword.length < 6) { setErrorePassword('Almeno 6 caratteri'); return }
    if (nuovaPassword !== confermaPassword) { setErrorePassword('Le password non coincidono'); return }
    setSalvandoPassword(true)
    const res = await fetch('/api/dipendente/set-password', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nuovaPassword }),
    })
    setSalvandoPassword(false)
    if (!res.ok) { setErrorePassword('Errore durante il salvataggio'); return }
    setPasswordCambiata(true)
    setNuovaPassword(''); setConfermaPassword('')
    setShowCambiaPassword(false)
    fetchProfilo()
  }

  async function inviaRichiesta() {
    setSaving(true)
    try {
      const method = editingRichiesta ? 'PATCH' : 'POST'
      const body = editingRichiesta ? { id: editingRichiesta, ...form } : form
      const res = await fetch('/api/dipendente/richieste', {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Errore'); return }
      setShowForm(false); setEditingRichiesta(null)
      setForm({ tipo: 'malattia', data: '', dataFine: '', note: '', oraInizio: '', oraFine: '' })
      fetchProfilo()
    } finally { setSaving(false) }
  }

  async function eliminaRichiesta(id: string) {
    if (!confirm('Rimuovere questa richiesta?')) return
    await fetch(`/api/dipendente/richieste?id=${id}`, { method: 'DELETE', credentials: 'include' })
    fetchProfilo()
  }

  function apriModifica(r: Richiesta) {
    setEditingRichiesta(r.id)
    setForm({
      tipo: r.tipo, data: r.data ? r.data.split('T')[0] : '',
      dataFine: r.dataFine ? r.dataFine.split('T')[0] : '',
      note: r.note ?? '', oraInizio: r.oraInizio ?? '', oraFine: r.oraFine ?? '',
    })
    setShowForm(true)
  }

  function toggleGiorno(dataStr: string) {
    setDispModificata(true)
    setGiorniDisp(prev => {
      const esiste = prev.find(g => g.data === dataStr)
      if (esiste) { if (giornoDettaglio === dataStr) setGiornoDettaglio(null); return prev.filter(g => g.data !== dataStr) }
      return [...prev, { data: dataStr, oraInizio: '', oraFine: '', note: '' }]
    })
  }

  function aggiornaGiorno(dataStr: string, campo: keyof GiornoDisponibile, valore: string) {
    setDispModificata(true)
    setGiorniDisp(prev => prev.map(g => g.data === dataStr ? { ...g, [campo]: valore } : g))
  }

  async function salvaDisponibilita() {
    setSavingDisp(true)
    await fetch('/api/dipendente/disponibilita', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mese: toISO(meseDisp), giorni: giorniDisp }),
    })
    setSavingDisp(false); setDispSalvata(true); setDispModificata(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-mist flex items-center justify-center">
      <p className="text-ink-navy/35 text-sm font-mono">Caricamento...</p>
    </div>
  )
  if (!dipendente) return null

  const oggi = new Date().toISOString().split('T')[0]
  const primoNome = dipendente.nome.split(' ')[0]
  const cognome = dipendente.nome.split(' ').slice(1).join(' ')

  // Turni calendario
  const primoGiornoMese = new Date(meseCal.getFullYear(), meseCal.getMonth(), 1)
  const ultimoGiornoMese = new Date(meseCal.getFullYear(), meseCal.getMonth() + 1, 0)
  const offsetInizio = primoGiornoMese.getDay() === 0 ? 6 : primoGiornoMese.getDay() - 1
  const totaleCelle = Math.ceil((offsetInizio + ultimoGiornoMese.getDate()) / 7) * 7

  // Disponibilità calendario
  const primoGiornoDisp = new Date(meseDisp.getFullYear(), meseDisp.getMonth(), 1)
  const ultimoGiornoDisp = new Date(meseDisp.getFullYear(), meseDisp.getMonth() + 1, 0)
  const offsetDisp = primoGiornoDisp.getDay() === 0 ? 6 : primoGiornoDisp.getDay() - 1
  const totaleCelleDisp = Math.ceil((offsetDisp + ultimoGiornoDisp.getDate()) / 7) * 7

  const turniProssimi = [...dipendente.turni]
    .filter(t => t.data.split('T')[0] >= oggi)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 2)

  const richiesteInAttesa = dipendente.richieste.filter(r => r.status === 'in_attesa').length

  return (
    <div className="min-h-screen bg-mist flex flex-col">

      {/* ── SEZIONE HOME ── */}
      {sezione === 'home' && (
        <>
          {/* Contenuto */}
          <div className="px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-8 max-w-lg mx-auto w-full space-y-3">

            {/* Banner */}
            <div className="bg-electric-blue rounded-2xl px-5 pt-5 pb-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-zest-lime font-extrabold tracking-tight text-lg leading-none">Flowest</span>
                <button onClick={handleLogout} className="text-white/50 text-xs hover:text-white transition-colors font-medium">
                  Esci
                </button>
              </div>
              <div className="flex items-center gap-3">
                {dipendente.fotoUrl ? (
                  <img src={dipendente.fotoUrl} alt={dipendente.nome}
                    className="w-11 h-11 rounded-full object-cover border-2 border-white/20 shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/20 shrink-0">
                    <span className="text-white text-base font-bold">{dipendente.nome[0].toUpperCase()}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white/60 text-xs font-medium">Benvenuto</p>
                  <p className="text-white text-xl font-bold leading-tight truncate">{dipendente.nome}</p>
                  {dipendente.ruolo && <p className="text-white/50 text-xs mt-0.5">{dipendente.ruolo}</p>}
                </div>
              </div>
            </div>

            {/* Alert password */}
            {dipendente.mustChangePassword && (
              <button onClick={() => setSezione('account')}
                className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-left">
                <div className="w-1.5 h-8 rounded-full bg-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">Imposta la tua password</p>
                  <p className="text-xs text-amber-600 mt-0.5">Il responsabile ha impostato un accesso temporaneo</p>
                </div>
                <span className="text-amber-400 text-lg shrink-0">›</span>
              </button>
            )}

            {/* Timbra */}
            <button onClick={() => setSezione('timbra')}
              className="w-full bg-white rounded-xl border border-ink-navy/10 shadow-sm p-4 flex items-center gap-4 active:bg-mist transition-colors">
              <div className="w-10 h-10 rounded-lg bg-electric-blue/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-electric-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
                  <circle cx="12" cy="13" r="3.3" />
                </svg>
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="font-semibold text-ink-navy text-sm">Timbra entrata / uscita</p>
                <p className="text-xs text-ink-navy/40 mt-0.5">
                  {timbratureOggi.length > 0
                    ? `Ultima: ${timbratureOggi[timbratureOggi.length - 1].tipo} alle ${new Date(timbratureOggi[timbratureOggi.length - 1].timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Scansiona il QR del locale'}
                </p>
              </div>
              <span className="text-ink-navy/20 shrink-0">›</span>
            </button>

            {/* Prossimi turni */}
            {turniProssimi.length > 0 && (
              <button onClick={() => setSezione('turni')}
                className="w-full bg-white rounded-xl border border-ink-navy/10 shadow-sm p-4 text-left active:bg-mist transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wide">Prossimi turni</p>
                  <span className="text-xs text-electric-blue font-semibold">Vedi tutti ›</span>
                </div>
                <div className="space-y-2.5">
                  {turniProssimi.map(t => (
                    <div key={t.id} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-mist border border-ink-navy/8 flex flex-col items-center justify-center shrink-0">
                        <p className="text-xs font-bold text-ink-navy leading-none">
                          {new Date(t.data + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric' })}
                        </p>
                        <p className="text-[9px] text-ink-navy/40 uppercase mt-0.5">
                          {new Date(t.data + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short' })}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink-navy">{t.oraInizio} – {t.oraFine}</p>
                        {t.ruolo && <p className="text-xs text-ink-navy/40">{t.ruolo}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            )}

            {/* Nav sezioni */}
            <div className="grid grid-cols-2 gap-2.5">
              {([
                {
                  key: 'turni', label: 'I miei turni', sub: 'Calendario turni',
                  icon: <svg className="w-5 h-5 text-electric-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
                },
                {
                  key: 'disponibilita', label: 'Disponibilità', sub: 'Indica i giorni liberi',
                  icon: <svg className="w-5 h-5 text-electric-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>,
                },
                {
                  key: 'richieste', label: 'Richieste', sub: 'Ferie e permessi',
                  icon: <svg className="w-5 h-5 text-electric-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>,
                },
                {
                  key: 'account', label: 'Account', sub: 'Password e profilo',
                  icon: <svg className="w-5 h-5 text-electric-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
                },
              ] as { key: Sezione; label: string; sub: string; icon: React.ReactNode }[]).map(item => (
                <button key={item.key} onClick={() => setSezione(item.key)}
                  className="bg-white rounded-xl border border-ink-navy/10 shadow-sm p-4 text-left active:bg-mist transition-colors relative">
                  <div className="w-10 h-10 rounded-lg bg-electric-blue/10 flex items-center justify-center mb-3">
                    {item.icon}
                  </div>
                  <p className="font-semibold text-ink-navy text-sm">{item.label}</p>
                  <p className="text-xs text-ink-navy/40 mt-0.5">{item.sub}</p>
                  {item.key === 'richieste' && richiesteInAttesa > 0 && (
                    <span className="absolute top-3 right-3 bg-amber-400 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {richiesteInAttesa}
                    </span>
                  )}
                  {item.key === 'account' && dipendente.mustChangePassword && (
                    <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-amber-400" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── SEZIONI INTERNE ── */}
      {sezione !== 'home' && (
        <div className="flex flex-col min-h-screen pb-20">
          {/* Header sezione */}
          <div className="bg-electric-blue px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4">
            <div className="max-w-lg mx-auto">
              <button onClick={() => { setSezione('home'); fermaScanner(); setScanResult(null); setScanError(null) }}
                className="flex items-center gap-2 text-white/70 active:text-white transition-colors mb-3 text-sm font-medium">
                ‹ Home
              </button>
              <h1 className="text-white text-xl font-extrabold">
                {NAV_ITEMS.find(n => n.key === sezione)?.label}
              </h1>
            </div>
          </div>

          <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">

            {/* ── TIMBRA ── */}
            {sezione === 'timbra' && (
              <div className="space-y-4">
                {scanResult && (
                  <div className={`rounded-2xl border p-6 text-center ${scanResult.tipo === 'entrata' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-5xl mb-3">{scanResult.tipo === 'entrata' ? '✅' : '👋'}</p>
                    <p className={`text-xl font-bold ${scanResult.tipo === 'entrata' ? 'text-green-700' : 'text-red-700'}`}>
                      {scanResult.tipo === 'entrata' ? 'Entrata registrata!' : 'Uscita registrata!'}
                    </p>
                    <p className="text-sm text-ink-navy/40 mt-1">
                      {new Date(scanResult.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <button onClick={() => setScanResult(null)}
                      className="mt-4 text-sm text-ink-navy/40 hover:text-ink-navy transition-colors">
                      Timbra di nuovo
                    </button>
                  </div>
                )}

                {scanError && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600 text-center">
                    {scanError}
                    <button onClick={() => setScanError(null)} className="block mx-auto mt-2 text-xs text-red-400 hover:text-red-600 transition-colors">Riprova</button>
                  </div>
                )}

                {!scanResult && !scanning && (
                  <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-10 flex flex-col items-center gap-4">
                    <p className="text-6xl">📷</p>
                    <div className="text-center">
                      <p className="font-bold text-ink-navy text-lg">Scansiona il QR</p>
                      <p className="text-sm text-ink-navy/40 mt-1">Inquadra il codice QR presente sul tablet del locale</p>
                    </div>
                    <button onClick={() => setScanning(true)}
                      className="bg-electric-blue text-white font-semibold px-8 py-3 rounded-xl hover:bg-electric-blue/90 transition-colors text-sm">
                      Apri fotocamera
                    </button>
                  </div>
                )}

                {scanning && (
                  <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                    <div id="qr-scanner-div" ref={scannerRef} className="w-full" />
                    <div className="p-4 text-center">
                      <button onClick={fermaScanner} className="text-sm text-ink-navy/40 hover:text-ink-navy transition-colors">Annulla</button>
                    </div>
                  </div>
                )}

                {timbratureOggi.length > 0 && (
                  <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-ink-navy/8">
                      <p className="font-semibold text-ink-navy text-sm">Le tue timbrature di oggi</p>
                    </div>
                    <div className="divide-y divide-ink-navy/6">
                      {timbratureOggi.map(t => (
                        <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${t.tipo === 'entrata' ? 'bg-green-400' : 'bg-red-400'}`} />
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.tipo === 'entrata' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                            {t.tipo === 'entrata' ? '→ Entrata' : '← Uscita'}
                          </span>
                          <span className="text-sm text-ink-navy/50 ml-auto">
                            {new Date(t.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TURNI ── */}
            {sezione === 'turni' && (
              <div className="space-y-3">
                <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-ink-navy/8">
                    <button onClick={() => setMeseCal(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                      className="p-1.5 rounded-lg hover:bg-mist text-ink-navy/40 hover:text-ink-navy transition-colors">←</button>
                    <span className="font-semibold text-ink-navy text-sm capitalize">
                      {meseCal.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                    </span>
                    <button onClick={() => setMeseCal(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                      className="p-1.5 rounded-lg hover:bg-mist text-ink-navy/40 hover:text-ink-navy transition-colors">→</button>
                  </div>
                  <div className="grid grid-cols-7 border-b border-ink-navy/8">
                    {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((g, i) => (
                      <div key={i} className={`py-2.5 text-center text-xs font-bold ${i >= 5 ? 'text-electric-blue/60' : 'text-ink-navy/30'}`}>{g}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {Array.from({ length: totaleCelle }, (_, idx) => {
                      const giornoNum = idx - offsetInizio + 1
                      const isDelMese = giornoNum >= 1 && giornoNum <= ultimoGiornoMese.getDate()
                      const dataCorrente = isDelMese
                        ? `${meseCal.getFullYear()}-${String(meseCal.getMonth() + 1).padStart(2, '0')}-${String(giornoNum).padStart(2, '0')}`
                        : null
                      const turniGiorno = dataCorrente ? dipendente.turni.filter(t => t.data.split('T')[0] === dataCorrente) : []
                      const isOggi = dataCorrente === oggi
                      const isWeekend = idx % 7 >= 5
                      return (
                        <div key={idx} className={`min-h-[72px] p-1.5 border-b border-r border-ink-navy/6
                          ${!isDelMese ? 'bg-mist/60' : isWeekend ? 'bg-electric-blue/[0.03]' : 'bg-white'}`}>
                          {isDelMese && (
                            <>
                              <p className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1
                                ${isOggi ? 'bg-electric-blue text-white' : isWeekend ? 'text-electric-blue/60' : 'text-ink-navy/70'}`}>
                                {giornoNum}
                              </p>
                              {turniGiorno.map((t, i) => (
                                <div key={i} onClick={() => setTurnoSelezionato(turnoSelezionato?.id === t.id ? null : t)}
                                  className="bg-electric-blue text-white rounded-lg px-1.5 py-1 text-xs font-semibold mb-1 cursor-pointer hover:bg-electric-blue/80 transition-colors">
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

                {turnoSelezionato && (
                  <div className="bg-white rounded-2xl border border-electric-blue/20 shadow-sm p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-ink-navy text-sm">
                          {new Date(turnoSelezionato.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                        <p className="text-electric-blue font-bold text-xl mt-1">{turnoSelezionato.oraInizio} – {turnoSelezionato.oraFine}</p>
                        {turnoSelezionato.ruolo && <p className="text-ink-navy/50 text-sm mt-0.5">{turnoSelezionato.ruolo}</p>}
                        {turnoSelezionato.note && <p className="text-ink-navy/35 text-xs mt-1">{turnoSelezionato.note}</p>}
                      </div>
                      <button onClick={() => setTurnoSelezionato(null)} className="text-ink-navy/30 hover:text-ink-navy transition-colors text-lg">✕</button>
                    </div>
                  </div>
                )}

                {dipendente.turni.length === 0 && (
                  <div className="bg-white rounded-2xl border border-ink-navy/10 p-10 text-center shadow-sm">
                    <p className="text-3xl mb-3">📅</p>
                    <p className="text-ink-navy/40 text-sm">Nessun turno assegnato</p>
                  </div>
                )}
              </div>
            )}

            {/* ── DISPONIBILITÀ ── */}
            {sezione === 'disponibilita' && (
              <div className="space-y-3">
                <p className="text-sm text-ink-navy/40 px-1">Tocca i giorni in cui sei disponibile — diventano verdi.</p>
                <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-ink-navy/8">
                    <button onClick={() => { setMeseDisp(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setGiornoDettaglio(null) }}
                      className="p-1.5 rounded-lg hover:bg-mist text-ink-navy/40 hover:text-ink-navy transition-colors">←</button>
                    <span className="font-semibold text-ink-navy text-sm capitalize">
                      {meseDisp.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                    </span>
                    <button onClick={() => { setMeseDisp(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setGiornoDettaglio(null) }}
                      className="p-1.5 rounded-lg hover:bg-mist text-ink-navy/40 hover:text-ink-navy transition-colors">→</button>
                  </div>
                  <div className="grid grid-cols-7 border-b border-ink-navy/8">
                    {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((g, i) => (
                      <div key={i} className={`py-2 text-center text-xs font-bold ${i >= 5 ? 'text-electric-blue/60' : 'text-ink-navy/30'}`}>{g}</div>
                    ))}
                  </div>
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
                          className={`min-h-[52px] p-1 border-b border-r border-ink-navy/6 flex flex-col items-center justify-start pt-1.5 transition-colors
                            ${!isDelMese ? 'bg-mist/60' : isDisp ? 'bg-green-100 cursor-pointer hover:bg-green-200' : isWeekend ? 'bg-electric-blue/[0.03] cursor-pointer hover:bg-electric-blue/[0.07]' : 'bg-white cursor-pointer hover:bg-mist'}`}>
                          {isDelMese && (
                            <>
                              <p className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full
                                ${isOggi ? 'bg-electric-blue text-white' : isDisp ? 'text-green-700' : isWeekend ? 'text-electric-blue/50' : 'text-ink-navy/70'}`}>
                                {giornoNum}
                              </p>
                              {hasOrario && <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5" />}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <button onClick={salvaDisponibilita} disabled={savingDisp || (!dispModificata && dispSalvata)}
                  className={`w-full font-semibold py-2.5 rounded-xl text-sm transition-colors
                    ${!dispModificata && dispSalvata
                      ? 'bg-green-50 text-green-700 border border-green-200 cursor-default'
                      : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50'}`}>
                  {savingDisp ? 'Salvataggio...' : (!dispModificata && dispSalvata) ? '✅ Salvato' : 'Salva disponibilità'}
                </button>

                {[...giorniDisp].sort((a, b) => a.data.localeCompare(b.data)).map(g => {
                  const isOpen = giornoDettaglio === g.data
                  const haOrario = !!g.oraInizio
                  return (
                    <div key={g.data} className="bg-white border border-ink-navy/10 rounded-xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          <span className="text-sm font-medium text-ink-navy">
                            {new Date(g.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${haOrario ? 'bg-green-100 text-green-700' : 'bg-mist text-ink-navy/50'}`}>
                            {haOrario ? `${g.oraInizio} – ${g.oraFine}` : 'Tutto il giorno'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setGiornoDettaglio(isOpen ? null : g.data)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-electric-blue/10 text-electric-blue hover:bg-electric-blue/15 font-semibold transition-colors">
                            {isOpen ? 'Chiudi' : haOrario ? '✏️' : 'Orario'}
                          </button>
                          <button onClick={() => toggleGiorno(g.data)} className="text-ink-navy/20 hover:text-red-400 p-1 transition-colors">✕</button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="border-t border-ink-navy/8 px-3 py-3 bg-mist/50 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-ink-navy/50 mb-1 font-medium">Dalle</label>
                              <input type="time" value={g.oraInizio} onChange={e => aggiornaGiorno(g.data, 'oraInizio', e.target.value)} className={inp} />
                            </div>
                            <div>
                              <label className="block text-xs text-ink-navy/50 mb-1 font-medium">Alle</label>
                              <input type="time" value={g.oraFine} onChange={e => aggiornaGiorno(g.data, 'oraFine', e.target.value)} className={inp} />
                            </div>
                          </div>
                          <input value={g.note} onChange={e => aggiornaGiorno(g.data, 'note', e.target.value)} placeholder="Note (opzionale)..." className={inp} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── RICHIESTE ── */}
            {sezione === 'richieste' && (
              <div className="space-y-3">
                <button onClick={() => setShowForm(true)}
                  className="w-full bg-electric-blue text-white font-semibold py-3 rounded-xl hover:bg-electric-blue/90 transition-colors text-sm">
                  + Nuova richiesta
                </button>

                {dipendente.richieste.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-ink-navy/10 p-10 text-center shadow-sm">
                    <p className="text-3xl mb-3">📋</p>
                    <p className="text-ink-navy/40 text-sm">Nessuna richiesta inviata</p>
                  </div>
                ) : dipendente.richieste.map(r => (
                  <div key={r.id} className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-ink-navy text-sm">{TIPO_LABEL[r.tipo] || r.tipo}</p>
                        {r.tipo === 'preferenza_orario'
                          ? r.oraInizio && <p className="text-ink-navy/50 text-xs mt-0.5">{r.oraInizio} – {r.oraFine}</p>
                          : r.data && (
                            <p className="text-ink-navy/50 text-xs mt-0.5">
                              {new Date(r.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                              {r.dataFine && r.dataFine !== r.data && ` → ${new Date(r.dataFine).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`}
                            </p>
                          )
                        }
                        {r.note && <p className="text-ink-navy/35 text-xs mt-1 truncate">{r.note}</p>}
                        {r.status === 'in_attesa' && (
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => apriModifica(r)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-electric-blue/10 text-electric-blue hover:bg-electric-blue/15 font-semibold transition-colors">
                              Modifica
                            </button>
                            <button onClick={() => eliminaRichiesta(r.id)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-semibold transition-colors">
                              Rimuovi
                            </button>
                          </div>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLOR[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── ACCOUNT ── */}
            {sezione === 'account' && (
              <div className="space-y-3">
                {dipendente.mustChangePassword && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <p className="font-semibold">Imposta la tua password personale</p>
                    <p className="mt-1 text-amber-700/80">Il responsabile ha impostato una password temporanea. Creane una tua prima di continuare.</p>
                  </div>
                )}

                {passwordCambiata && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">
                    ✅ Password aggiornata con successo
                  </div>
                )}

                {/* Profilo */}
                <div className="bg-white rounded-xl border border-ink-navy/10 shadow-sm divide-y divide-ink-navy/8">
                  <div className="flex items-center gap-3 p-4">
                    {dipendente.fotoUrl
                      ? <img src={dipendente.fotoUrl} alt={dipendente.nome} className="w-10 h-10 rounded-full object-cover shrink-0" />
                      : <div className="w-10 h-10 rounded-full bg-electric-blue/10 text-electric-blue flex items-center justify-center font-bold shrink-0">{dipendente.nome[0].toUpperCase()}</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink-navy truncate">{dipendente.nome}</p>
                      {dipendente.ruolo && <p className="text-xs text-ink-navy/40">{dipendente.ruolo}</p>}
                    </div>
                  </div>
                  {dipendente.username && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <p className="text-xs text-ink-navy/40 w-20 shrink-0">Username</p>
                      <p className="text-sm font-mono text-ink-navy">{dipendente.username}</p>
                    </div>
                  )}
                </div>

                {/* Cambia password */}
                <div className="bg-white rounded-xl border border-ink-navy/10 shadow-sm overflow-hidden">
                  <button
                    onClick={() => { setShowCambiaPassword(!showCambiaPassword); setErrorePassword(''); setNuovaPassword(''); setConfermaPassword('') }}
                    className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-mist transition-colors">
                    <p className="text-sm font-semibold text-ink-navy">
                      {dipendente.mustChangePassword ? 'Imposta nuova password' : 'Cambia password'}
                    </p>
                    <span className={`text-ink-navy/30 transition-transform text-lg ${showCambiaPassword ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {showCambiaPassword && (
                    <form onSubmit={cambiaPassword} className="border-t border-ink-navy/8 px-4 pb-4 pt-3 space-y-3 bg-mist/40">
                      <div>
                        <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Nuova password</label>
                        <input type="password" value={nuovaPassword} onChange={e => setNuovaPassword(e.target.value)}
                          autoComplete="new-password" minLength={6} required className={inp} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Conferma</label>
                        <input type="password" value={confermaPassword} onChange={e => setConfermaPassword(e.target.value)}
                          autoComplete="new-password" required className={inp} />
                      </div>
                      {errorePassword && <p className="text-sm text-red-500">{errorePassword}</p>}
                      <button type="submit" disabled={salvandoPassword}
                        className="w-full bg-electric-blue text-white font-semibold py-2.5 rounded-xl hover:bg-electric-blue/90 disabled:opacity-50 text-sm transition-colors">
                        {salvandoPassword ? 'Salvataggio...' : 'Salva password'}
                      </button>
                    </form>
                  )}
                </div>

                <button onClick={handleLogout}
                  className="w-full border border-ink-navy/15 text-ink-navy/50 font-semibold py-3 rounded-xl hover:bg-ink-navy/5 hover:text-ink-navy hover:border-ink-navy/20 text-sm transition-colors">
                  Esci dall'account
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom nav (solo sezioni interne) */}
      {sezione !== 'home' && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-ink-navy/10 flex pb-[env(safe-area-inset-bottom)]">
          {NAV_ITEMS.map(item => {
            const isActive = sezione === item.key
            return (
              <button key={item.key} onClick={() => { fermaScanner(); setScanResult(null); setScanError(null); setSezione(item.key) }}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${isActive ? 'text-electric-blue' : 'text-ink-navy/35 active:text-ink-navy'}`}>
                <span className="text-base leading-none">{item.emoji}</span>
                <span>{item.label.split(' ')[0]}</span>
                {item.key === 'richieste' && richiesteInAttesa > 0 && (
                  <span className="absolute top-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            )
          })}
        </nav>
      )}

      {/* Modal nuova richiesta */}
      {showForm && (
        <div className="fixed inset-0 bg-ink-navy/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink-navy">{editingRichiesta ? 'Modifica richiesta' : 'Nuova richiesta'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={inp}>
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
                    <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Giorno (opzionale)</label>
                    <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className={inp} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Dalle</label>
                      <input type="time" value={form.oraInizio} onChange={e => setForm(f => ({ ...f, oraInizio: e.target.value }))} className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Alle</label>
                      <input type="time" value={form.oraFine} onChange={e => setForm(f => ({ ...f, oraFine: e.target.value }))} className={inp} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Dal</label>
                    <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Al (opzionale)</label>
                    <input type="date" value={form.dataFine} onChange={e => setForm(f => ({ ...f, dataFine: e.target.value }))} className={inp} />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Note</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Descrivi la tua richiesta..." rows={3} className={`${inp} resize-none`} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowForm(false); setEditingRichiesta(null); setForm({ tipo: 'malattia', data: '', dataFine: '', note: '', oraInizio: '', oraFine: '' }) }}
                className="flex-1 border border-ink-navy/15 text-ink-navy/60 font-semibold py-2.5 rounded-xl hover:bg-mist text-sm transition-colors">
                Annulla
              </button>
              <button onClick={inviaRichiesta} disabled={saving || (form.tipo !== 'preferenza_orario' && !form.data)}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-xl hover:bg-electric-blue/90 text-sm disabled:opacity-50 transition-colors">
                {saving ? 'Invio...' : 'Invia richiesta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

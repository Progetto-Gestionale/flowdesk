'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

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
  oraInizio: string | null
  oraFine: string | null
  note: string | null
  status: string
  createdAt: string
}

interface Timbratura {
  id: string
  tipo: string
  timestamp: string
}

interface Disponibilita {
  id: string
  mese: string
  giorni: string
}

interface Dip {
  id: string
  nome: string
  email: string
  ruolo: string | null
  fotoUrl: string | null
  username: string | null
  mustChangePassword: boolean
  turni: Turno[]
  richieste: Richiesta[]
  timbrature: Timbratura[]
  disponibilita: Disponibilita[]
}

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

const inp = 'w-full border border-ink-navy/15 rounded-xl px-3 py-2.5 text-sm text-ink-navy placeholder:text-ink-navy/30 focus:outline-none focus:ring-2 focus:ring-electric-blue/40 focus:border-electric-blue/50 transition bg-white'

export default function StaffDettaglioPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [dip, setDip] = useState<Dip | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'turni' | 'timbrature' | 'richieste' | 'disponibilita'>('turni')
  const [error, setError] = useState('')

  // Password
  const [showPwForm, setShowPwForm] = useState(false)
  const [nuovaPassword, setNuovaPassword] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwOk, setPwOk] = useState(false)
  const [pwError, setPwError] = useState('')

  // Link
  const [linkInviato, setLinkInviato] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [inviandoLink, setInviandoLink] = useState(false)

  // Richieste
  const [aggiornandoRichiesta, setAggiornandoRichiesta] = useState<string | null>(null)

  // Timbrature filtro data
  const [dataFiltro, setDataFiltro] = useState('')

  async function fetchDip() {
    if (!id) return
    try {
      const res = await fetch(`/api/dipendenti/${id}/dettaglio`, { credentials: 'include' })
      const data = await res.json()
      if (data.dip) {
        setDip(data.dip)
      } else {
        setError(data.error || `Errore ${res.status}`)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (id) fetchDip() }, [id])

  async function impostaPassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (nuovaPassword.length < 6) { setPwError('Almeno 6 caratteri'); return }
    setSavingPw(true)
    try {
      const res = await fetch(`/api/dipendenti/${id}/set-password`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: nuovaPassword }),
      })
      const text = await res.text()
      if (res.ok) {
        setPwOk(true); setNuovaPassword(''); setShowPwForm(false)
        fetchDip()
      } else {
        setPwError(JSON.parse(text)?.error || `Errore ${res.status}`)
      }
    } finally { setSavingPw(false) }
  }

  async function inviaLink() {
    if (!dip) return
    setInviandoLink(true); setLinkError('')
    const res = await fetch('/api/staff/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dip.email, nome: dip.nome }),
    })
    setInviandoLink(false)
    if (res.ok) { setLinkInviato(true); setTimeout(() => setLinkInviato(false), 3000) }
    else { const d = await res.json(); setLinkError(d.error || 'Errore invio') }
  }

  async function aggiornaStatoRichiesta(richiestaId: string, status: 'approvata' | 'rifiutata') {
    setAggiornandoRichiesta(richiestaId)
    await fetch(`/api/richieste-staff/${richiestaId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setAggiornandoRichiesta(null)
    fetchDip()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-ink-navy/35 text-sm font-mono">Caricamento...</p>
    </div>
  )
  if (error) return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link href="/dashboard/staff" className="inline-flex items-center gap-1.5 text-sm text-ink-navy/40 hover:text-ink-navy transition-colors font-medium">← Staff</Link>
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center shadow-sm">
        <p className="text-red-500 font-semibold mb-1">Errore caricamento</p>
        <p className="text-ink-navy/40 text-sm font-mono">{error}</p>
      </div>
    </div>
  )
  if (!dip) return null

  const oggi = new Date().toISOString().split('T')[0]

  const timbratureFiltrate = dataFiltro
    ? dip.timbrature.filter(t => t.timestamp.startsWith(dataFiltro))
    : dip.timbrature

  // Raggruppa timbrature per giorno
  const timbraturaPerGiorno = timbratureFiltrate.reduce<Record<string, Timbratura[]>>((acc, t) => {
    const g = t.timestamp.split('T')[0]
    if (!acc[g]) acc[g] = []
    acc[g].push(t)
    return acc
  }, {})

  // Disponibilità: parse JSON giorni per ogni mese
  const dispParsed = dip.disponibilita.map(d => {
    try { return { mese: d.mese, giorni: JSON.parse(d.giorni) as { data: string; oraInizio: string; oraFine: string; note: string }[] }
    } catch { return { mese: d.mese, giorni: [] } }
  }).sort((a, b) => b.mese.localeCompare(a.mese))

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Back */}
      <Link href="/dashboard/staff" className="inline-flex items-center gap-1.5 text-sm text-ink-navy/40 hover:text-ink-navy transition-colors font-medium">
        ← Staff
      </Link>

      {/* Header dipendente */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {dip.fotoUrl ? (
              <img src={dip.fotoUrl} alt={dip.nome} className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-electric-blue/10 text-electric-blue flex items-center justify-center text-xl font-bold shrink-0">
                {dip.nome[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-ink-navy">{dip.nome}</h1>
              <p className="text-sm text-ink-navy/50 mt-0.5">{dip.email}</p>
              {dip.ruolo && <p className="text-xs text-ink-navy/35 mt-0.5">{dip.ruolo}</p>}
              {dip.username && (
                <p className="text-xs font-mono text-electric-blue mt-1">@{dip.username}</p>
              )}
            </div>
          </div>

          {/* Azioni accesso */}
          <div className="flex flex-col gap-2 min-w-[200px]">
            {pwOk && (
              <p className="text-xs text-green-600 font-medium">✅ Password aggiornata</p>
            )}
            {linkInviato && (
              <p className="text-xs text-green-600 font-medium">✅ Link inviato a {dip.email}</p>
            )}
            {linkError && <p className="text-xs text-red-500">{linkError}</p>}
            {pwError && <p className="text-xs text-red-500">{pwError}</p>}

            <button
              onClick={() => { setShowPwForm(!showPwForm); setPwOk(false); setPwError('') }}
              className="text-sm px-3 py-2 rounded-xl bg-electric-blue/10 text-electric-blue hover:bg-electric-blue/15 font-semibold transition-colors text-left">
              {dip.username ? '🔑 Reimposta password' : '🔑 Imposta accesso'}
            </button>

            {showPwForm && (
              <form onSubmit={impostaPassword} className="space-y-2">
                <input
                  type="password" value={nuovaPassword}
                  onChange={e => setNuovaPassword(e.target.value)}
                  placeholder="Nuova password (min 6 car.)"
                  minLength={6} required
                  className={inp}
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={savingPw}
                    className="flex-1 bg-electric-blue text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50 hover:bg-electric-blue/90 transition-colors">
                    {savingPw ? 'Salvo...' : 'Salva'}
                  </button>
                  <button type="button" onClick={() => setShowPwForm(false)}
                    className="px-3 py-2 border border-ink-navy/15 rounded-xl text-sm text-ink-navy/50 hover:bg-mist transition-colors">
                    ✕
                  </button>
                </div>
              </form>
            )}

            {dip.username && (
              <button
                onClick={inviaLink} disabled={inviandoLink}
                className="text-sm px-3 py-2 rounded-xl bg-ink-navy/5 text-ink-navy/60 hover:bg-ink-navy/10 font-semibold transition-colors disabled:opacity-50">
                {inviandoLink ? 'Invio...' : '✉️ Invia link di accesso'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'turni',        label: 'Turni',        count: dip.turni.length },
          { key: 'timbrature',   label: 'Cartellino',   count: dip.timbrature.length },
          { key: 'richieste',    label: 'Richieste',    count: dip.richieste.filter(r => r.status === 'in_attesa').length },
          { key: 'disponibilita',label: 'Disponibilità',count: null },
        ] as { key: typeof tab; label: string; count: number | null }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors flex items-center gap-1.5 ${
              tab === t.key
                ? 'bg-electric-blue text-white shadow-sm'
                : 'bg-white border border-ink-navy/10 text-ink-navy/60 hover:text-ink-navy hover:border-ink-navy/20'
            }`}>
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20 text-white' : 'bg-ink-navy/8 text-ink-navy/50'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TURNI ── */}
      {tab === 'turni' && (
        <div className="space-y-2">
          {dip.turni.length === 0 ? (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-10 text-center shadow-sm">
              <p className="text-ink-navy/35 text-sm">Nessun turno assegnato</p>
            </div>
          ) : dip.turni.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-ink-navy/10 shadow-sm px-4 py-3 flex items-center gap-4">
              <div className="w-10 text-center shrink-0">
                <p className="text-sm font-bold text-ink-navy leading-none">
                  {new Date(t.data + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric' })}
                </p>
                <p className="text-[10px] text-ink-navy/40 uppercase mt-0.5">
                  {new Date(t.data + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short' })}
                </p>
              </div>
              <div className="w-px h-8 bg-ink-navy/8 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-navy">{t.oraInizio} – {t.oraFine}</p>
                {t.ruolo && <p className="text-xs text-ink-navy/40">{t.ruolo}</p>}
                {t.note && <p className="text-xs text-ink-navy/30 mt-0.5 truncate">{t.note}</p>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                t.data.split('T')[0] < oggi ? 'bg-ink-navy/5 text-ink-navy/30' : t.data.split('T')[0] === oggi ? 'bg-electric-blue/10 text-electric-blue' : 'bg-green-50 text-green-600'
              }`}>
                {t.data.split('T')[0] < oggi ? 'Passato' : t.data.split('T')[0] === oggi ? 'Oggi' : 'Futuro'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── CARTELLINO / TIMBRATURE ── */}
      {tab === 'timbrature' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-ink-navy/50 font-medium">Filtra per data</label>
            <input type="date" value={dataFiltro} onChange={e => setDataFiltro(e.target.value)}
              className="border border-ink-navy/15 rounded-xl px-3 py-1.5 text-sm text-ink-navy focus:outline-none focus:ring-2 focus:ring-electric-blue/40 bg-white" />
            {dataFiltro && (
              <button onClick={() => setDataFiltro('')} className="text-xs text-ink-navy/40 hover:text-ink-navy transition-colors">✕ Tutti</button>
            )}
          </div>

          {Object.keys(timbraturaPerGiorno).length === 0 ? (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-10 text-center shadow-sm">
              <p className="text-ink-navy/35 text-sm">Nessuna timbratura</p>
            </div>
          ) : Object.entries(timbraturaPerGiorno).sort(([a], [b]) => b.localeCompare(a)).map(([giorno, timbr]) => {
            const entrata = timbr.find(t => t.tipo === 'entrata')
            const uscita = timbr.filter(t => t.tipo === 'uscita').pop()
            let ore: string | null = null
            if (entrata && uscita) {
              const diffMs = new Date(uscita.timestamp).getTime() - new Date(entrata.timestamp).getTime()
              const h = Math.floor(diffMs / 3600000)
              const m = Math.floor((diffMs % 3600000) / 60000)
              ore = `${h}h ${m}m`
            }
            return (
              <div key={giorno} className="bg-white rounded-xl border border-ink-navy/10 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-ink-navy/6">
                  <p className="text-sm font-semibold text-ink-navy capitalize">
                    {new Date(giorno + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  {ore && (
                    <span className="text-xs font-semibold text-electric-blue bg-electric-blue/10 px-2 py-0.5 rounded-full">
                      {ore} totali
                    </span>
                  )}
                </div>
                <div className="divide-y divide-ink-navy/6">
                  {[...timbr].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
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
            )
          })}
        </div>
      )}

      {/* ── RICHIESTE ── */}
      {tab === 'richieste' && (
        <div className="space-y-2">
          {dip.richieste.length === 0 ? (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-10 text-center shadow-sm">
              <p className="text-ink-navy/35 text-sm">Nessuna richiesta</p>
            </div>
          ) : dip.richieste.map(r => (
            <div key={r.id} className={`bg-white rounded-xl border shadow-sm p-4 ${r.status === 'in_attesa' ? 'border-amber-200' : 'border-ink-navy/10'}`}>
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
                  {r.note && <p className="text-xs text-ink-navy/35 mt-1">{r.note}</p>}
                  {r.status === 'in_attesa' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        disabled={aggiornandoRichiesta === r.id}
                        onClick={() => aggiornaStatoRichiesta(r.id, 'approvata')}
                        className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-semibold transition-colors disabled:opacity-50">
                        ✓ Approva
                      </button>
                      <button
                        disabled={aggiornandoRichiesta === r.id}
                        onClick={() => aggiornaStatoRichiesta(r.id, 'rifiutata')}
                        className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold transition-colors disabled:opacity-50">
                        ✕ Rifiuta
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

      {/* ── DISPONIBILITÀ ── */}
      {tab === 'disponibilita' && (
        <div className="space-y-3">
          {dispParsed.length === 0 || dispParsed.every(d => d.giorni.length === 0) ? (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-10 text-center shadow-sm">
              <p className="text-ink-navy/35 text-sm">Nessuna disponibilità inserita</p>
            </div>
          ) : dispParsed.filter(d => d.giorni.length > 0).map(d => (
            <div key={d.mese} className="bg-white rounded-xl border border-ink-navy/10 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-navy/6">
                <p className="text-sm font-semibold text-ink-navy capitalize">
                  {new Date(d.mese + 'T12:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="divide-y divide-ink-navy/6">
                {[...d.giorni].sort((a, b) => a.data.localeCompare(b.data)).map((g, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    <span className="text-sm text-ink-navy font-medium">
                      {new Date(g.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-xs text-ink-navy/40 ml-auto">
                      {g.oraInizio && g.oraFine ? `${g.oraInizio} – ${g.oraFine}` : 'Tutto il giorno'}
                    </span>
                    {g.note && <span className="text-xs text-ink-navy/30 truncate max-w-[100px]">{g.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

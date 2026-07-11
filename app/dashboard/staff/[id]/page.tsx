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

interface GiornoDisp {
  data: string
  oraInizio: string
  oraFine: string
  note: string
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
const RICHIESTA_COLOR: Record<string, string> = {
  ferie: 'bg-sky-100 text-sky-700',
  malattia: 'bg-red-100 text-red-700',
  permesso: 'bg-amber-100 text-amber-700',
  assenza: 'bg-orange-100 text-orange-700',
}

const inp = 'w-full border border-ink-navy/15 rounded-xl px-3 py-2.5 text-sm text-ink-navy placeholder:text-ink-navy/30 focus:outline-none focus:ring-2 focus:ring-electric-blue/40 focus:border-electric-blue/50 transition bg-white'

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function StaffDettaglioPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [dip, setDip] = useState<Dip | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'calendario' | 'timbrature' | 'richieste'>('calendario')
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

  // Calendario
  const now = new Date()
  const [calMese, setCalMese] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [giornoSel, setGiornoSel] = useState<string | null>(null)

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

  // Pairing globale: entrata→uscita indipendente dal giorno (gestisce mezzanotte)
  const sortedTimbr = [...dip.timbrature].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  interface Coppia { entrata: Timbratura; uscita: Timbratura | null; giorno: string }
  const coppieGlobali: Coppia[] = []
  let ti = 0
  while (ti < sortedTimbr.length) {
    if (sortedTimbr[ti].tipo === 'entrata') {
      const usc = sortedTimbr[ti + 1]?.tipo === 'uscita' ? sortedTimbr[ti + 1] : null
      coppieGlobali.push({ entrata: sortedTimbr[ti], uscita: usc, giorno: sortedTimbr[ti].timestamp.split('T')[0] })
      ti += usc ? 2 : 1
    } else { ti++ }
  }
  const coppiePerGiorno: Record<string, Coppia[]> = {}
  for (const c of coppieGlobali) {
    if (!coppiePerGiorno[c.giorno]) coppiePerGiorno[c.giorno] = []
    coppiePerGiorno[c.giorno].push(c)
  }

  // Per il filtro data: filtra per giorno entrata
  const coppiePerGiornoFiltrate = dataFiltro
    ? Object.fromEntries(Object.entries(coppiePerGiorno).filter(([g]) => g === dataFiltro))
    : coppiePerGiorno

  // Disponibilità: parse giorni per ogni mese
  const tuttiGiorniDisp: GiornoDisp[] = []
  for (const d of dip.disponibilita) {
    try {
      const giorni: GiornoDisp[] = JSON.parse(d.giorni)
      tuttiGiorniDisp.push(...giorni)
    } catch { /* ignore */ }
  }
  const dispPerGiorno: Record<string, GiornoDisp[]> = {}
  for (const g of tuttiGiorniDisp) {
    if (!dispPerGiorno[g.data]) dispPerGiorno[g.data] = []
    dispPerGiorno[g.data].push(g)
  }

  // Richieste approvate: espandi range date in giorni singoli
  const richiesteApprovateDates: Record<string, Richiesta[]> = {}
  for (const r of dip.richieste) {
    if (r.status !== 'approvata' || r.tipo === 'preferenza_orario' || !r.data) continue
    const start = new Date(r.data.split('T')[0] + 'T12:00:00')
    const end = r.dataFine ? new Date(r.dataFine.split('T')[0] + 'T12:00:00') : start
    const cur = new Date(start)
    while (cur <= end) {
      const key = isoDate(cur)
      if (!richiesteApprovateDates[key]) richiesteApprovateDates[key] = []
      richiesteApprovateDates[key].push(r)
      cur.setDate(cur.getDate() + 1)
    }
  }

  // Turni per giorno
  const turniPerGiorno: Record<string, Turno[]> = {}
  for (const t of dip.turni) {
    const key = t.data.split('T')[0]
    if (!turniPerGiorno[key]) turniPerGiorno[key] = []
    turniPerGiorno[key].push(t)
  }

  // Costruzione griglia calendario
  const [calAnno, calMeseNum] = calMese.split('-').map(Number)
  const primoDelMese = new Date(calAnno, calMeseNum - 1, 1)
  const ultimoDelMese = new Date(calAnno, calMeseNum, 0)
  // Lunedì = 0
  const inizioGriglia = new Date(primoDelMese)
  const dow = (primoDelMese.getDay() + 6) % 7
  inizioGriglia.setDate(inizioGriglia.getDate() - dow)
  const celle: Date[] = []
  const cur2 = new Date(inizioGriglia)
  while (cur2 <= ultimoDelMese || celle.length % 7 !== 0) {
    celle.push(new Date(cur2))
    cur2.setDate(cur2.getDate() + 1)
    if (celle.length > 42) break
  }

  function prevMese() {
    const d = new Date(calAnno, calMeseNum - 2, 1)
    setCalMese(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    setGiornoSel(null)
  }
  function nextMese() {
    const d = new Date(calAnno, calMeseNum, 1)
    setCalMese(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    setGiornoSel(null)
  }

  const nomeMese = primoDelMese.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  // Dettaglio giorno selezionato
  const selTurni = giornoSel ? (turniPerGiorno[giornoSel] ?? []) : []
  const selDisp = giornoSel ? (dispPerGiorno[giornoSel] ?? []) : []
  const selRichieste = giornoSel ? (richiesteApprovateDates[giornoSel] ?? []) : []

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
            {pwOk && <p className="text-xs text-green-600 font-medium">✅ Password aggiornata</p>}
            {linkInviato && <p className="text-xs text-green-600 font-medium">✅ Link inviato a {dip.email}</p>}
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
          { key: 'calendario',  label: 'Calendario',  count: null },
          { key: 'timbrature',  label: 'Cartellino',  count: null },
          { key: 'richieste',   label: 'Richieste',   count: dip.richieste.filter(r => r.status === 'in_attesa').length },
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

      {/* ── CALENDARIO ── */}
      {tab === 'calendario' && (
        <div className="space-y-3">
          {/* Legenda */}
          <div className="flex gap-4 flex-wrap text-xs text-ink-navy/50">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-electric-blue inline-block" />Turno</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Disponibile</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Richiesta approvata</span>
          </div>

          <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
            {/* Navigazione mese */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink-navy/8">
              <button onClick={prevMese} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-mist transition-colors text-ink-navy/50 hover:text-ink-navy">
                ‹
              </button>
              <p className="text-sm font-semibold text-ink-navy capitalize">{nomeMese}</p>
              <button onClick={nextMese} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-mist transition-colors text-ink-navy/50 hover:text-ink-navy">
                ›
              </button>
            </div>

            {/* Intestazioni giorni */}
            <div className="grid grid-cols-7 border-b border-ink-navy/8">
              {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(g => (
                <div key={g} className="py-2 text-center text-[10px] font-semibold text-ink-navy/35 uppercase tracking-wide">
                  {g}
                </div>
              ))}
            </div>

            {/* Celle */}
            <div className="grid grid-cols-7">
              {celle.map((giorno, idx) => {
                const key = isoDate(giorno)
                const inMese = giorno.getMonth() === calMeseNum - 1
                const isOggi = key === oggi
                const isSel = key === giornoSel
                const turni = turniPerGiorno[key] ?? []
                const disp = dispPerGiorno[key] ?? []
                const richieste = richiesteApprovateDates[key] ?? []
                const hasContent = turni.length > 0 || disp.length > 0 || richieste.length > 0

                return (
                  <button
                    key={idx}
                    onClick={() => setGiornoSel(isSel ? null : key)}
                    className={`relative min-h-[68px] p-1.5 text-left border-b border-r border-ink-navy/6 transition-colors
                      ${!inMese ? 'opacity-30' : ''}
                      ${isSel ? 'bg-electric-blue/5' : hasContent ? 'hover:bg-mist' : 'hover:bg-mist/50'}
                      ${idx % 7 === 6 ? 'border-r-0' : ''}
                    `}
                  >
                    {/* Numero giorno */}
                    <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold mb-1
                      ${isOggi ? 'bg-electric-blue text-white' : isSel ? 'bg-electric-blue/10 text-electric-blue' : 'text-ink-navy/70'}
                    `}>
                      {giorno.getDate()}
                    </span>

                    {/* Banner richieste approvate */}
                    {richieste.map((r, i) => (
                      <div key={i} className={`text-[9px] font-semibold px-1 py-0.5 rounded truncate mb-0.5 ${RICHIESTA_COLOR[r.tipo] ?? 'bg-amber-100 text-amber-700'}`}>
                        {TIPO_LABEL[r.tipo] ?? r.tipo}
                      </div>
                    ))}

                    {/* Pills turni */}
                    {turni.map((t, i) => (
                      <div key={i} className="text-[9px] font-semibold px-1 py-0.5 rounded truncate mb-0.5 bg-electric-blue/10 text-electric-blue">
                        {t.oraInizio}–{t.oraFine}
                      </div>
                    ))}

                    {/* Dot disponibilità */}
                    {disp.length > 0 && turni.length === 0 && richieste.length === 0 && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        <span className="text-[9px] text-green-600 font-medium">Disponibile</span>
                      </div>
                    )}
                    {disp.length > 0 && (turni.length > 0 || richieste.length > 0) && (
                      <span className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full bg-green-400" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      )}

      {/* ── MODALE DETTAGLIO GIORNO ── */}
      {giornoSel && tab === 'calendario' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setGiornoSel(null)}>
          <div className="absolute inset-0 bg-ink-navy/30" />
          <div
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-ink-navy/8 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-navy capitalize">
                {new Date(giornoSel + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <button onClick={() => setGiornoSel(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-navy/30 hover:text-ink-navy hover:bg-mist transition-colors text-lg leading-none">
                ×
              </button>
            </div>

            {selTurni.length === 0 && selDisp.length === 0 && selRichieste.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-ink-navy/35 text-sm">Nessuna informazione per questo giorno</p>
              </div>
            ) : (
              <div className="divide-y divide-ink-navy/6 max-h-[60vh] overflow-y-auto">
                {selRichieste.map(r => (
                  <div key={r.id} className="px-4 py-3 flex items-start gap-3">
                    <span className={`mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${RICHIESTA_COLOR[r.tipo] ?? 'bg-amber-100 text-amber-700'}`}>
                      {TIPO_LABEL[r.tipo] ?? r.tipo}
                    </span>
                    <div className="flex-1 min-w-0">
                      {r.data && (
                        <p className="text-xs text-ink-navy/50">
                          {new Date(r.data.split('T')[0] + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                          {r.dataFine && r.dataFine !== r.data && ` → ${new Date(r.dataFine.split('T')[0] + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`}
                        </p>
                      )}
                      {r.note && <p className="text-xs text-ink-navy/35 mt-0.5">{r.note}</p>}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                ))}

                {selTurni.map(t => (
                  <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-electric-blue shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink-navy">{t.oraInizio} – {t.oraFine}</p>
                      {t.ruolo && <p className="text-xs text-ink-navy/40">{t.ruolo}</p>}
                      {t.note && <p className="text-xs text-ink-navy/30 mt-0.5">{t.note}</p>}
                    </div>
                    <span className="text-xs font-medium text-electric-blue bg-electric-blue/8 px-2 py-0.5 rounded-full">Turno</span>
                  </div>
                ))}

                {selDisp.map((g, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink-navy">
                        {g.oraInizio && g.oraFine ? `${g.oraInizio} – ${g.oraFine}` : 'Tutto il giorno'}
                      </p>
                      {g.note && <p className="text-xs text-ink-navy/35 mt-0.5">{g.note}</p>}
                    </div>
                    <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Disponibile</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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

          {Object.keys(coppiePerGiornoFiltrate).length === 0 ? (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-10 text-center shadow-sm">
              <p className="text-ink-navy/35 text-sm">Nessuna timbratura</p>
            </div>
          ) : Object.entries(coppiePerGiornoFiltrate).sort(([a], [b]) => b.localeCompare(a)).map(([giorno, coppie]) => (
            <div key={giorno} className="bg-white rounded-xl border border-ink-navy/10 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-navy/6">
                <p className="text-sm font-semibold text-ink-navy capitalize">
                  {new Date(giorno + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <div className="divide-y divide-ink-navy/6">
                {coppie.map(({ entrata, uscita }, ci) => {
                  let durata: string | null = null
                  if (uscita) {
                    const diffMs = new Date(uscita.timestamp).getTime() - new Date(entrata.timestamp).getTime()
                    const h = Math.floor(diffMs / 3600000)
                    const m = Math.floor((diffMs % 3600000) / 60000)
                    durata = `${h}h ${m}m`
                  }
                  return (
                    <div key={ci} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                          {new Date(entrata.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-ink-navy/25 text-xs">→</span>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${uscita ? 'text-red-600 bg-red-50' : 'text-ink-navy/30 bg-ink-navy/5'}`}>
                          {uscita
                            ? new Date(uscita.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                              + (uscita.timestamp.split('T')[0] !== giorno ? ' +1g' : '')
                            : '–'}
                        </span>
                      </div>
                      {durata && (
                        <span className="ml-auto text-xs font-semibold text-electric-blue bg-electric-blue/10 px-2 py-0.5 rounded-full shrink-0">
                          {durata}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
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
    </div>
  )
}

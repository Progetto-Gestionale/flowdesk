'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Logo from '@/app/components/Logo'
import { IconArrowRight, IconCheck, IconClock } from '@/app/components/icons'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const GIORNI_INIZIALE = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

// Calendario mensile inline per scegliere il giorno della prenotazione.
// I giorni in cui il servizio scelto è prenotabile sono evidenziati in verde;
// gli altri restano spenti e non cliccabili, così non si prova a caso.
function CalendarioMese({ selected, min, onSelect, disponibili, caricando, onMeseCambiato }: {
  selected: string
  min: string
  onSelect: (d: string) => void
  disponibili: Set<string>
  caricando: boolean
  onMeseCambiato: (mese: string) => void
}) {
  const [viewYear, setViewYear] = useState(() => parseInt(selected.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => parseInt(selected.slice(5, 7)) - 1)

  const mese = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
  useEffect(() => { onMeseCambiato(mese) }, [mese])

  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay = new Date(viewYear, viewMonth + 1, 0)
  let startDow = firstDay.getDay() - 1; if (startDow < 0) startDow = 6
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const minMese = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}` <= min.slice(0, 7)
  function prevM() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  function nextM() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevM} disabled={minMese}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 disabled:opacity-25 disabled:hover:bg-transparent">‹</button>
        <span className="text-sm font-bold text-ink-navy">{MESI[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextM}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {GIORNI_INIZIALE.map((g, i) => <span key={i} className="text-center text-[10px] font-semibold text-ink-navy/30 py-1">{g}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />
          const k = `${mese}-${String(day).padStart(2, '0')}`
          const isSel = k === selected
          const isPast = k < min
          const libero = disponibili.has(k)
          // Finché arrivano i giorni disponibili non blocchiamo nulla, per non far
          // lampeggiare il calendario tutto spento a ogni cambio mese
          const bloccato = isPast || (!caricando && !libero)
          return (
            <button key={i} type="button" disabled={bloccato} onClick={() => onSelect(k)}
              className={`h-9 w-full rounded-lg text-sm font-medium transition-colors
                ${isSel ? 'bg-electric-blue text-white font-bold'
                  : bloccato ? 'text-ink-navy/20 cursor-not-allowed'
                  : libero ? 'bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100'
                  : 'text-ink-navy hover:bg-electric-blue/10'}`}>
              {day}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-1.5 mt-3">
        <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200 shrink-0" />
        <span className="text-xs text-ink-navy/40">
          {caricando ? 'Cerco i giorni disponibili...' : 'Giorni disponibili per questo servizio'}
        </span>
      </div>
    </div>
  )
}

interface TipoSeduta {
  id: string
  nome: string
  descrizione?: string
  prezzo: number
  durata: number
}

function oggiStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtGiorno(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`)
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function PrenotaCarePage() {
  const { publicId } = useParams<{ publicId: string }>()

  const [nomeLocale, setNomeLocale] = useState('')
  const [tipiSeduta, setTipiSeduta] = useState<TipoSeduta[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [tipoScelto, setTipoScelto] = useState<TipoSeduta | null>(null)
  const [dataScelta, setDataScelta] = useState(oggiStr())
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [oraScelta, setOraScelta] = useState<string | null>(null)

  const [giorniDisponibili, setGiorniDisponibili] = useState<Set<string>>(new Set())
  const [caricandoGiorni, setCaricandoGiorni] = useState(false)
  const [meseVisibile, setMeseVisibile] = useState(() => oggiStr().slice(0, 7))

  const [form, setForm] = useState({ nome: '', email: '', telefono: '', note: '' })
  const [inviando, setInviando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [confermato, setConfermato] = useState(false)

  // Riconoscimento del paziente dall'email, prima di chiedergli i dati
  const [emailCercata, setEmailCercata] = useState<string | null>(null)
  const [pazienteNoto, setPazienteNoto] = useState<{ nome: string; telefonoMascherato: string | null } | null>(null)
  const [cercando, setCercando] = useState(false)
  const [erroreEmail, setErroreEmail] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/public/care-tipi-seduta?publicId=${publicId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setNotFound(true); setLoading(false); return }
        setNomeLocale(d.nomeLocale ?? '')
        setTipiSeduta(d.tipiSeduta ?? [])
        setLoading(false)
      })
  }, [publicId])

  useEffect(() => {
    if (step !== 2 || !tipoScelto) return
    setLoadingSlots(true)
    setOraScelta(null)
    fetch(`/api/public/care-disponibilita?publicId=${publicId}&data=${dataScelta}&durata=${tipoScelto.durata}&tipoSedutaId=${tipoScelto.id}`)
      .then(r => r.json())
      .then(d => { setSlots(d.slots ?? []); setLoadingSlots(false) })
  }, [step, tipoScelto, dataScelta, publicId])

  // Giorni prenotabili del mese visibile, per il colore verde nel calendario
  useEffect(() => {
    if (step < 2 || !tipoScelto) return
    setCaricandoGiorni(true)
    fetch(`/api/public/care-giorni-disponibili?publicId=${publicId}&tipoSedutaId=${tipoScelto.id}&mese=${meseVisibile}`)
      .then(r => r.json())
      .then(d => setGiorniDisponibili(new Set<string>(d.giorni ?? [])))
      .catch(() => setGiorniDisponibili(new Set()))
      .finally(() => setCaricandoGiorni(false))
  }, [step, tipoScelto, meseVisibile, publicId])

  /** Cerca il paziente dall'email: se lo troviamo gli chiediamo solo conferma. */
  async function verificaEmail() {
    const email = form.email.trim()
    if (!email.includes('@')) { setErroreEmail('Controlla l\'indirizzo email'); return }
    setCercando(true)
    setErroreEmail(null)
    try {
      const res = await fetch('/api/public/care-paziente-cerca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId, email }),
      })
      const d = await res.json()
      if (!res.ok) { setErroreEmail('Non riesco a verificare l\'email, riprova.'); return }
      setPazienteNoto(d.trovato ? { nome: d.nome, telefonoMascherato: d.telefonoMascherato } : null)
      if (d.trovato) setForm(f => ({ ...f, nome: d.nome }))
      setEmailCercata(email)
    } catch {
      setErroreEmail('Non riesco a verificare l\'email, riprova.')
    } finally {
      setCercando(false)
    }
  }

  /** "Non sono io": si prosegue come paziente nuovo, con i campi da compilare. */
  function nonSonoIo() {
    setPazienteNoto(null)
    setForm(f => ({ ...f, nome: '', telefono: '' }))
  }

  function cambiaEmail() {
    setEmailCercata(null)
    setPazienteNoto(null)
    setErroreEmail(null)
    setForm(f => ({ ...f, nome: '', telefono: '' }))
  }

  async function handleConferma() {
    if (!tipoScelto || !oraScelta) return
    setInviando(true)
    setErrore(null)
    const res = await fetch('/api/public/care-prenota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicId, tipoSedutaId: tipoScelto.id, data: dataScelta, ora: oraScelta,
        nome: form.nome, email: form.email, telefono: form.telefono, note: form.note,
      }),
    })
    const d = await res.json()
    setInviando(false)
    if (!res.ok) { setErrore(d.error ?? 'Errore, riprova.'); return }
    setConfermato(true)
  }

  if (loading) return <main className="min-h-screen bg-mist flex items-center justify-center text-ink-navy/35 text-sm">Caricamento...</main>
  if (notFound) return <main className="min-h-screen bg-mist flex items-center justify-center text-ink-navy/50 text-sm">Pagina non trovata</main>

  return (
    <main className="min-h-screen bg-mist">
      <header className="bg-ink-navy">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center">
          <Logo size={30} dark />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-extrabold text-ink-navy">{nomeLocale || 'Prenota una seduta'}</h1>
        <p className="text-ink-navy/50 mt-1">Scegli il tipo di seduta e l&apos;orario che preferisci.</p>

        {confermato ? (
          <div className="mt-8 bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center p-3.5 mx-auto mb-4">
              <IconCheck />
            </div>
            <h2 className="text-xl font-bold text-ink-navy">Richiesta inviata</h2>
            <p className="text-ink-navy/50 mt-2">
              {tipoScelto?.nome} — {fmtGiorno(dataScelta)} alle {oraScelta}
            </p>
            <p className="text-sm text-ink-navy/40 mt-4">La tua richiesta è in attesa di conferma. Riceverai una email non appena verrà confermata.</p>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {/* Step 1: tipo seduta */}
            <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5">
              <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-3">1 — Tipo di seduta</p>
              {tipiSeduta.length === 0 ? (
                <p className="text-sm text-ink-navy/40">Nessun servizio disponibile al momento.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {tipiSeduta.map(t => (
                    <button key={t.id} onClick={() => { setTipoScelto(t); setStep(2) }}
                      className={`text-left rounded-xl border-2 p-3 transition-colors ${tipoScelto?.id === t.id ? 'border-electric-blue bg-electric-blue/10' : 'border-ink-navy/10 hover:border-electric-blue/40'}`}>
                      <p className="font-semibold text-ink-navy text-sm">{t.nome}</p>
                      {t.descrizione && <p className="text-xs text-ink-navy/50 mt-0.5">{t.descrizione}</p>}
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-ink-navy/40">
                        <span className="flex items-center gap-1"><span className="w-3 h-3"><IconClock /></span>{t.durata} min</span>
                        {t.prezzo > 0 && <span className="font-semibold text-electric-blue">€{t.prezzo.toFixed(2)}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: data + ora */}
            {step >= 2 && tipoScelto && (
              <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5">
                <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-3">2 — Data e ora</p>
                <CalendarioMese
                  selected={dataScelta} min={oggiStr()} onSelect={setDataScelta}
                  disponibili={giorniDisponibili} caricando={caricandoGiorni}
                  onMeseCambiato={setMeseVisibile} />
                <div className="mt-3">
                  {loadingSlots ? (
                    <p className="text-sm text-ink-navy/35 py-4 text-center">Caricamento orari...</p>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-ink-navy/35 py-4 text-center">Nessun orario disponibile per questo giorno</p>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                      {slots.map(s => (
                        <button key={s} onClick={() => { setOraScelta(s); setStep(3) }}
                          className={`text-xs font-semibold py-2 rounded-lg transition-colors ${oraScelta === s ? 'bg-electric-blue text-white' : 'bg-mist text-ink-navy/70 hover:bg-electric-blue/10'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: dati contatto */}
            {step >= 3 && oraScelta && (
              <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5">
                <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-3">3 — I tuoi dati</p>

                {/* Prima l'email: da lì capiamo se ci sei già o sei un paziente nuovo */}
                {!emailCercata ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-ink-navy/70 mb-1">La tua email</label>
                      <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') verificaEmail() }}
                        placeholder="mario@email.com" type="email" autoFocus
                        className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                      <p className="text-xs text-ink-navy/35 mt-1.5">
                        Se sei già stato da noi la riconosciamo e non ti facciamo riscrivere tutto.
                      </p>
                    </div>
                    {erroreEmail && <p className="text-sm text-red-500">{erroreEmail}</p>}
                    <button onClick={verificaEmail} disabled={cercando || !form.email.trim()}
                      className="w-full inline-flex items-center justify-center gap-2 bg-electric-blue text-white font-bold text-sm py-3 rounded-lg hover:bg-electric-blue/90 transition-colors disabled:opacity-40">
                      {cercando ? 'Verifico...' : 'Continua'}
                      <span className="w-4 h-4"><IconArrowRight /></span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 bg-mist rounded-lg px-3 py-2">
                      <span className="text-sm text-ink-navy/70 truncate">{emailCercata}</span>
                      <button onClick={cambiaEmail} className="text-xs font-semibold text-electric-blue hover:underline shrink-0">
                        Cambia
                      </button>
                    </div>

                    {pazienteNoto ? (
                      // Paziente riconosciuto: gli chiediamo solo se è davvero lui
                      <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 text-emerald-600 shrink-0"><IconCheck /></span>
                          <p className="text-sm font-semibold text-emerald-900">Bentornato!</p>
                        </div>
                        <p className="text-sm text-emerald-900/80 mt-2">
                          Risulti già registrato come <strong>{pazienteNoto.nome}</strong>
                          {pazienteNoto.telefonoMascherato && <> · {pazienteNoto.telefonoMascherato}</>}.
                        </p>
                        <button onClick={nonSonoIo}
                          className="mt-2 text-xs font-semibold text-emerald-800 hover:underline">
                          Non sono io
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-ink-navy/50">
                          È la prima volta che prenoti: lasciaci i tuoi dati.
                        </p>
                        <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                          placeholder="Nome e cognome *" autoFocus
                          className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                        <input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })}
                          placeholder="Telefono *" type="tel"
                          className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                      </>
                    )}

                    <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2}
                      placeholder="Note per il fisioterapista (opzionale)"
                      className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />

                    {errore && <p className="text-sm text-red-500">{errore}</p>}

                    <div className="bg-mist rounded-lg px-4 py-3 text-sm text-ink-navy/70">
                      <strong>{tipoScelto?.nome}</strong> — {fmtGiorno(dataScelta)} alle {oraScelta} ({tipoScelto?.durata} min)
                    </div>

                    <button onClick={handleConferma}
                      disabled={inviando || !form.nome.trim() || (!pazienteNoto && !form.telefono.trim())}
                      className="w-full inline-flex items-center justify-center gap-2 bg-electric-blue text-white font-bold text-sm py-3 rounded-lg hover:bg-electric-blue/90 transition-colors disabled:opacity-40">
                      {inviando ? 'Invio...' : 'Invia richiesta'}
                      <span className="w-4 h-4"><IconArrowRight /></span>
                    </button>
                    <p className="text-xs text-ink-navy/35 text-center">
                      Riceverai il riepilogo e la conferma dello studio via email.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

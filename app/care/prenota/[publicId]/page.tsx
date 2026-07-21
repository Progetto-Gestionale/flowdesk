'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Logo from '@/app/components/Logo'
import { IconArrowRight, IconCheck, IconClock } from '@/app/components/icons'

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
function addGiorni(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + n)
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

  const [form, setForm] = useState({ nome: '', email: '', telefono: '', note: '' })
  const [inviando, setInviando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [confermato, setConfermato] = useState(false)

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
    fetch(`/api/public/care-disponibilita?publicId=${publicId}&data=${dataScelta}&durata=${tipoScelto.durata}`)
      .then(r => r.json())
      .then(d => { setSlots(d.slots ?? []); setLoadingSlots(false) })
  }, [step, tipoScelto, dataScelta, publicId])

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

  const giorni = Array.from({ length: 14 }, (_, i) => addGiorni(oggiStr(), i))

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
            <h2 className="text-xl font-bold text-ink-navy">Prenotazione confermata</h2>
            <p className="text-ink-navy/50 mt-2">
              {tipoScelto?.nome} — {fmtGiorno(dataScelta)} alle {oraScelta}
            </p>
            <p className="text-sm text-ink-navy/40 mt-4">Riceverai una conferma via email a breve.</p>
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
                <div className="flex gap-1.5 overflow-x-auto pb-2">
                  {giorni.map(g => (
                    <button key={g} onClick={() => setDataScelta(g)}
                      className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-lg capitalize transition-colors ${dataScelta === g ? 'bg-electric-blue text-white' : 'bg-mist text-ink-navy/60 hover:bg-ink-navy/10'}`}>
                      {fmtGiorno(g)}
                    </button>
                  ))}
                </div>
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
                <div className="space-y-3">
                  <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                    placeholder="Nome e cognome *"
                    className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="Email" type="email"
                      className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                    <input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })}
                      placeholder="Telefono" type="tel"
                      className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                  </div>
                  <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2}
                    placeholder="Note per il fisioterapista (opzionale)"
                    className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
                </div>

                {errore && <p className="text-sm text-red-500 mt-3">{errore}</p>}

                <div className="mt-4 bg-mist rounded-lg px-4 py-3 text-sm text-ink-navy/70">
                  <strong>{tipoScelto?.nome}</strong> — {fmtGiorno(dataScelta)} alle {oraScelta} ({tipoScelto?.durata} min)
                </div>

                <button onClick={handleConferma} disabled={!form.nome.trim() || inviando}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-electric-blue text-white font-bold text-sm py-3 rounded-lg hover:bg-electric-blue/90 transition-colors disabled:opacity-40">
                  {inviando ? 'Invio...' : 'Conferma prenotazione'}
                  <span className="w-4 h-4"><IconArrowRight /></span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

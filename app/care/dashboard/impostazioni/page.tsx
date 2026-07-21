'use client'

import { useEffect, useState } from 'react'
import { IconCheck } from '@/app/components/icons'

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const GIORNI_LABEL: Record<string, string> = {
  lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì',
  ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica',
}

const cls = 'w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue'

function jp<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

export default function ImpostazioniCarePage() {
  const [loading, setLoading] = useState(true)
  const [nomeLocale, setNomeLocale] = useState('')
  const [telefono, setTelefono] = useState('')
  const [publicId, setPublicId] = useState('')
  const [orari, setOrari] = useState<Record<string, string>>({})
  const [savingInfo, setSavingInfo] = useState(false)
  const [savedInfo, setSavedInfo] = useState(false)
  const [savingOrari, setSavingOrari] = useState(false)
  const [savedOrari, setSavedOrari] = useState(false)

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => {
        setNomeLocale(s.nomeLocale ?? '')
        setTelefono(s.telefono ?? '')
        setPublicId(s.publicId ?? '')
        setOrari(jp(s.orariApertura, {}))
        setLoading(false)
      })
  }, [])

  async function salvaInfo() {
    setSavingInfo(true)
    await fetch('/api/settings', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomeLocale, telefono, publicId }),
    }).then(r => r.json()).then(d => { if (d.publicId) setPublicId(d.publicId) })
    setSavingInfo(false)
    setSavedInfo(true)
    setTimeout(() => setSavedInfo(false), 2000)
  }

  async function salvaOrari() {
    setSavingOrari(true)
    await fetch('/api/settings', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orariApertura: JSON.stringify(orari) }),
    })
    setSavingOrari(false)
    setSavedOrari(true)
    setTimeout(() => setSavedOrari(false), 2000)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const linkPubblico = publicId ? `${origin}/care/prenota/${publicId}` : null

  if (loading) return <div className="text-center text-ink-navy/35 py-16">Caricamento...</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink-navy">Impostazioni</h1>
        <p className="text-ink-navy/50 mt-1">Configura lo studio e il link pubblico di prenotazione.</p>
      </div>

      {/* Info studio */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-ink-navy">Info studio</h2>
          <button onClick={salvaInfo} disabled={savingInfo}
            className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors ${savedInfo ? 'bg-green-100 text-green-700' : 'bg-electric-blue text-white hover:bg-electric-blue/90'}`}>
            {savingInfo ? 'Salvataggio...' : savedInfo ? 'Salvato' : 'Salva'}
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome studio *</label>
          <input value={nomeLocale} onChange={e => setNomeLocale(e.target.value)}
            placeholder="Studio di Fisioterapia Rossi" className={cls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-1">Telefono</label>
          <input value={telefono} onChange={e => setTelefono(e.target.value)}
            placeholder="+39 333 000 0000" className={cls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-1">ID pubblico</label>
          <input value={publicId} onChange={e => setPublicId(e.target.value)}
            placeholder="studio-rossi" className={cls} />
          <p className="text-xs text-ink-navy/35 mt-1">Usato nel link pubblico di prenotazione. Generato automaticamente dal nome se lo lasci vuoto.</p>
        </div>
        {linkPubblico && (
          <div className="bg-mist rounded-lg px-3 py-2.5">
            <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wider mb-1">Link prenotazione pubblica</p>
            <a href={linkPubblico} target="_blank" rel="noopener noreferrer" className="text-sm text-electric-blue font-mono break-all hover:underline">
              {linkPubblico}
            </a>
          </div>
        )}
      </div>

      {/* Orari settimanali */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-ink-navy">Orari settimanali</h2>
            <p className="text-xs text-ink-navy/40 mt-0.5">Lo standard per ogni giorno. Puoi comunque modificare singole giornate dal Calendario.</p>
          </div>
          <button onClick={salvaOrari} disabled={savingOrari}
            className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors shrink-0 ${savedOrari ? 'bg-green-100 text-green-700' : 'bg-electric-blue text-white hover:bg-electric-blue/90'}`}>
            {savingOrari ? 'Salvataggio...' : savedOrari ? 'Salvato' : 'Salva'}
          </button>
        </div>
        <div className="space-y-2">
          {GIORNI.map(g => (
            <div key={g} className="flex items-center gap-3">
              <span className="text-sm text-ink-navy/60 w-24 shrink-0">{GIORNI_LABEL[g]}</span>
              <input type="text" value={orari[g] ?? ''} onChange={e => setOrari(prev => ({ ...prev, [g]: e.target.value }))}
                placeholder="08:00-14:00, 16:00-18:00" className={cls} />
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-navy/35">Lascia vuoto se non lavori quel giorno. Puoi indicare più fasce separandole con una virgola.</p>
      </div>

      <div className="bg-ink-navy rounded-2xl p-5 text-white flex items-center gap-3">
        <span className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center p-2 shrink-0"><IconCheck /></span>
        <p className="text-sm text-white/70">
          Condividi il link pubblico con i tuoi pazienti (sito, WhatsApp, bio Instagram) per farli prenotare da soli.
        </p>
      </div>
    </div>
  )
}

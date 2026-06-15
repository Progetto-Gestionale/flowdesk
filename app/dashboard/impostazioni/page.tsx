'use client'

import { useEffect, useState } from 'react'

const SETTORI = [
  'Ristorazione', 'Biomedica', 'Consulenza', 'E-commerce',
  'Immobiliare', 'Fitness & Wellness', 'Avvocati & Studi legali',
  'Artigianato', 'Moda & Beauty', 'Educazione & Formazione', 'Altro',
]

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const GIORNI_LABEL: Record<string, string> = {
  lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì',
  ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica',
}

type Orari = Record<string, string>

export default function Impostazioni() {
  const [name, setName] = useState('')
  const [niche, setNiche] = useState('')
  const [nomeLocale, setNomeLocale] = useState('')
  const [descrizioneBot, setDescrizioneBot] = useState('')
  const [maxCoperti, setMaxCoperti] = useState('')
  const [publicId, setPublicId] = useState('')
  const [orari, setOrari] = useState<Orari>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingLocale, setSavingLocale] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedLocale, setSavedLocale] = useState(false)
  const [errorLocale, setErrorLocale] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/profile', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/settings', { credentials: 'include' }).then(r => r.json()),
    ]).then(([profile, settings]) => {
      if (profile.user) {
        setName(profile.user.name ?? '')
        setNiche(profile.user.niche ?? '')
      }
      setNomeLocale(settings.nomeLocale ?? '')
      setDescrizioneBot(settings.descrizioneBot ?? '')
      setMaxCoperti(settings.maxCoperti?.toString() ?? '')
      setPublicId(settings.publicId ?? '')
      try { setOrari(JSON.parse(settings.orariApertura ?? '{}')) } catch { setOrari({}) }
    }).finally(() => setLoading(false))
  }, [])

  async function handleSaveProfilo() {
    setSaving(true); setSaved(false)
    await fetch('/api/profile', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, niche }),
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleSaveLocale() {
    setSavingLocale(true); setSavedLocale(false); setErrorLocale('')
    const res = await fetch('/api/settings', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nomeLocale,
        descrizioneBot,
        maxCoperti: maxCoperti ? parseInt(maxCoperti) : null,
        publicId: publicId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
        orariApertura: JSON.stringify(orari),
      }),
    })
    const data = await res.json()
    setSavingLocale(false)
    if (!res.ok) { setErrorLocale(data.error ?? 'Errore nel salvataggio'); return }
    setSavedLocale(true)
    setTimeout(() => setSavedLocale(false), 3000)
  }

  function updateOrario(giorno: string, val: string) {
    setOrari(prev => ({ ...prev, [giorno]: val }))
  }

  const widgetUrl = publicId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/chat/${publicId}` : null

  if (loading) return <div className="text-gray-400 text-sm p-6">Caricamento...</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Impostazioni</h1>
        <p className="text-gray-500 mt-0.5">Configura il tuo account e il comportamento del bot.</p>
      </div>

      {/* Profilo */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Profilo account</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Il tuo nome</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Mario Rossi"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Settore</label>
            <select value={niche} onChange={e => setNiche(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Seleziona settore</option>
              {SETTORI.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={handleSaveProfilo} disabled={saving}
            className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Salvataggio...' : saved ? '✓ Salvato' : 'Salva profilo'}
          </button>
        </div>
      </section>

      {/* Configurazione locale */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-1">Configurazione locale</h2>
        <p className="text-xs text-gray-400 mb-4">Il bot usa queste informazioni per rispondere ai tuoi clienti.</p>
        <div className="space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome del locale</label>
              <input type="text" value={nomeLocale} onChange={e => setNomeLocale(e.target.value)}
                placeholder="Ristorante Da Mario"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max coperti</label>
              <input type="number" value={maxCoperti} onChange={e => setMaxCoperti(e.target.value)}
                placeholder="60"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione per il bot</label>
            <textarea value={descrizioneBot} onChange={e => setDescrizioneBot(e.target.value)} rows={3}
              placeholder="Siamo una trattoria tradizionale nel centro di Roma. Offriamo cucina tipica romana, con specialità come cacio e pepe e carbonara. Aperto a pranzo e cena, chiuso il lunedì."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            <p className="text-xs text-gray-400 mt-1">Il bot userà questa descrizione per presentare il locale ai clienti.</p>
          </div>

          {/* Orari */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Orari di apertura</label>
            <div className="space-y-2">
              {GIORNI.map(g => (
                <div key={g} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-24">{GIORNI_LABEL[g]}</span>
                  <input type="text" value={orari[g] ?? ''} onChange={e => updateOrario(g, e.target.value)}
                    placeholder="12:00-15:00, 19:00-23:00  oppure  chiuso"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">Formato: 12:00-15:00, 19:00-23:00 — oppure scrivi "chiuso"</p>
          </div>

          {/* Widget URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ID pubblico del bot</label>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-400 shrink-0">/chat/</span>
              <input type="text" value={publicId} onChange={e => setPublicId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="ristorante-mario"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {widgetUrl && (
              <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs text-indigo-700 font-mono truncate">{widgetUrl}</span>
                <button onClick={() => navigator.clipboard.writeText(widgetUrl)}
                  className="text-xs text-indigo-600 font-semibold shrink-0 hover:text-indigo-800">
                  Copia
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">Link pubblico del chatbot — condividilo sul sito o sui social.</p>
          </div>

          {errorLocale && <p className="text-sm text-red-500">{errorLocale}</p>}

          <button onClick={handleSaveLocale} disabled={savingLocale}
            className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {savingLocale ? 'Salvataggio...' : savedLocale ? '✓ Salvato' : 'Salva configurazione'}
          </button>
        </div>
      </section>

      {/* Integrazioni */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-1">Integrazioni</h2>
        <p className="text-xs text-gray-400 mb-4">Disponibili nella versione completa.</p>
        <div className="space-y-3">
          {[
            { name: 'WhatsApp Business', icon: '💬', desc: 'Ricevi prenotazioni direttamente dai messaggi WhatsApp' },
            { name: 'Instagram DM', icon: '📸', desc: 'Bot attivo sui DM del profilo Instagram' },
            { name: 'Google Calendar', icon: '🗓️', desc: 'Sync automatico delle prenotazioni' },
            { name: 'Google Business', icon: '📍', desc: 'Pulsante "Prenota" su Google Maps' },
            { name: 'Stripe', icon: '💳', desc: 'Acconti online per eventi e catering' },
          ].map(i => (
            <div key={i.name} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">{i.icon}</span>
                <div>
                  <span className="text-sm font-medium text-gray-700">{i.name}</span>
                  <p className="text-xs text-gray-400">{i.desc}</p>
                </div>
              </div>
              <button className="text-xs text-gray-400 font-semibold cursor-not-allowed bg-gray-100 px-3 py-1 rounded-full">
                Prossimamente
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Piano */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-2">Piano attivo</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Trial gratuito</p>
            <p className="text-sm text-gray-500">Accesso completo durante il periodo di prova</p>
          </div>
          <button className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700">
            Passa a Pro
          </button>
        </div>
      </section>
    </div>
  )
}

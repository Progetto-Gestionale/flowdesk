'use client'

import { useState } from 'react'

const CANALI = [
  { id: 'instagram', label: 'Instagram', icon: '📸' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { id: 'email', label: 'Email newsletter', icon: '📧' },
  { id: 'twitter', label: 'Thread X/Twitter', icon: '🐦' },
]

export default function ContentRepurposing() {
  const [text, setText] = useState('')
  const [channel, setChannel] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate() {
    if (!text.trim() || !channel) return
    setLoading(true)
    setResult('')
    setError('')

    try {
      const res = await fetch('/api/content/repurpose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, channel }),
      })
      const data = await res.json()
      if (data.result) setResult(data.result)
      else setError('Errore nella generazione. Riprova.')
    } catch {
      setError('Errore di connessione. Riprova.')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(result)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Content Repurposing</h1>
      <p className="text-gray-500 mb-6">Incolla un testo e l'AI lo riadatta per ogni canale.</p>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        {/* Testo originale */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Testo originale</label>
          <textarea
            rows={5}
            placeholder="Incolla qui il tuo testo, articolo o idea..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">{text.length} caratteri</p>
        </div>

        {/* Canale */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Riadatta per</label>
          <div className="flex flex-wrap gap-2">
            {CANALI.map((c) => (
              <button
                key={c.id}
                onClick={() => setChannel(c.id)}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  channel === c.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                }`}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bottone genera */}
        <button
          onClick={handleGenerate}
          disabled={!text.trim() || !channel || loading}
          className="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Generando...
            </>
          ) : (
            '✨ Genera con AI'
          )}
        </button>

        {/* Risultato */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Risultato</label>
              <button
                onClick={handleCopy}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                📋 Copia
              </button>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap">
              {result}
            </div>
          </div>
        )}

        {!result && !error && !loading && (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-4 text-sm text-gray-400 text-center">
            Il risultato apparirà qui
          </div>
        )}
      </div>
    </div>
  )
}

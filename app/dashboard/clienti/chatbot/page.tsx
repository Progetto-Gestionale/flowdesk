'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconBot } from '../../../components/icons'

export default function ChatbotPage() {
  const [publicId, setPublicId] = useState('')
  const [nomeLocale, setNomeLocale] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setPublicId(d.publicId ?? '')
        setNomeLocale(d.nomeLocale ?? '')
        setLoading(false)
      })
  }, [])

  const widgetUrl = publicId ? `${window.location.origin}/chat/${publicId}` : null
  const scriptTag = widgetUrl ? `<!-- Incolla questo script prima di </body> -->\n<script>\n  window.FlowestId = "${publicId}";\n</script>\n<script src="${window.location.origin}/widget.js" async></script>` : null

  if (loading) return <div className="text-ink-navy/35 text-sm p-6">Caricamento...</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-navy">Chatbot</h1>
        <p className="text-ink-navy/50 mt-0.5">Il tuo assistente virtuale pronto da condividere.</p>
      </div>

      {!publicId ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-amber-700 mb-1">ID pubblico non configurato</p>
          <p className="text-sm text-amber-600">Vai su <Link href="/dashboard/impostazioni" className="underline font-medium">Impostazioni</Link> e imposta un ID pubblico per attivare il chatbot.</p>
        </div>
      ) : (
        <>
          {/* Status */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center p-2.5 text-green-600"><IconBot /></div>
            <div>
              <p className="text-sm font-semibold text-green-800">{nomeLocale || 'Il tuo chatbot'} è attivo</p>
              <p className="text-xs text-green-600 mt-0.5">Pronto a ricevere prenotazioni e richieste dai tuoi clienti</p>
            </div>
            <span className="ml-auto flex items-center gap-1.5 text-xs bg-green-200 text-green-700 font-bold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
              Online
            </span>
          </div>

          {/* Link diretto */}
          <div className="bg-white border border-ink-navy/10 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-ink-navy">Link diretto</h2>
            <p className="text-sm text-ink-navy/50">Condividi questo link su WhatsApp, Instagram, Google Business o ovunque vuoi.</p>
            <div className="flex items-center gap-2 bg-electric-blue/10 border border-electric-blue/15 rounded-lg px-3 py-2.5">
              <span className="text-sm text-electric-blue font-mono flex-1 truncate">{widgetUrl}</span>
              <button onClick={() => navigator.clipboard.writeText(widgetUrl!)}
                className="text-xs text-electric-blue font-semibold shrink-0 hover:text-ink-navy bg-white px-3 py-1 rounded-md border border-electric-blue/25">
                Copia
              </button>
            </div>
            <Link href={`/chat/${publicId}`} target="_blank"
              className="inline-flex items-center gap-2 text-sm text-electric-blue font-medium hover:text-ink-navy">
              ↗ Apri chatbot in una nuova scheda
            </Link>
          </div>

          {/* Script per sito web */}
          <div className="bg-white border border-ink-navy/10 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-ink-navy">Integra sul tuo sito web</h2>
            <p className="text-sm text-ink-navy/50">Incolla questo codice nel tuo sito per mostrare il chatbot come una chat bubble.</p>
            <div className="relative">
              <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-4 overflow-x-auto font-mono leading-relaxed">
                {scriptTag}
              </pre>
              <button onClick={() => navigator.clipboard.writeText(scriptTag!)}
                className="absolute top-2 right-2 text-xs bg-gray-700 text-ink-navy/25 px-2 py-1 rounded hover:bg-gray-600">
                Copia
              </button>
            </div>
            <p className="text-xs text-ink-navy/35">Funziona su WordPress, Wix, Squarespace e qualsiasi sito web.</p>
          </div>

          {/* QR Code placeholder */}
          <div className="bg-white border border-ink-navy/10 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-ink-navy">Canali social</h2>
            <p className="text-sm text-ink-navy/50">Usa il link diretto come destinazione dei pulsanti sui tuoi profili social.</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: 'Instagram Bio', icon: '', desc: 'Link in bio o pulsante "Contatta"' },
                { name: 'WhatsApp', icon: '', desc: 'Condividi il link in chat o status' },
                { name: 'Google Maps', icon: '', desc: 'Pulsante "Prenota" sul profilo' },
              ].map(c => (
                <div key={c.name} className="bg-mist rounded-xl p-3 text-center">
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <p className="text-xs font-semibold text-ink-navy/70">{c.name}</p>
                  <p className="text-xs text-ink-navy/35 mt-0.5">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

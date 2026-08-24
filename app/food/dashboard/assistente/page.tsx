'use client'

import { useEffect, useRef, useState } from 'react'
import { IconBot, IconSend } from '@/app/components/icons'

type Msg = { role: 'user' | 'assistant'; content: string }

const SUGGERIMENTI = [
  'Quanto ho incassato ieri?',
  'Qual è il piatto più venduto questa settimana?',
  'Come aggiungo un allergene a un piatto?',
  'Quali piatti vendo di meno questo mese?',
]

export default function AssistentePage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function invia(testo: string) {
    const domanda = testo.trim()
    if (!domanda || loading) return
    const nuoviMessaggi: Msg[] = [...messages, { role: 'user', content: domanda }]
    setMessages(nuoviMessaggi)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: nuoviMessaggi }),
      })
      const data = await res.json()
      const risposta = res.ok
        ? (data.text || 'Non ho una risposta per questa domanda.')
        : `⚠️ ${data.error || 'Si è verificato un errore.'}`
      setMessages([...nuoviMessaggi, { role: 'assistant', content: risposta }])
    } catch {
      setMessages([...nuoviMessaggi, { role: 'assistant', content: '⚠️ Errore di connessione. Riprova.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      {/* Intestazione */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-ink-navy/10">
        <div className="w-9 h-9 rounded-[28%] bg-electric-blue flex items-center justify-center shrink-0 text-white">
          <span className="w-[20px] h-[20px]"><IconBot /></span>
        </div>
        <div>
          <h1 className="text-base font-extrabold text-ink-navy leading-tight">Assistente AI</h1>
          <p className="text-xs text-ink-navy/50">Fai domande sul tuo locale e sul gestionale</p>
        </div>
      </div>

      {/* Conversazione */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center pt-8">
            <div className="inline-flex w-14 h-14 rounded-[28%] bg-electric-blue/10 items-center justify-center text-electric-blue mb-4">
              <span className="w-7 h-7"><IconBot /></span>
            </div>
            <p className="text-ink-navy/70 text-sm mb-6 max-w-sm mx-auto">
              Ciao! Posso aiutarti a capire i tuoi dati e a usare Flowest. Prova a chiedermi:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGERIMENTI.map((s) => (
                <button
                  key={s}
                  onClick={() => invia(s)}
                  className="text-xs px-3 py-2 rounded-full border border-ink-navy/15 text-ink-navy/70 hover:border-electric-blue hover:text-electric-blue transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'bg-electric-blue text-white rounded-br-md'
                  : 'bg-mist text-ink-navy rounded-bl-md'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-mist text-ink-navy/50 px-4 py-3 rounded-2xl rounded-bl-md text-sm">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-navy/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-ink-navy/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-ink-navy/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 sm:px-6 py-4 border-t border-ink-navy/10">
        <form
          onSubmit={(e) => { e.preventDefault(); invia(input) }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(input) }
            }}
            rows={1}
            placeholder="Scrivi una domanda…"
            className="flex-1 resize-none rounded-xl border border-ink-navy/15 px-4 py-2.5 text-sm text-ink-navy focus:outline-none focus:border-electric-blue max-h-32"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-10 h-10 shrink-0 rounded-xl bg-electric-blue text-white flex items-center justify-center disabled:opacity-40 hover:bg-electric-blue/90 transition-colors"
            aria-label="Invia"
          >
            <span className="w-[18px] h-[18px]"><IconSend /></span>
          </button>
        </form>
        <p className="text-[10px] text-ink-navy/40 mt-2 text-center">
          L'assistente può solo dare informazioni (sola lettura). Verifica sempre i dati importanti.
        </p>
      </div>
    </div>
  )
}

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

// Memoria locale della chat (per-dispositivo): resta salvata ~24h, così uscendo
// e rientrando la conversazione non sparisce. Superato il tempo, riparte pulita.
const STORAGE_KEY = 'food:copilot-chat'
const TTL_MS = 24 * 60 * 60 * 1000

function caricaChat(): Msg[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const { ts, messages } = JSON.parse(raw)
    if (!ts || Date.now() - ts > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return []
    }
    return Array.isArray(messages) ? messages : []
  } catch {
    return []
  }
}

function salvaChat(messages: Msg[]) {
  if (typeof window === 'undefined') return
  try {
    // Teniamo al massimo gli ultimi 40 messaggi per non gonfiare lo storage.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), messages: messages.slice(-40) }))
  } catch {}
}

export default function AssistentePage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [costoEur, setCostoEur] = useState(0) // spesa del mese del locale (dal server)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idratato = useRef(false)

  // Al primo caricamento recuperiamo la conversazione salvata (se non scaduta)
  // e il totale della spesa del mese dal server (comune a tutti i dispositivi).
  useEffect(() => {
    setMessages(caricaChat())
    idratato.current = true
    fetch('/api/copilot/spesa', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (typeof d.costoEur === 'number') setCostoEur(d.costoEur) })
      .catch(() => {})
  }, [])

  // A ogni nuovo messaggio la salviamo (solo dopo l'idratazione, per non sovrascrivere).
  useEffect(() => {
    if (idratato.current && messages.length > 0) salvaChat(messages)
  }, [messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  function nuovaChat() {
    setMessages([])
    // La spesa NON si azzera: è il totale del mese del locale, non della chat.
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

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
      if (res.ok && typeof data.spesaMese?.costoEur === 'number') {
        setCostoEur(data.spesaMese.costoEur)
      }
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
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold text-ink-navy leading-tight">Assistente AI</h1>
          <p className="text-xs text-ink-navy/50">Fai domande sul tuo locale e sul gestionale</p>
        </div>
        <div
          className="text-right shrink-0 leading-tight"
          title="Spesa stimata dell'Assistente AI in questo mese, sommata su tutti i dispositivi del locale. È una stima (fatturazione reale in $ nella Console)."
        >
          <p className="font-mono text-sm font-bold text-ink-navy tabular-nums">
            €{costoEur < 0.01 && costoEur > 0 ? costoEur.toFixed(4) : costoEur.toFixed(2)}
          </p>
          <p className="text-[10px] text-ink-navy/40">spesa del mese</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={nuovaChat}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:border-electric-blue hover:text-electric-blue transition-colors shrink-0"
          >
            Nuova chat
          </button>
        )}
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

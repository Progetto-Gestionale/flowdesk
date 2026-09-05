'use client'

import { useEffect, useRef, useState } from 'react'
import { IconBot, IconSend } from '@/app/components/icons'
import CopilotaSurface from '@/app/food/dashboard/components/CopilotaSurface'

type Msg = { role: 'user' | 'assistant'; content: string }

// Suggerimenti in base a da dove sei entrato (contabilità/personale) o generici.
const SUGG: Record<string, string[]> = {
  contabilita: ['Perché mi resta così poco?', 'Quanto pesa il personale?', 'Quanto ho speso dai fornitori?'],
  personale: ['Chi ha servito più coperti?', 'Sono coperto abbastanza nel weekend?', 'Com’è cambiato l’organico dal mese scorso?'],
  default: ['Quanto ho incassato ieri?', 'Qual è il piatto più venduto?', 'Quali piatti vendo di meno questo mese?', 'Come aggiungo un allergene a un piatto?'],
}

// Memoria locale della chat (per-dispositivo): resta ~24h.
const STORAGE_KEY = 'food:copilot-chat'
const TTL_MS = 24 * 60 * 60 * 1000

function caricaChat(): Msg[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const { ts, messages } = JSON.parse(raw)
    if (!ts || Date.now() - ts > TTL_MS) { localStorage.removeItem(STORAGE_KEY); return [] }
    return Array.isArray(messages) ? messages : []
  } catch { return [] }
}
function salvaChat(messages: Msg[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), messages: messages.slice(-40) })) } catch {}
}

export default function CopilotaPage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [costoEur, setCostoEur] = useState(0)
  // Periodo/riferimento correnti della superficie: aggancia la chat a QUEI numeri
  // (contesto piccolo e coerente → domande economiche).
  const [scope, setScope] = useState<{ periodo: string; riferimento: string } | null>(null)
  // Deep-link iniziale dal tasto "Analisi AI" di Contabilità/Personale.
  const [entry, setEntry] = useState<{ periodo?: string; riferimento?: string; focus?: string }>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const idratato = useRef(false)

  useEffect(() => {
    fetch('/api/copilot/spesa', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (typeof d.costoEur === 'number') setCostoEur(d.costoEur) })
      .catch(() => {})

    // Deep-link: apri la superficie già sul periodo/scope giusto, chat fresca.
    const sp = new URLSearchParams(window.location.search)
    const scopeParam = sp.get('scope')
    if ((scopeParam === 'contabilita' || scopeParam === 'personale') && sp.get('periodo')) {
      setEntry({ periodo: sp.get('periodo') as string, riferimento: sp.get('riferimento') ?? undefined, focus: scopeParam })
      try { localStorage.removeItem(STORAGE_KEY) } catch {}
      window.history.replaceState({}, '', '/food/dashboard/assistente')
      idratato.current = true
      return
    }

    setMessages(caricaChat())
    idratato.current = true
  }, [])

  useEffect(() => { if (idratato.current && messages.length > 0) salvaChat(messages) }, [messages])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, loading])

  function nuovaChat() {
    setMessages([])
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
        // Aggancio la chat al periodo mostrato dalla superficie (numeri già visti → meno token).
        body: JSON.stringify({ messages: nuoviMessaggi, financial: scope ?? undefined }),
      })
      const data = await res.json()
      const risposta = res.ok ? (data.text || 'Non ho una risposta per questa domanda.') : `⚠️ ${data.error || 'Si è verificato un errore.'}`
      setMessages([...nuoviMessaggi, { role: 'assistant', content: risposta }])
      if (res.ok && typeof data.spesaMese?.costoEur === 'number') setCostoEur(data.spesaMese.costoEur)
    } catch {
      setMessages([...nuoviMessaggi, { role: 'assistant', content: '⚠️ Errore di connessione. Riprova.' }])
    } finally { setLoading(false) }
  }

  const suggerimenti = SUGG[entry.focus ?? 'default'] ?? SUGG.default

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      {/* Intestazione */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-ink-navy/10">
        <div className="w-9 h-9 rounded-[28%] bg-electric-blue flex items-center justify-center shrink-0 text-white">
          <span className="w-[20px] h-[20px]"><IconBot /></span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold text-ink-navy leading-tight">Copilota AI</h1>
          <p className="text-xs text-ink-navy/50">Il quadro del locale e le tue domande, in un posto solo</p>
        </div>
        <div className="text-right shrink-0 leading-tight"
          title="Spesa stimata dell'AI in questo mese (verdetti + chat), su tutti i dispositivi del locale.">
          <p className="font-mono text-sm font-bold text-ink-navy tabular-nums">
            €{costoEur < 0.01 && costoEur > 0 ? costoEur.toFixed(4) : costoEur.toFixed(2)}
          </p>
          <p className="text-[10px] text-ink-navy/40">spesa del mese</p>
        </div>
        {messages.length > 0 && (
          <button onClick={nuovaChat}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:border-electric-blue hover:text-electric-blue transition-colors shrink-0">
            Nuova chat
          </button>
        )}
      </div>

      {/* Corpo scrollabile: la superficie unica in cima, la chat sotto */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
        <div className="pt-6">
          <CopilotaSurface
            initialPeriodo={entry.periodo}
            initialRiferimento={entry.riferimento}
            focus={entry.focus}
            onSpesa={setCostoEur}
            onScope={(periodo, riferimento) => setScope({ periodo, riferimento })}
          />
        </div>

        {/* CHAT — l'approfondimento sui numeri qui sopra */}
        <div className="pt-6 mt-6 border-t border-ink-navy/10">
          {messages.length === 0 ? (
            <div className="text-center">
              <p className="text-ink-navy/70 text-sm mb-4 max-w-sm mx-auto">
                Chiedimi un approfondimento su questo periodo, o qualsiasi cosa sul tuo locale.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggerimenti.map((s) => (
                  <button key={s} onClick={() => invia(s)}
                    className="text-xs px-3 py-2 rounded-full border border-ink-navy/15 text-ink-navy/70 hover:border-electric-blue hover:text-electric-blue transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === 'user' ? 'bg-electric-blue text-white rounded-br-md' : 'bg-mist text-ink-navy rounded-bl-md'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex justify-start mt-4">
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
      </div>

      {/* Input */}
      <div className="px-4 sm:px-6 py-4 border-t border-ink-navy/10">
        {scope && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0 bg-electric-blue" />
            <p className="text-[11px] text-ink-navy/50">Le domande usano i numeri del periodo mostrato qui sopra.</p>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); invia(input) }} className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(input) } }}
            rows={1}
            placeholder="Scrivi una domanda…"
            className="flex-1 resize-none rounded-xl border border-ink-navy/15 px-4 py-2.5 text-sm text-ink-navy focus:outline-none focus:border-electric-blue max-h-32"
          />
          <button type="submit" disabled={loading || !input.trim()}
            className="w-10 h-10 shrink-0 rounded-xl bg-electric-blue text-white flex items-center justify-center disabled:opacity-40 hover:bg-electric-blue/90 transition-colors"
            aria-label="Invia">
            <span className="w-[18px] h-[18px]"><IconSend /></span>
          </button>
        </form>
        <p className="text-[10px] text-ink-navy/40 mt-2 text-center">
          L&apos;assistente può solo dare informazioni (sola lettura). Verifica sempre i dati importanti.
        </p>
      </div>
    </div>
  )
}

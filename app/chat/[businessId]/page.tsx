'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface Message { role: 'user' | 'assistant'; content: string }

export default function PublicChat() {
  const { businessId } = useParams<{ businessId: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [nomeLocale, setNomeLocale] = useState('')
  const [notFound, setNotFound] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Carica info locale (solo nome)
  useEffect(() => {
    fetch(`/api/public/info?publicId=${businessId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setNotFound(true); return }
        setNomeLocale(d.nomeLocale || '')
        // Messaggio di benvenuto automatico
        setMessages([{
          role: 'assistant',
          content: `Ciao! 👋 Sono l'assistente virtuale di ${d.nomeLocale || 'questa attività'}. Come posso aiutarti?`,
        }])
      })
  }, [businessId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, publicId: businessId }),
      })
      const data = await res.json()
      if (data.text) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.text }])
        // Se la risposta contiene conferma di ricezione, segna come done
        if (/ricontattato|ricontatteremo|confermato|ricevuto/i.test(data.text)) {
          setDone(true)
        }
      }
    } catch { /* ignora */ }
    finally { setLoading(false) }
  }

  if (notFound) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-4xl mb-4">🔍</p>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Attività non trovata</h1>
        <p className="text-gray-500 text-sm">Il link potrebbe essere errato o scaduto.</p>
      </div>
    </div>
  )

  if (messages.length === 0) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
          {nomeLocale ? nomeLocale[0].toUpperCase() : '🤖'}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{nomeLocale || 'Assistente'}</p>
          <p className="text-xs text-green-500 font-medium">● Online</p>
        </div>
      </div>

      {/* Messaggi */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
            }`}>
              {m.content.split('\n').map((line, j) => (
                <span key={j}>{line}{j < m.content.split('\n').length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {done ? (
        <div className="bg-white border-t border-gray-200 px-4 py-4 text-center">
          <p className="text-sm text-green-600 font-semibold">✅ Richiesta inviata con successo!</p>
          <p className="text-xs text-gray-400 mt-1">Sarai ricontattato a breve.</p>
        </div>
      ) : (
        <div className="bg-white border-t border-gray-200 px-3 py-3 flex gap-2 sticky bottom-0">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Scrivi un messaggio..."
            disabled={loading}
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}
            className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-2 bg-gray-50">
        <p className="text-xs text-gray-300">Powered by <span className="font-semibold">FlowDesk</span></p>
      </div>
    </div>
  )
}

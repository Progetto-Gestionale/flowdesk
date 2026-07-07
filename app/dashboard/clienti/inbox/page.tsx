'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface Messaggio {
  role: 'user' | 'assistant'
  content: string
}

interface Conversazione {
  id: string
  clienteNome?: string
  clienteEmail?: string
  canale: string
  messaggi: string
  letta: boolean
  updatedAt: string
}

interface ClienteGroup {
  email: string
  nome: string
  conversazioni: Conversazione[]
  nonLette: number
  ultimoMessaggio: string
  ultimaData: string
}

export default function Inbox() {
  const searchParams = useSearchParams()
  const [conversazioni, setConversazioni] = useState<Conversazione[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCliente, setSelectedCliente] = useState<ClienteGroup | null>(null)
  const [selezioneAttiva, setSelezioneAttiva] = useState(false)
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set())
  const [risposta, setRisposta] = useState('')
  const [invioInCorso, setInvioInCorso] = useState(false)
  const [messaggiLocali, setMessaggiLocali] = useState<Messaggio[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  async function fetchConversazioni() {
    const res = await fetch('/api/conversazioni', { credentials: 'include', cache: 'no-store' })
    const data = await res.json()
    setConversazioni(data.conversazioni ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchConversazioni()
    const interval = setInterval(fetchConversazioni, 15000)
    return () => clearInterval(interval)
  }, [])

  // Scroll al fondo quando si apre una chat o arrivano nuovi messaggi
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [selectedCliente, messaggiLocali])

  // Auto-apri chat se arriva ?apri=email dalla pipeline (eseguito dopo che i dati sono caricati)
  const emailDaAprire = searchParams.get('apri')
  useEffect(() => {
    if (!emailDaAprire || loading || selectedCliente) return
    const gruppo = Object.values(
      conversazioni.reduce<Record<string, ClienteGroup>>((acc, conv) => {
        const key = conv.clienteEmail || conv.clienteNome || conv.id
        if (!acc[key]) {
          const msgs: Messaggio[] = JSON.parse(conv.messaggi)
          acc[key] = { email: conv.clienteEmail || '', nome: conv.clienteNome || 'Visitatore anonimo', conversazioni: [], nonLette: 0, ultimoMessaggio: msgs[msgs.length - 1]?.content ?? '', ultimaData: conv.updatedAt }
        }
        acc[key].conversazioni.push(conv)
        return acc
      }, {})
    ).find(g => g.email === emailDaAprire)
    if (gruppo) handleOpenCliente(gruppo)
  }, [loading, emailDaAprire])

  async function handleOpenCliente(group: ClienteGroup) {
    if (selezioneAttiva) return
    setSelectedCliente(group)
    setRisposta('')
    setMessaggiLocali([])
    const nonLette = group.conversazioni.filter(c => !c.letta)
    await Promise.all(nonLette.map(c =>
      fetch(`/api/conversazioni/${c.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letta: true }),
      })
    ))
    if (nonLette.length > 0) {
      setConversazioni(prev => prev.map(c =>
        nonLette.find(nl => nl.id === c.id) ? { ...c, letta: true } : c
      ))
    }
  }

  async function handleInviaRisposta() {
    if (!risposta.trim() || !selectedCliente) return
    setInvioInCorso(true)
    const nuovoMsg: Messaggio = { role: 'assistant', content: risposta.trim() }
    setMessaggiLocali(prev => [...prev, nuovoMsg])
    setRisposta('')
    // Salva nella conversazione più recente del cliente
    const convRecente = [...selectedCliente.conversazioni].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0]
    if (convRecente) {
      const msgEsistenti: Messaggio[] = JSON.parse(convRecente.messaggi)
      await fetch(`/api/conversazioni/${convRecente.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaggi: JSON.stringify([...msgEsistenti, nuovoMsg]), letta: true }),
      })
    }
    setInvioInCorso(false)
  }

  async function handleDeleteGruppo(group: ClienteGroup) {
    await Promise.all(group.conversazioni.map(c =>
      fetch(`/api/conversazioni/${c.id}`, { method: 'DELETE', credentials: 'include' })
    ))
    setConversazioni(prev => prev.filter(c => !group.conversazioni.find(gc => gc.id === c.id)))
    setSelectedCliente(null)
  }

  async function handleDeleteSelezionati() {
    const chiavi = Array.from(selezionati)
    // chiavi sono email|nome dei gruppi
    const gruppiDaEliminare = listaGruppi.filter(g => chiavi.includes(g.email || `${g.nome}-anon`))
    await Promise.all(gruppiDaEliminare.flatMap(g =>
      g.conversazioni.map(c =>
        fetch(`/api/conversazioni/${c.id}`, { method: 'DELETE', credentials: 'include' })
      )
    ))
    const idsDaRimuovere = new Set(gruppiDaEliminare.flatMap(g => g.conversazioni.map(c => c.id)))
    setConversazioni(prev => prev.filter(c => !idsDaRimuovere.has(c.id)))
    setSelezionati(new Set())
    setSelezioneAttiva(false)
  }

  function toggleSeleziona(key: string) {
    setSelezionati(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  // Raggruppa per email o nome
  const gruppi = conversazioni.reduce<Record<string, ClienteGroup>>((acc, conv) => {
    const key = conv.clienteEmail || conv.clienteNome || conv.id
    if (!acc[key]) {
      const msgs: Messaggio[] = JSON.parse(conv.messaggi)
      acc[key] = {
        email: conv.clienteEmail || '',
        nome: conv.clienteNome || 'Visitatore anonimo',
        conversazioni: [],
        nonLette: 0,
        ultimoMessaggio: msgs[msgs.length - 1]?.content ?? '',
        ultimaData: conv.updatedAt,
      }
    }
    acc[key].conversazioni.push(conv)
    if (!conv.letta) acc[key].nonLette++
    if (new Date(conv.updatedAt) > new Date(acc[key].ultimaData)) {
      acc[key].ultimaData = conv.updatedAt
      const msgs: Messaggio[] = JSON.parse(conv.messaggi)
      acc[key].ultimoMessaggio = msgs[msgs.length - 1]?.content ?? ''
    }
    return acc
  }, {})

  const listaGruppi = Object.values(gruppi).sort((a, b) =>
    new Date(b.ultimaData).getTime() - new Date(a.ultimaData).getTime()
  )

  const nonLetteTotale = listaGruppi.reduce((sum, g) => sum + g.nonLette, 0)

  const messaggiCliente: Messaggio[] = selectedCliente
    ? [
        ...selectedCliente.conversazioni
          .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
          .flatMap(c => JSON.parse(c.messaggi) as Messaggio[]),
        ...messaggiLocali,
      ]
    : []

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messaggi</h1>
          <p className="text-gray-500 mt-0.5">
            {nonLetteTotale > 0
              ? <span className="text-indigo-600 font-medium">{nonLetteTotale} non letti</span>
              : 'Tutti i messaggi letti'}
          </p>
        </div>
        <div className="flex gap-2">
          {selezioneAttiva ? (
            <>
              {selezionati.size > 0 && (
                <button onClick={handleDeleteSelezionati}
                  className="text-sm bg-red-500 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors">
                  🗑️ Elimina ({selezionati.size})
                </button>
              )}
              <button onClick={() => { setSelezioneAttiva(false); setSelezionati(new Set()) }}
                className="text-sm border border-gray-300 text-gray-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50">
                Annulla
              </button>
            </>
          ) : (
            <button onClick={() => setSelezioneAttiva(true)}
              className="text-sm border border-gray-300 text-gray-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50">
              Seleziona
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Caricamento...</div>
      ) : listaGruppi.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">💬</div>
          <p className="font-medium">Nessun messaggio ancora</p>
          <p className="text-sm mt-1">I messaggi dal chatbot appariranno qui</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {listaGruppi.map((group, i) => {
            const groupKey = group.email || `${group.nome}-anon`
            const isSelezionato = selezionati.has(groupKey)
            return (
              <div key={`${group.email || group.nome}-${i}`}
                onClick={() => selezioneAttiva ? toggleSeleziona(groupKey) : handleOpenCliente(group)}
                className={`flex items-start gap-4 px-4 py-4 cursor-pointer transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${isSelezionato ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>

                {/* Checkbox selezione */}
                {selezioneAttiva && (
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-2 transition-colors ${isSelezionato ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                    {isSelezionato && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                )}

                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${group.nonLette > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                  {group.nome[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm ${group.nonLette > 0 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{group.nome}</p>
                    <p className="text-xs text-gray-400">{new Date(group.ultimaData).toLocaleDateString('it-IT')}</p>
                  </div>
                  {group.email && <p className="text-xs text-gray-400">{group.email}</p>}
                  <p className="text-sm text-gray-500 truncate mt-0.5">{group.ultimoMessaggio}</p>
                </div>
                {group.nonLette > 0 && !selezioneAttiva && (
                  <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center shrink-0 mt-1">
                    <span className="text-white text-xs font-bold">{group.nonLette}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Chat completa */}
      {selectedCliente && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden" style={{ height: '560px' }}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{selectedCliente.nome}</p>
                {selectedCliente.email && <p className="text-xs text-gray-400">{selectedCliente.email}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{selectedCliente.conversazioni.length} sessioni di chat</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleDeleteGruppo(selectedCliente)}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                  🗑️ Elimina
                </button>
                <button onClick={() => setSelectedCliente(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messaggiCliente.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Campo risposta */}
            <div className="px-4 py-3 border-t border-gray-200 bg-white">
              {selectedCliente.conversazioni[0]?.canale !== 'widget' && selectedCliente.conversazioni[0]?.canale !== 'chat' ? null : (
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    ⚠️ Canale web — il messaggio non verrà recapitato al cliente finché non integri WhatsApp/Instagram
                  </span>
                </div>
              )}
              <div className="flex gap-2 items-end">
                <textarea
                  value={risposta}
                  onChange={e => setRisposta(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleInviaRisposta() } }}
                  placeholder="Scrivi una risposta..."
                  rows={2}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <button
                  onClick={handleInviaRisposta}
                  disabled={!risposta.trim() || invioInCorso}
                  className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { IconBot, IconSend } from '@/app/components/icons'
import BriefPanel from '@/app/food/dashboard/components/BriefPanel'
import AiInsightCard from '@/app/food/dashboard/contabilita/AiInsightCard'
import type { Timeframe } from '@/lib/copilot/ai'

type Msg = { role: 'user' | 'assistant'; content: string }

// Il periodo indicato (riferimento) cade in quello CORRENTE? Serve alla card per
// sapere se auto-generare (solo "oggi") o mostrare "Genera analisi" (Fase A / P0.2).
function isCorrentePeriodo(periodo: string, rif: Date): boolean {
  const now = new Date()
  if (periodo === 'anno') return rif.getFullYear() === now.getFullYear()
  if (periodo === 'mese') return rif.getFullYear() === now.getFullYear() && rif.getMonth() === now.getMonth()
  if (periodo === 'settimana') {
    const lun = (d: Date) => { const x = new Date(d); const g = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - g); return x.getTime() }
    return lun(rif) === lun(now)
  }
  return rif.toDateString() === now.toDateString() // oggi
}

const TF_LABEL: Record<Timeframe, string> = { daily: 'oggi', weekly: 'settimana', monthly: 'mese' }

// Suggerimenti diversi se c'è un brief attivo (chiarimenti) o no (domande generiche).
const SUGGERIMENTI_BRIEF = [
  'Perché è andata così?',
  'Cosa mi conviene fare?',
  'Spiegami il margine del menu',
]
const SUGGERIMENTI_GENERICI = [
  'Quanto ho incassato ieri?',
  'Qual è il piatto più venduto questa settimana?',
  'Come aggiungo un allergene a un piatto?',
  'Quali piatti vendo di meno questo mese?',
]

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
  // Brief attivo (dal BriefPanel): guida i suggerimenti e viene passato alla chat
  // così le domande di chiarimento usano i numeri del brief senza rifare i tool.
  const [briefTf, setBriefTf] = useState<Timeframe>('daily')
  const [briefReady, setBriefReady] = useState(false)
  // Il brief resta ancorato in cima alla chat (sticky) e si può ridurre: così non
  // sparisce dopo tante domande e lo si riapre con un clic, senza scorrere all'inizio.
  const [briefAperto, setBriefAperto] = useState(true)
  // Se il titolare vuole fare domande fuori dal brief, sgancia la chat: non passa più
  // il periodo del brief → l'assistente risponde a tutto tramite i suoi strumenti.
  const [libera, setLibera] = useState(false)
  // Contesto Contabilità arrivato da "Approfondisci" (deep-link ?scope=contabilita…):
  // le domande usano i numeri di quella schermata/periodo invece del brief operativo.
  const [financial, setFinancial] = useState<{ periodo: string; riferimento: string } | null>(null)
  // Verdetto d'ingresso: arrivando dal tasto "Analisi AI" (deep-link scope+periodo)
  // atterriamo sul VERDETTO strutturato di quella schermata/periodo (card riusata),
  // non su una domanda di chat: più utile e più economico (niente giro tool-use auto).
  const [entryVerdetto, setEntryVerdetto] = useState<{ scope: string; periodo: string; riferimento: string } | null>(null)
  const agganciato = briefReady && !libera && !financial
  const scrollRef = useRef<HTMLDivElement>(null)
  const idratato = useRef(false)

  useEffect(() => {
    fetch('/api/copilot/spesa', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (typeof d.costoEur === 'number') setCostoEur(d.costoEur) })
      .catch(() => {})

    // Deep-link da "Approfondisci" nella Contabilità: apre una chat FRESCA sul periodo,
    // col contesto finanziario, e fa da sola la prima domanda.
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('scope') === 'contabilita' && sp.get('periodo')) {
      const periodo = sp.get('periodo') as string
      const riferimento = sp.get('riferimento') ?? ''
      setFinancial({ periodo, riferimento }) // scoping della chat a quei numeri
      setEntryVerdetto({ scope: 'contabilita', periodo, riferimento })
      try { localStorage.removeItem(STORAGE_KEY) } catch {}
      window.history.replaceState({}, '', '/food/dashboard/assistente') // niente re-seed al refresh
      idratato.current = true
      return
    }

    // Deep-link da "Approfondisci" sulla card Organico: atterra sul verdetto Organico,
    // chat in modalità libera (usa lo strumento coperti_per_dipendente sui dati veri).
    if (sp.get('scope') === 'personale' && sp.get('periodo')) {
      const periodo = sp.get('periodo') as string
      setLibera(true)
      setEntryVerdetto({ scope: 'personale', periodo, riferimento: sp.get('riferimento') ?? '' })
      try { localStorage.removeItem(STORAGE_KEY) } catch {}
      window.history.replaceState({}, '', '/food/dashboard/assistente')
      idratato.current = true
      return
    }

    setMessages(caricaChat())
    idratato.current = true
  }, [])

  useEffect(() => {
    if (idratato.current && messages.length > 0) salvaChat(messages)
  }, [messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const onBriefActive = useCallback((tf: Timeframe, hasBrief: boolean) => {
    setBriefTf(tf); setBriefReady(hasBrief)
  }, [])
  const onBriefSpesa = useCallback((eur: number) => setCostoEur(eur), [])

  function nuovaChat() {
    setMessages([])
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  async function invia(testo: string, finOverride?: { periodo: string; riferimento: string }) {
    const domanda = testo.trim()
    if (!domanda || loading) return
    const nuoviMessaggi: Msg[] = [...messages, { role: 'user', content: domanda }]
    setMessages(nuoviMessaggi)
    setInput('')
    setLoading(true)
    // Priorità al contesto Contabilità (da "Approfondisci"); altrimenti quello del brief.
    const fin = finOverride ?? financial
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // Contesto agganciato (numeri già visti → meno token, coerenza con la schermata):
        // financial = Contabilità, altrimenti briefTimeframe = brief operativo.
        body: JSON.stringify({
          messages: nuoviMessaggi,
          financial: fin ?? undefined,
          briefTimeframe: !fin && agganciato ? briefTf : undefined,
        }),
      })
      const data = await res.json()
      const risposta = res.ok ? (data.text || 'Non ho una risposta per questa domanda.') : `⚠️ ${data.error || 'Si è verificato un errore.'}`
      setMessages([...nuoviMessaggi, { role: 'assistant', content: risposta }])
      if (res.ok && typeof data.spesaMese?.costoEur === 'number') setCostoEur(data.spesaMese.costoEur)
    } catch {
      setMessages([...nuoviMessaggi, { role: 'assistant', content: '⚠️ Errore di connessione. Riprova.' }])
    } finally {
      setLoading(false)
    }
  }

  const suggerimenti = entryVerdetto
    ? (entryVerdetto.scope === 'personale'
        ? ['Chi ha servito più coperti?', 'Sono coperto abbastanza nel weekend?', 'Com’è cambiato l’organico dal mese scorso?']
        : ['Perché mi resta così poco?', 'Quanto pesa il personale?', 'Quanto ho speso dai fornitori?'])
    : agganciato ? SUGGERIMENTI_BRIEF : SUGGERIMENTI_GENERICI

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      {/* Intestazione unica */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-ink-navy/10">
        <div className="w-9 h-9 rounded-[28%] bg-electric-blue flex items-center justify-center shrink-0 text-white">
          <span className="w-[20px] h-[20px]"><IconBot /></span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold text-ink-navy leading-tight">Copilota AI</h1>
          <p className="text-xs text-ink-navy/50">Il brief del locale e le tue domande, nello stesso posto</p>
        </div>
        <div className="text-right shrink-0 leading-tight"
          title="Spesa stimata dell'AI in questo mese (brief + chat), su tutti i dispositivi del locale. Stima: fatturazione reale in $ nella Console.">
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

      {/* Corpo scrollabile: brief in alto, poi conversazione */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
        {entryVerdetto ? (
          /* VERDETTO D'INGRESSO — arrivi da "Analisi AI" di Contabilità/Personale:
             l'analisi strutturata di quella schermata e di quel periodo, in cima.
             La chat sotto è l'approfondimento (usa già i numeri di questo periodo). */
          <div className="pt-6 pb-1">
            <p className="font-mono text-[10px] font-semibold text-ink-navy/40 uppercase tracking-wider mb-2 px-0.5">
              {entryVerdetto.scope === 'personale' ? 'Analisi organico' : 'Analisi contabilità'}
            </p>
            <AiInsightCard
              scope={entryVerdetto.scope}
              periodo={entryVerdetto.periodo}
              riferimento={entryVerdetto.riferimento ? new Date(entryVerdetto.riferimento) : new Date()}
              corrente={isCorrentePeriodo(entryVerdetto.periodo, entryVerdetto.riferimento ? new Date(entryVerdetto.riferimento) : new Date())}
            />
          </div>
        ) : (
          /* BRIEF — ancorato in cima e comprimibile, così resta sempre a portata */
          <div className="sticky top-0 z-20 bg-white pt-6 pb-3 -mx-4 sm:-mx-6 px-4 sm:px-6">
            <div className="rounded-2xl border border-ink-navy/10 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setBriefAperto(v => !v)}
                className="w-full flex items-center gap-2 px-4 sm:px-5 py-3 text-left"
                aria-expanded={briefAperto}>
                <span className="w-4 h-4 text-electric-blue shrink-0"><IconBot /></span>
                <span className="text-sm font-semibold text-ink-navy">Brief del locale</span>
                <span className="ml-auto text-xs font-medium text-ink-navy/40">{briefAperto ? 'Riduci ▲' : 'Apri ▼'}</span>
              </button>
              <div className={briefAperto ? 'px-4 sm:px-5 pb-4 border-t border-ink-navy/8' : 'hidden'}>
                <div className="pt-4">
                  <BriefPanel embedded onActive={onBriefActive} onSpesa={onBriefSpesa} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CHAT */}
        <div className="pt-3">
          {messages.length === 0 ? (
            <div className="text-center pt-2">
              <p className="text-ink-navy/70 text-sm mb-4 max-w-sm mx-auto">
                {entryVerdetto
                  ? 'Ecco l’analisi qui sopra. Chiedimi un approfondimento: ho già i numeri di questo periodo.'
                  : agganciato
                    ? 'Fai una domanda su questo brief: ho già i numeri sotto mano.'
                    : 'Fammi una domanda sul tuo locale o su come usare Flowest.'}
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
        {financial && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0 bg-electric-blue" />
            <p className="text-[11px] text-ink-navy/50">Chat sulla <b>Contabilità</b> ({TF_LABEL[financial.periodo === 'settimana' ? 'weekly' : financial.periodo === 'oggi' ? 'daily' : 'monthly']}): le domande usano quei numeri.</p>
          </div>
        )}
        {briefReady && !financial && (
          <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-ink-navy/50 flex items-center gap-1.5 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${agganciato ? 'bg-electric-blue' : 'bg-ink-navy/25'}`} />
              {agganciato
                ? <>Chat sul brief di {TF_LABEL[briefTf]}: le domande usano quei numeri.</>
                : <>Domande libere: chiedo a tutti i dati del locale.</>}
            </p>
            <div className="inline-flex bg-mist rounded-lg p-0.5 shrink-0">
              <button onClick={() => setLibera(false)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${agganciato ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy'}`}>
                Sul brief
              </button>
              <button onClick={() => setLibera(true)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${!agganciato ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy'}`}>
                Domande libere
              </button>
            </div>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); invia(input) }} className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(input) } }}
            rows={1}
            placeholder={agganciato ? 'Chiedi un chiarimento sul brief…' : 'Scrivi una domanda…'}
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

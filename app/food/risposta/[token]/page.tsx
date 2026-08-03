'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// Cornice comune a tutti gli stati: stessa impostazione delle altre pagine pubbliche.
function Cornice({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm max-w-sm w-full p-8 text-center">
        {children}
      </div>
    </div>
  )
}

type Tono = 'blue' | 'red' | 'amber' | 'muted'
function IconaCerchio({ tono, children }: { tono: Tono; children: React.ReactNode }) {
  const toni: Record<Tono, string> = {
    blue: 'bg-electric-blue/10 text-electric-blue',
    red: 'bg-red-100 text-red-500',
    amber: 'bg-amber-100 text-amber-500',
    muted: 'bg-ink-navy/8 text-ink-navy/40',
  }
  return (
    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${toni[tono]}`}>
      {children}
    </div>
  )
}

const svgProps = { className: 'w-8 h-8', viewBox: '0 0 24 24', fill: 'none' as const, stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const IconaCheck = () => <svg {...svgProps}><path d="M20 6 9 17l-5-5" /></svg>
const IconaX = () => <svg {...svgProps}><path d="M18 6 6 18M6 6l12 12" /></svg>
const IconaLucchetto = () => <svg {...svgProps}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
const IconaAvviso = () => <svg {...svgProps}><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
const IconaCalendario = () => <svg {...svgProps}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>

function RispostaPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = params.token as string
  const azioneParam = searchParams.get('azione') as 'accetta' | 'rifiuta' | null

  const [stato, setStato] = useState<'idle' | 'loading' | 'accettato' | 'rifiutato' | 'errore' | 'usato'>('idle')
  const [messaggio, setMessaggio] = useState('')

  useEffect(() => {
    if (azioneParam) handleAzione(azioneParam)
  }, [azioneParam])

  async function handleAzione(azione: 'accetta' | 'rifiuta') {
    setStato('loading')
    try {
      const res = await fetch(`/api/public/risposta/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ azione }),
      })
      const data = await res.json()
      if (res.status === 409) { setStato('usato'); return }
      if (!res.ok) { setStato('errore'); setMessaggio(data.error ?? 'Errore'); return }
      setStato(data.azione)
    } catch {
      setStato('errore')
      setMessaggio('Errore di rete — riprova più tardi')
    }
  }

  if (stato === 'loading') {
    return (
      <Cornice>
        <div className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-ink-navy/15 border-t-electric-blue animate-spin" />
        <p className="text-gray-500 text-sm">Elaborazione in corso…</p>
      </Cornice>
    )
  }

  if (stato === 'accettato') {
    return (
      <Cornice>
        <IconaCerchio tono="blue"><IconaCheck /></IconaCerchio>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Ottimo, ci vediamo!</h1>
        <p className="text-gray-500 text-sm">La tua prenotazione è confermata.</p>
      </Cornice>
    )
  }

  if (stato === 'rifiutato') {
    return (
      <Cornice>
        <IconaCerchio tono="red"><IconaX /></IconaCerchio>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Richiesta annullata</h1>
        <p className="text-gray-500 text-sm">Hai rifiutato la proposta. Puoi contattarci direttamente per trovare un&apos;alternativa.</p>
      </Cornice>
    )
  }

  if (stato === 'usato') {
    return (
      <Cornice>
        <IconaCerchio tono="muted"><IconaLucchetto /></IconaCerchio>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Link già utilizzato</h1>
        <p className="text-gray-500 text-sm">Questo link è già stato usato in precedenza. Contattaci direttamente per assistenza.</p>
      </Cornice>
    )
  }

  if (stato === 'errore') {
    return (
      <Cornice>
        <IconaCerchio tono="amber"><IconaAvviso /></IconaCerchio>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Qualcosa è andato storto</h1>
        <p className="text-gray-500 text-sm">{messaggio || 'Link non valido o scaduto.'}</p>
      </Cornice>
    )
  }

  // stato === 'idle' (nessun param URL, mostra i pulsanti)
  return (
    <Cornice>
      <IconaCerchio tono="blue"><IconaCalendario /></IconaCerchio>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Risposta alla proposta</h1>
      <p className="text-gray-500 text-sm mb-6">Cosa vuoi fare con questa proposta?</p>
      <div className="flex gap-3">
        <button
          onClick={() => handleAzione('rifiuta')}
          className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors">
          Rifiuto
        </button>
        <button
          onClick={() => handleAzione('accetta')}
          className="flex-1 bg-electric-blue text-white font-semibold py-3 rounded-xl hover:bg-electric-blue/90 transition-colors">
          Accetto
        </button>
      </div>
    </Cornice>
  )
}

export default function Page() {
  return <Suspense><RispostaPage /></Suspense>
}

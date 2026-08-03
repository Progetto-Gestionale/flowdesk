'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Logo from '@/app/components/Logo'
import { IconCheck, IconClock, IconInfo } from '@/app/components/icons'

type Stato = 'idle' | 'loading' | 'accettato' | 'rifiutato' | 'usato' | 'errore'

const ESITO: Record<string, { titolo: string; testo: string; bg: string; fg: string }> = {
  accettato: {
    titolo: 'Appuntamento confermato',
    testo: 'Perfetto, è tutto fissato. Ti abbiamo mandato una email con il riepilogo.',
    bg: 'bg-electric-blue/10', fg: 'text-electric-blue',
  },
  rifiutato: {
    titolo: 'Richiesta annullata',
    testo: 'Nessun problema. Lo studio è stato avvisato: contattalo pure per trovare un altro orario.',
    bg: 'bg-mist', fg: 'text-ink-navy/50',
  },
  usato: {
    titolo: 'Link già utilizzato',
    testo: 'Hai già risposto a questa proposta. Per qualsiasi cosa, contatta direttamente lo studio.',
    bg: 'bg-mist', fg: 'text-ink-navy/50',
  },
  errore: {
    titolo: 'Qualcosa è andato storto',
    testo: 'Il link non è valido o è scaduto. Contatta lo studio per sistemare l\'appuntamento.',
    bg: 'bg-red-50', fg: 'text-red-500',
  },
}

function RispostaCare() {
  const { token } = useParams<{ token: string }>()
  const azioneUrl = useSearchParams().get('azione') as 'accetta' | 'rifiuta' | null

  const [stato, setStato] = useState<Stato>('idle')

  async function rispondi(azione: 'accetta' | 'rifiuta') {
    setStato('loading')
    try {
      const res = await fetch(`/api/public/care-risposta/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ azione }),
      })
      if (res.status === 409) { setStato('usato'); return }
      if (!res.ok) { setStato('errore'); return }
      const d = await res.json()
      setStato(d.azione)
    } catch {
      setStato('errore')
    }
  }

  useEffect(() => { if (azioneUrl) rispondi(azioneUrl) }, [azioneUrl])

  const esito = ESITO[stato]

  return (
    <main className="min-h-screen bg-mist">
      <header className="bg-ink-navy">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center">
          <Logo size={30} dark />
        </div>
      </header>

      <div className="max-w-md mx-auto px-6 py-16">
        <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-8 text-center">
          {stato === 'loading' && (
            <>
              <div className="w-14 h-14 rounded-full bg-mist text-ink-navy/35 flex items-center justify-center p-3.5 mx-auto mb-4">
                <IconClock />
              </div>
              <p className="text-ink-navy/50">Un attimo...</p>
            </>
          )}

          {stato === 'idle' && (
            <>
              <div className="w-14 h-14 rounded-full bg-electric-blue/10 text-electric-blue flex items-center justify-center p-3.5 mx-auto mb-4">
                <IconInfo />
              </div>
              <h1 className="text-xl font-bold text-ink-navy">Rispondi alla proposta</h1>
              <p className="text-ink-navy/50 mt-2 text-sm">
                Lo studio ti ha proposto un orario diverso. Ti va bene?
              </p>
              <div className="flex gap-3 mt-6">
                <button onClick={() => rispondi('rifiuta')}
                  className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-3 rounded-xl hover:bg-mist transition-colors">
                  Non posso
                </button>
                <button onClick={() => rispondi('accetta')}
                  className="flex-1 bg-electric-blue text-white font-semibold py-3 rounded-xl hover:bg-electric-blue/90 transition-colors">
                  Accetto
                </button>
              </div>
            </>
          )}

          {esito && (
            <>
              <div className={`w-14 h-14 rounded-full ${esito.bg} ${esito.fg} flex items-center justify-center p-3.5 mx-auto mb-4`}>
                {stato === 'accettato' ? <IconCheck /> : <IconInfo />}
              </div>
              <h1 className="text-xl font-bold text-ink-navy">{esito.titolo}</h1>
              <p className="text-ink-navy/50 mt-2 text-sm">{esito.testo}</p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default function Page() {
  return <Suspense><RispostaCare /></Suspense>
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconBot } from '@/app/components/icons'

// Ponte AI (F4): verdetto di 3 righe sulla schermata Contabilità del periodo scelto.
// I numeri li calcola il codice; qui l'AI li spiega. Cache lato server per hash-dati:
// aprire/ricaricare la pagina non richiama l'AI se i numeri non sono cambiati.

interface Insight { title: string; detail: string; evidence: string[] }
interface Action { id: string; label: string; urgency: string }
interface Brief { status: 'green' | 'yellow' | 'red'; headline: string; why: Insight[]; actions: Action[] }

const ACCENTO: Record<string, { bar: string; dot: string; testo: string }> = {
  green: { bar: 'border-l-emerald-400', dot: 'bg-emerald-500', testo: 'text-emerald-700' },
  yellow: { bar: 'border-l-amber-400', dot: 'bg-amber-500', testo: 'text-amber-700' },
  red: { bar: 'border-l-rose-400', dot: 'bg-rose-500', testo: 'text-rose-700' },
}

// href dei deep-link che l'AI può proporre (stesso set del contesto lato server).
const ACTION_HREF: Record<string, string> = {
  apri_menu: '/food/dashboard/menu',
  apri_acquisti: '/food/dashboard/contabilita/acquisti',
  apri_costi: '/food/dashboard/contabilita/costi',
  apri_impostazioni: '/food/dashboard/contabilita/impostazioni',
}

export default function AiInsightCard({ periodo, riferimento }: { periodo: string; riferimento: Date }) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    setLoading(true)
    const url = `/api/copilot/insight?scope=contabilita&periodo=${periodo}&riferimento=${riferimento.toISOString()}`
    fetch(url, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (vivo && d.brief) setBrief(d.brief as Brief) })
      .catch(() => {})
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [periodo, riferimento])

  // Link all'assistente col contesto (schermata + periodo) già caricato: "Approfondisci".
  const approfondisci = `/food/dashboard/assistente?scope=contabilita&periodo=${periodo}&riferimento=${riferimento.toISOString()}`

  const a = ACCENTO[brief?.status ?? 'yellow']

  return (
    <div className={`rounded-2xl border border-ink-navy/10 border-l-4 ${a.bar} bg-white p-5 shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-[28%] bg-electric-blue/10 text-electric-blue flex items-center justify-center shrink-0">
          <span className="w-[18px] h-[18px]"><IconBot /></span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-electric-blue">Analisi AI</span>
            {brief && <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />}
          </div>

          {loading && !brief ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3.5 bg-ink-navy/10 rounded w-3/4" />
              <div className="h-3 bg-ink-navy/5 rounded w-full" />
              <div className="h-3 bg-ink-navy/5 rounded w-5/6" />
            </div>
          ) : brief ? (
            <>
              <p className="text-sm font-semibold text-ink-navy leading-snug">{brief.headline}</p>
              {brief.why.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {brief.why.slice(0, 2).map((w, i) => (
                    <li key={i} className="text-sm text-ink-navy/70 leading-relaxed flex gap-2">
                      <span className="text-ink-navy/30 shrink-0">•</span>
                      <span><b className="font-medium text-ink-navy/80">{w.title}.</b> {w.detail}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Pulsanti: azioni proposte dall'AI (deep-link) + Approfondisci */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {brief.actions.filter((ac) => ACTION_HREF[ac.id]).slice(0, 2).map((ac) => (
                  <Link key={ac.id} href={ACTION_HREF[ac.id]}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/70 hover:border-electric-blue hover:text-electric-blue transition-colors">
                    {ac.label}
                  </Link>
                ))}
                <Link href={approfondisci}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-electric-blue/10 text-electric-blue hover:bg-electric-blue/15 transition-colors inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5"><IconBot /></span> Approfondisci con l&apos;AI
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-navy/40">Analisi non disponibile per questo periodo.</p>
          )}
        </div>
      </div>
    </div>
  )
}

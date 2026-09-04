'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconBot } from '@/app/components/icons'

// Ponte AI (F4): verdetto di 3 righe sulla schermata Contabilità del periodo scelto.
// I numeri li calcola il codice; qui l'AI li spiega. Cache lato server per hash-dati:
// aprire/ricaricare la pagina non richiama l'AI se i numeri non sono cambiati.
//
// RISPARMIO TOKEN (punto 6): il verdetto si genera in automatico SOLO per il periodo
// in corso. Per i periodi passati, se non c'è già un verdetto salvato, mostriamo un
// tasto "Genera analisi": l'AI viene chiamata solo se serve davvero.

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
  apri_staff: '/food/dashboard/staff',
  apri_impostazioni: '/food/dashboard/contabilita/impostazioni',
  apri_analitica_personale: '/food/dashboard/analytics',
  apri_analytics: '/food/dashboard/analytics',
}

export default function AiInsightCard({ periodo, riferimento, label, corrente, scope = 'contabilita' }: { periodo: string; riferimento: Date; label?: string; corrente: boolean; scope?: string }) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(true)
  // Periodo passato senza verdetto salvato: mostriamo il tasto "Genera" invece di
  // chiamare l'AI. Diventa true quando la GET risponde { generabile: true }.
  const [generabile, setGenerabile] = useState(false)

  // Carica il verdetto. `forza` = richiesta esplicita del titolare (tasto Genera):
  // aggiunge &genera=1, così la route chiama l'AI anche per un periodo passato.
  const carica = (forza: boolean) => {
    let vivo = true
    setLoading(true)
    setGenerabile(false)
    const url = `/api/copilot/insight?scope=${scope}&periodo=${periodo}&riferimento=${riferimento.toISOString()}${forza ? '&genera=1' : ''}`
    fetch(url, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return
        if (d.brief) setBrief(d.brief as Brief)
        else if (d.generabile) { setBrief(null); setGenerabile(true) }
      })
      .catch(() => {})
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }

  // La pagina rimonta la card a ogni cambio periodo (key), quindi qui basta lanciare
  // il caricamento al mount: niente reset di stato sincrono nell'effetto.
  useEffect(() => {
    return carica(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Link all'assistente col contesto (schermata + periodo) già caricato: "Approfondisci".
  const approfondisci = `/food/dashboard/assistente?scope=${scope}&periodo=${periodo}&riferimento=${riferimento.toISOString()}`

  const a = ACCENTO[brief?.status ?? 'yellow']

  return (
    <div className={`rounded-2xl border border-ink-navy/10 border-l-4 ${a.bar} bg-white p-5 shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-[28%] bg-electric-blue/10 text-electric-blue flex items-center justify-center shrink-0">
          <span className="w-[18px] h-[18px]"><IconBot /></span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-electric-blue">Analisi AI</span>
            {/* Periodo di riferimento: così è chiaro a quale periodo si riferisce il verdetto (punto 1). */}
            {label && <span className="text-[11px] font-medium text-ink-navy/40">· {label}</span>}
            {corrente && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                periodo in corso · dati parziali
              </span>
            )}
            {brief && <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />}
          </div>

          {loading && !brief ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3.5 bg-ink-navy/10 rounded w-3/4" />
              <div className="h-3 bg-ink-navy/5 rounded w-full" />
              <div className="h-3 bg-ink-navy/5 rounded w-5/6" />
            </div>
          ) : generabile ? (
            // Periodo passato senza verdetto salvato: nessuna chiamata AI finché non
            // la chiedi tu. Un clic genera (e salva) l'analisi solo per questo periodo.
            <div>
              <p className="text-sm text-ink-navy/50 leading-relaxed">
                Nessuna analisi AI salvata per questo periodo passato. Generala solo se ti serve — così non consumi token inutilmente.
              </p>
              <button
                onClick={() => carica(true)}
                className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg bg-electric-blue/10 text-electric-blue hover:bg-electric-blue/15 transition-colors inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5"><IconBot /></span> Genera analisi AI per {label ?? 'questo periodo'}
              </button>
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

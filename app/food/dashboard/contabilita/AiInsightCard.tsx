'use client'

import Link from 'next/link'
import { IconBot } from '@/app/components/icons'

// UNIFICAZIONE: l'analisi AI non vive più separata in ogni schermata. Questo è il
// PUNTO D'INGRESSO: un tasto che apre il Copilota AI già focalizzato su questa
// schermata (scope) e su questo periodo — lì trovi il verdetto, tutti i numeri e le
// domande, in un posto solo. Il verdetto si genera lì (con la disciplina costi:
// auto solo "oggi", on-demand per gli altri periodi), non qui: nessun costo ad aprire
// questa pagina. `corrente` non serve più ma resta accettato per i chiamanti.
export default function AiInsightCard({
  periodo,
  riferimento,
  label,
  scope = 'contabilita',
}: { periodo: string; riferimento: Date; label?: string; corrente?: boolean; scope?: string }) {
  const href = `/food/dashboard/assistente?scope=${scope}&periodo=${periodo}&riferimento=${riferimento.toISOString()}`
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-ink-navy/10 border-l-4 border-l-electric-blue bg-white p-4 shadow-sm hover:border-electric-blue/40 hover:shadow transition-all">
      <div className="w-9 h-9 rounded-[28%] bg-electric-blue/10 text-electric-blue flex items-center justify-center shrink-0">
        <span className="w-[18px] h-[18px]"><IconBot /></span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-navy">
          Analisi AI{label ? <span className="text-ink-navy/45 font-medium"> · {label}</span> : ''}
        </p>
        <p className="text-xs text-ink-navy/50 leading-snug mt-0.5">
          Apri il Copilota su questo periodo: verdetto, numeri e domande in un posto solo.
        </p>
      </div>
      <span className="text-electric-blue text-lg shrink-0 group-hover:translate-x-0.5 transition-transform" aria-hidden="true">→</span>
    </Link>
  )
}

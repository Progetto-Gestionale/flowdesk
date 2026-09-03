'use client'

import { useState } from 'react'

// Selettore-calendario compatto per la navigazione dei periodi (giorno/settimana/mese/anno).
// Condiviso tra Analytics e Contabilità: si apre sotto l'etichetta del periodo e permette di
// saltare rapidamente a una data passata. Non si può selezionare il futuro.
// periodo:
//   'anno'                      → griglia degli anni
//   'oggi' | 'settimana' | 'mese' → griglia dei giorni (l'evidenziazione segue il periodo scelto)

const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const GIORNI_BREVI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

export function MiniCalendario({ periodo, riferimento, onScegli, onChiudi }: {
  periodo: string; riferimento: Date; onScegli: (d: Date) => void; onChiudi: () => void
}) {
  const ora = new Date()
  const [annoNav, setAnnoNav] = useState(riferimento.getFullYear())
  const [meseNav, setMeseNav] = useState(riferimento.getMonth())

  if (periodo === 'anno') {
    const anni = Array.from({ length: 6 }, (_, i) => ora.getFullYear() - 5 + i)
    return (
      <div className="absolute right-0 top-full mt-1 bg-white border border-ink-navy/10 rounded-2xl shadow-xl z-50 p-4 w-56">
        <p className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide mb-3">Seleziona anno</p>
        <div className="grid grid-cols-3 gap-1.5">
          {anni.map(a => (
            <button key={a} onClick={() => { onScegli(new Date(a, 6, 1)); onChiudi() }}
              className={`rounded-xl py-2 text-sm font-medium transition-colors ${a === riferimento.getFullYear() ? 'bg-electric-blue text-white' : a > ora.getFullYear() ? 'text-ink-navy/25 cursor-not-allowed' : 'hover:bg-electric-blue/10 text-ink-navy/70'}`}
              disabled={a > ora.getFullYear()}>{a}</button>
          ))}
        </div>
      </div>
    )
  }

  const primoGiorno = new Date(annoNav, meseNav, 1).getDay()
  const giorniMese = new Date(annoNav, meseNav + 1, 0).getDate()
  const offset = primoGiorno === 0 ? 6 : primoGiorno - 1

  function selGiorno(giorno: number) {
    const d = new Date(annoNav, meseNav, giorno)
    if (d > ora) return
    onScegli(d); onChiudi()
  }

  // Un giorno è "attivo" (evidenziato) se cade nel periodo attualmente selezionato.
  function giornoAttivo(d: Date): boolean {
    if (periodo === 'mese') return d.getFullYear() === riferimento.getFullYear() && d.getMonth() === riferimento.getMonth()
    if (periodo === 'settimana') {
      const lun = new Date(riferimento)
      lun.setDate(riferimento.getDate() - ((riferimento.getDay() + 6) % 7))
      const dom = new Date(lun); dom.setDate(lun.getDate() + 6)
      return d >= lun && d <= dom
    }
    // 'oggi' (o giorno singolo): stesso giorno del riferimento
    return d.toDateString() === riferimento.toDateString()
  }

  return (
    <div className="absolute right-0 top-full mt-1 bg-white border border-ink-navy/10 rounded-2xl shadow-xl z-50 p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => { if (meseNav === 0) { setMeseNav(11); setAnnoNav(a => a - 1) } else setMeseNav(m => m - 1) }}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-lg">‹</button>
        <span className="text-sm font-semibold text-ink-navy">{MESI_BREVI[meseNav]} {annoNav}</span>
        <button onClick={() => { if (annoNav > ora.getFullYear() || (annoNav === ora.getFullYear() && meseNav >= ora.getMonth())) return; if (meseNav === 11) { setMeseNav(0); setAnnoNav(a => a + 1) } else setMeseNav(m => m + 1) }}
          disabled={annoNav === ora.getFullYear() && meseNav >= ora.getMonth()}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-lg disabled:opacity-30">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {GIORNI_BREVI.map((g, i) => <div key={i} className="text-center text-[10px] font-semibold text-ink-navy/35">{g}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: giorniMese }).map((_, i) => {
          const giorno = i + 1
          const d = new Date(annoNav, meseNav, giorno)
          const futuro = d > ora
          const attivo = giornoAttivo(d)
          return (
            <button key={giorno} onClick={() => selGiorno(giorno)} disabled={futuro}
              className={`rounded-lg py-1 text-xs font-medium transition-colors ${futuro ? 'text-gray-200 cursor-not-allowed' : attivo ? 'bg-electric-blue text-white' : 'hover:bg-electric-blue/10 text-ink-navy/70'}`}>
              {giorno}
            </button>
          )
        })}
      </div>
    </div>
  )
}

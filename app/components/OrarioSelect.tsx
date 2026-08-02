'use client'
import { useMemo } from 'react'

// Selettore orario in DUE tendine separate: prima l'ora, poi i minuti (a blocchi di `step`, default 15).
// Sostituisce l'unica tendina con tutte le combinazioni. Interfaccia invariata: `value`/`onChange`
// lavorano sempre con una stringa "HH:MM".
// - min/max: limitano gli orari selezionabili (stringhe "HH:MM").
// - se il valore corrente non è allineato ai passi (dato vecchio) viene comunque mostrato.
export default function OrarioSelect({
  value,
  onChange,
  className,
  min,
  max,
  step = 15,
  required,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  min?: string
  max?: string
  step?: number
  required?: boolean
  disabled?: boolean
}) {
  const pad = (n: number) => String(n).padStart(2, '0')

  const [oraCorr, minCorr] = value && value.includes(':') ? value.split(':') : ['', '']

  const minH = min ? Number(min.split(':')[0]) : 0
  const minM = min ? Number(min.split(':')[1]) : 0
  const maxH = max ? Number(max.split(':')[0]) : 23
  const maxM = max ? Number(max.split(':')[1]) : 59

  // Ore disponibili nel range [min, max]
  const ore = useMemo(() => {
    const out: string[] = []
    for (let h = minH; h <= maxH; h++) out.push(pad(h))
    return out
  }, [minH, maxH])

  // Minuti disponibili per l'ora attualmente scelta (rispettando min/max sulle ore di confine)
  const minuti = useMemo(() => {
    const h = oraCorr === '' ? null : Number(oraCorr)
    const out: string[] = []
    for (let m = 0; m < 60; m += step) {
      if (h !== null && h === minH && m < minM) continue
      if (h !== null && h === maxH && m > maxM) continue
      out.push(pad(m))
    }
    return out
  }, [oraCorr, step, minH, minM, maxH, maxM])

  // Mantieni selezionabile un eventuale valore corrente non allineato ai passi/ore filtrate.
  const oreFinali = oraCorr && !ore.includes(oraCorr) ? [oraCorr, ...ore] : ore
  const minutiFinali = minCorr && !minuti.includes(minCorr) ? [minCorr, ...minuti] : minuti

  function cambiaOra(h: string) {
    if (!h) { onChange(''); return }
    // Selezionata l'ora: se i minuti non sono ancora impostati, default "00".
    onChange(`${h}:${minCorr || '00'}`)
  }

  function cambiaMinuti(m: string) {
    onChange(`${oraCorr || '00'}:${m}`)
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={oraCorr}
        required={required}
        disabled={disabled}
        onChange={e => cambiaOra(e.target.value)}
        aria-label="Ora"
        className={`${className ?? ''} flex-1 min-w-0`}
      >
        <option value="">Ora</option>
        {oreFinali.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <span className="text-ink-navy/40 font-semibold">:</span>
      <select
        value={minCorr}
        required={required}
        disabled={disabled || !oraCorr}
        onChange={e => cambiaMinuti(e.target.value)}
        aria-label="Minuti"
        className={`${className ?? ''} flex-1 min-w-0`}
      >
        <option value="">Min</option>
        {minutiFinali.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  )
}

'use client'
import { useMemo } from 'react'

// Selettore orario a passi di 15 minuti (menu a tendina), al posto del <input type="time">
// nativo, così l'utente può scegliere SOLO orari a intervalli di 15 min (00, 15, 30, 45).
// - min/max: limitano gli orari selezionabili (stringhe "HH:MM").
// - se il valore corrente non è un multiplo di 15 (dato vecchio) viene comunque mostrato.
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
  const opzioni = useMemo(() => {
    const out: string[] = []
    for (let m = 0; m < 24 * 60; m += step) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    }
    return out
  }, [step])

  const filtrate = opzioni.filter(o => (!min || o >= min) && (!max || o <= max))
  // Mantieni selezionabile un eventuale valore corrente non allineato ai 15 min.
  const finali = value && !filtrate.includes(value) ? [value, ...filtrate] : filtrate

  return (
    <select
      value={value}
      required={required}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={className}
    >
      <option value="">--:--</option>
      {finali.map(o => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  )
}

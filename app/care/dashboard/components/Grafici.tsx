'use client'

// Grafici di Analytics disegnati a mano, come già fa Flowest Food.
// Recharts 3.9 in questo progetto non renderizza né le etichette dei valori
// (LabelList) né i settori della torta: qui il controllo è totale e i numeri
// si vedono sempre, senza doverci passare sopra col mouse.

export interface Barra {
  etichetta: string
  valore: number
}

/** Barre verticali con il valore scritto sopra ciascuna. */
export function GraficoBarre({ dati, altezza = 220 }: { dati: Barra[]; altezza?: number }) {
  const massimo = Math.max(...dati.map(d => d.valore), 1)

  return (
    <div className="flex items-end gap-2" style={{ height: altezza }}>
      {dati.map((d, i) => {
        // Le barre a zero restano visibili come traccia, senza numero sopra
        const percentuale = (d.valore / massimo) * 100
        return (
          <div key={i} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1">
            <span className={`text-xs font-bold ${d.valore > 0 ? 'text-ink-navy' : 'text-transparent'}`}>
              {d.valore}
            </span>
            <div className="w-full flex-1 flex items-end">
              <div
                className={`w-full rounded-t-md transition-all ${d.valore > 0 ? 'bg-electric-blue' : 'bg-ink-navy/5'}`}
                style={{ height: d.valore > 0 ? `${Math.max(2, percentuale)}%` : 2 }}
                title={`${d.etichetta}: ${d.valore}`}
              />
            </div>
            <span className="text-[10px] text-ink-navy/45 truncate max-w-full" title={d.etichetta}>
              {d.etichetta}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export interface Fetta {
  nome: string
  valore: number
  colore: string
}

/** Ciambella in SVG: un arco per fetta, disegnato con stroke-dasharray. */
export function Ciambella({ fette, dimensione = 170 }: { fette: Fetta[]; dimensione?: number }) {
  const totale = fette.reduce((t, f) => t + f.valore, 0)
  const spessore = dimensione * 0.18
  const raggio = (dimensione - spessore) / 2
  const circonferenza = 2 * Math.PI * raggio
  let percorso = 0

  if (totale === 0) {
    return (
      <svg width={dimensione} height={dimensione} className="shrink-0">
        <circle cx={dimensione / 2} cy={dimensione / 2} r={raggio}
          fill="none" stroke="#0B15330D" strokeWidth={spessore} />
      </svg>
    )
  }

  return (
    <svg width={dimensione} height={dimensione} className="shrink-0"
      viewBox={`0 0 ${dimensione} ${dimensione}`}>
      {/* -90° porta l'inizio in cima invece che a ore 3 */}
      <g transform={`rotate(-90 ${dimensione / 2} ${dimensione / 2})`}>
        {fette.filter(f => f.valore > 0).map((f, i) => {
          const quota = (f.valore / totale) * circonferenza
          const offset = percorso
          percorso += quota
          return (
            <circle key={i}
              cx={dimensione / 2} cy={dimensione / 2} r={raggio}
              fill="none" stroke={f.colore} strokeWidth={spessore}
              strokeDasharray={`${quota} ${circonferenza - quota}`}
              strokeDashoffset={-offset}>
              <title>{`${f.nome}: ${f.valore} (${Math.round(f.valore / totale * 100)}%)`}</title>
            </circle>
          )
        })}
      </g>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        className="fill-ink-navy" style={{ fontSize: dimensione * 0.2, fontWeight: 800 }}>
        {totale}
      </text>
    </svg>
  )
}

/** Riga della legenda: pallino, nome, valore, percentuale ed eventuale importo. */
export function VoceLegenda({ nome, valore, percentuale, colore, importo }: {
  nome: string; valore: number; percentuale: number; colore: string; importo?: number
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colore }} />
      <span className="text-sm text-ink-navy/60 flex-1 truncate">{nome}</span>
      <span className="text-lg font-extrabold text-ink-navy">{valore}</span>
      <span className="text-xs text-ink-navy/35 w-10 text-right">{percentuale}%</span>
      {importo !== undefined && (
        <span className="text-sm font-semibold text-ink-navy/50 w-16 text-right">€{importo.toFixed(0)}</span>
      )}
    </div>
  )
}

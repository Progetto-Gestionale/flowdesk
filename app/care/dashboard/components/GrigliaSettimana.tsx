'use client'

import { IconClock } from '@/app/components/icons'
import { STATUS_STYLE, type AppuntamentoBase } from './statiAppuntamento'

const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const ALTEZZA_ORA = 56 // px per ogni fascia da un'ora

export interface OrarioGiorno {
  testo: string          // "09:00-13:00, 15:00-18:00" oppure "Chiuso"
  personalizzato: boolean // true se quel giorno ha un orario diverso dallo standard
}

function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}

/** "09:00-13:00, 15:00-18:00" → [[540,780],[900,1080]] in minuti. */
export function fasceDaTesto(testo: string): [number, number][] {
  if (!testo || testo === 'Chiuso') return []
  return testo.split(',').map(s => s.trim()).filter(Boolean).map(r => {
    const [a, b] = r.split('-').map(x => x.trim())
    const [h1, m1] = a.split(':').map(Number)
    const [h2, m2] = b.split(':').map(Number)
    return [h1 * 60 + m1, h2 * 60 + m2] as [number, number]
  }).filter(([a, b]) => !isNaN(a) && !isNaN(b) && b > a)
}

/**
 * Settimana come griglia oraria: le ore in verticale a sinistra, i giorni in
 * orizzontale in alto, gli appuntamenti posizionati sul loro orario reale.
 * Cliccando una cella vuota si crea un appuntamento a quell'ora.
 */
export default function GrigliaSettimana({
  giorni, oggi, appuntamentiDi, orarioDi, onNuovo, onApri, onOrari,
}: {
  giorni: Date[]
  oggi: Date
  appuntamentiDi: (giorno: Date) => AppuntamentoBase[]
  orarioDi: (giorno: Date) => OrarioGiorno
  onNuovo: (giorno: Date, ora: number) => void
  onApri: (app: AppuntamentoBase) => void
  onOrari: (giorno: Date) => void
}) {
  // Ore mostrate: quelle di apertura della settimana, allargate se un
  // appuntamento cade fuori — così non sparisce mai dalla griglia.
  const [oraInizio, oraFine] = (() => {
    let min = 24 * 60, max = 0
    for (const giorno of giorni) {
      for (const [a, b] of fasceDaTesto(orarioDi(giorno).testo)) {
        min = Math.min(min, a); max = Math.max(max, b)
      }
      for (const app of appuntamentiDi(giorno)) {
        const d = new Date(app.data)
        const inizio = d.getHours() * 60 + d.getMinutes()
        min = Math.min(min, inizio)
        max = Math.max(max, inizio + app.durata)
      }
    }
    if (min >= max) return [8, 20] // studio senza orari e senza appuntamenti
    return [Math.floor(min / 60), Math.ceil(max / 60)]
  })()

  const ore = Array.from({ length: Math.max(1, oraFine - oraInizio) }, (_, i) => oraInizio + i)
  const colonne = `56px repeat(7, minmax(0, 1fr))`

  const minutiOra = oggi.getHours() * 60 + oggi.getMinutes()
  const mostraLineaOra = giorni.some(d => isSameDay(d, oggi))
    && minutiOra >= oraInizio * 60 && minutiOra <= oraFine * 60

  return (
    <div className="bg-white rounded-2xl border border-ink-navy/10 overflow-hidden">
      {/* Intestazione: i giorni, allineati alle colonne sotto */}
      <div className="grid border-b border-ink-navy/8" style={{ gridTemplateColumns: colonne }}>
        <div />
        {giorni.map((giorno, i) => {
          const isOggi = isSameDay(giorno, oggi)
          const orario = orarioDi(giorno)
          return (
            <div key={i} className={`border-l border-ink-navy/8 px-1 py-2 text-center ${isOggi ? 'bg-electric-blue/5' : ''}`}>
              <p className="text-[10px] font-semibold text-ink-navy/35 uppercase tracking-wider">{GIORNI_BREVI[i]}</p>
              <p className={`text-lg font-bold leading-tight ${isOggi ? 'text-electric-blue' : 'text-ink-navy'}`}>{giorno.getDate()}</p>
              <button onClick={() => onOrari(giorno)} title={orario.testo}
                className={`mt-0.5 inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${orario.personalizzato ? 'bg-zest-lime/25 text-ink-navy' : 'text-ink-navy/30 hover:text-electric-blue'}`}>
                <span className="w-2.5 h-2.5"><IconClock /></span>
                {orario.testo === 'Chiuso' ? 'Chiuso' : 'Orari'}
              </button>
            </div>
          )
        })}
      </div>

      {/* pt-3: l'etichetta della prima ora sporge sopra la sua riga, senza
          questo spazio verrebbe tagliata dal bordo dell'area scrollabile */}
      <div className="overflow-y-auto pt-3" style={{ maxHeight: '62vh' }}>
        <div className="grid relative" style={{ gridTemplateColumns: colonne }}>

          {/* Ore, in verticale */}
          <div>
            {ore.map(h => (
              <div key={h} style={{ height: ALTEZZA_ORA }} className="relative border-b border-ink-navy/5">
                <span className="absolute -top-2 right-2 text-[10px] font-medium text-ink-navy/35 bg-white px-1">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {giorni.map((giorno, i) => {
            const isOggi = isSameDay(giorno, oggi)
            const fasce = fasceDaTesto(orarioDi(giorno).testo)
            return (
              <div key={i} className={`relative border-l border-ink-navy/8 ${isOggi ? 'bg-electric-blue/[0.03]' : ''}`}>
                {/* Sfondo: fuori orario in grigio, così si vede quando è chiuso */}
                {ore.map(h => {
                  const aperto = fasce.some(([a, b]) => h * 60 < b && (h + 1) * 60 > a)
                  return (
                    <button key={h} onClick={() => onNuovo(giorno, h)}
                      title={`Nuovo appuntamento — ${giorno.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} alle ${String(h).padStart(2, '0')}:00`}
                      style={{ height: ALTEZZA_ORA }}
                      className={`w-full border-b border-ink-navy/5 transition-colors hover:bg-electric-blue/10 ${aperto ? '' : 'bg-mist/60'}`} />
                  )
                })}

                {/* Appuntamenti, posizionati sull'orario reale */}
                {appuntamentiDi(giorno).map(a => {
                  const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.confermato
                  const d = new Date(a.data)
                  const inizio = d.getHours() * 60 + d.getMinutes()
                  const top = ((inizio - oraInizio * 60) / 60) * ALTEZZA_ORA
                  const altezza = Math.max(22, (a.durata / 60) * ALTEZZA_ORA - 2)
                  const compatto = altezza < 42
                  return (
                    <button key={a.id} onClick={() => onApri(a)}
                      style={{ position: 'absolute', top, height: altezza, left: 3, right: 3 }}
                      className={`text-left rounded-lg px-1.5 py-1 overflow-hidden shadow-sm transition-opacity hover:opacity-80 ${st.bg} ${st.text}`}>
                      <p className={`font-bold leading-tight ${compatto ? 'text-[10px] truncate' : 'text-[11px]'}`}>
                        {d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        {compatto && <span className="font-semibold"> · {a.clienteNome || 'Paziente'}</span>}
                      </p>
                      {!compatto && (
                        <p className="text-[11px] font-semibold leading-tight truncate">{a.clienteNome || 'Paziente'}</p>
                      )}
                      {!compatto && a.servizio && altezza > 60 && (
                        <p className="text-[10px] leading-tight truncate opacity-70">{a.servizio}</p>
                      )}
                    </button>
                  )
                })}

                {/* Dove siamo adesso */}
                {isOggi && mostraLineaOra && (
                  <div className="absolute left-0 right-0 pointer-events-none z-10"
                    style={{ top: ((minutiOra - oraInizio * 60) / 60) * ALTEZZA_ORA }}>
                    <div className="h-px bg-red-500" />
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 -mt-[3px] -ml-[3px]" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconChartBar } from '@/app/components/icons'
import { GraficoBarre, Ciambella, VoceLegenda } from '../components/Grafici'

const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const GIORNI_BREVI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

// Colori della torta: il blu del brand più tinte ben distinguibili fra loro
const COLORI = ['#1F52FF', '#0B1533', '#7C9CFF', '#D6FB3D', '#F59E0B', '#10B981', '#E11D48']

interface Dati {
  seduteCompletate: number
  noShow: number
  tassoNoShow: number
  pazientiNuovi: number
  pazientiDiRitorno: number
  incassoTotale: number
  spesaMediaPaziente: number
  pazientiDistinti: number
  raggruppa: 'giorno' | 'settimana' | 'mese'
  perGiorno: { giorno: string; sedute: number; incasso: number }[]
  perTipo: { nome: string; sedute: number; incasso: number }[]
}

const p2 = (n: number) => String(n).padStart(2, '0')
function chiave(d: Date) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
/** Lunedì della settimana che contiene `d`. */
function lunedi(d: Date) {
  const r = new Date(d)
  const dow = r.getDay()
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1))
  r.setHours(0, 0, 0, 0)
  return r
}

type Periodo = 'settimana' | 'mese' | 'anno'

/** Sposta la data di riferimento avanti o indietro di un periodo. */
function spostaRiferimento(rif: Date, periodo: Periodo, direzione: 1 | -1): Date {
  const d = new Date(rif)
  if (periodo === 'settimana') d.setDate(d.getDate() + direzione * 7)
  else if (periodo === 'mese') d.setMonth(d.getMonth() + direzione)
  else d.setFullYear(d.getFullYear() + direzione)
  return d
}

// Stesso mini calendario di Analytics Food: mesi navigabili, niente futuro.
function MiniCalendario({ periodo, riferimento, onScegli, onChiudi }: {
  periodo: Periodo; riferimento: Date; onScegli: (d: Date) => void; onChiudi: () => void
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
            <button key={a} onClick={() => { onScegli(new Date(a, 6, 1)); onChiudi() }} disabled={a > ora.getFullYear()}
              className={`rounded-xl py-2 text-sm font-medium transition-colors ${a === riferimento.getFullYear() ? 'bg-electric-blue text-white' : a > ora.getFullYear() ? 'text-ink-navy/25 cursor-not-allowed' : 'hover:bg-electric-blue/10 text-ink-navy/70'}`}>
              {a}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const primoGiorno = new Date(annoNav, meseNav, 1).getDay()
  const giorniMese = new Date(annoNav, meseNav + 1, 0).getDate()
  const offset = primoGiorno === 0 ? 6 : primoGiorno - 1

  return (
    <div className="absolute right-0 top-full mt-1 bg-white border border-ink-navy/10 rounded-2xl shadow-xl z-50 p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => { if (meseNav === 0) { setMeseNav(11); setAnnoNav(a => a - 1) } else setMeseNav(m => m - 1) }}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-lg">‹</button>
        <span className="text-sm font-semibold text-ink-navy">{MESI_BREVI[meseNav]} {annoNav}</span>
        <button onClick={() => { if (meseNav === 11) { setMeseNav(0); setAnnoNav(a => a + 1) } else setMeseNav(m => m + 1) }}
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
          const attivo = periodo === 'mese'
            ? d.getFullYear() === riferimento.getFullYear() && d.getMonth() === riferimento.getMonth()
            : (() => {
                const lun = lunedi(riferimento)
                const dom = new Date(lun); dom.setDate(lun.getDate() + 6)
                return d >= lun && d <= dom
              })()
          return (
            <button key={giorno} onClick={() => { if (!futuro) { onScegli(d); onChiudi() } }} disabled={futuro}
              className={`rounded-lg py-1 text-xs font-medium transition-colors ${futuro ? 'text-ink-navy/15 cursor-not-allowed' : attivo ? 'bg-electric-blue text-white' : 'hover:bg-electric-blue/10 text-ink-navy/70'}`}>
              {giorno}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function CareAnalyticsPage() {
  const [dati, setDati] = useState<Dati | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('settimana')
  const [riferimento, setRiferimento] = useState<Date>(() => new Date())
  const [calendarioAperto, setCalendarioAperto] = useState(false)

  // Estremi del periodo attorno alla data di riferimento
  const intervallo = useMemo(() => {
    if (periodo === 'settimana') {
      const l = lunedi(riferimento)
      return { da: chiave(l), a: chiave(new Date(l.getFullYear(), l.getMonth(), l.getDate() + 6)) }
    }
    if (periodo === 'mese') {
      return {
        da: chiave(new Date(riferimento.getFullYear(), riferimento.getMonth(), 1)),
        a: chiave(new Date(riferimento.getFullYear(), riferimento.getMonth() + 1, 0)),
      }
    }
    return {
      da: chiave(new Date(riferimento.getFullYear(), 0, 1)),
      a: chiave(new Date(riferimento.getFullYear(), 11, 31)),
    }
  }, [periodo, riferimento])

  const etichettaPeriodo = useMemo(() => {
    if (periodo === 'anno') return String(riferimento.getFullYear())
    if (periodo === 'mese') return riferimento.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    const l = lunedi(riferimento)
    const d = new Date(l); d.setDate(l.getDate() + 6)
    return `${l.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} – ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`
  }, [periodo, riferimento])

  // Il periodo successivo è nel futuro? Allora la freccia avanti si spegne
  const avantiBloccato = useMemo(() => {
    const prossimo = spostaRiferimento(riferimento, periodo, 1)
    const ora = new Date()
    if (periodo === 'anno') return prossimo.getFullYear() > ora.getFullYear()
    if (periodo === 'mese') return new Date(prossimo.getFullYear(), prossimo.getMonth(), 1) > ora
    return lunedi(prossimo) > ora
  }, [periodo, riferimento])

  useEffect(() => {
    setLoading(true)
    const raggruppa = periodo === 'settimana' ? 'giorno' : periodo === 'mese' ? 'settimana' : 'mese'
    fetch(`/api/care/analytics?da=${intervallo.da}&a=${intervallo.a}&raggruppa=${raggruppa}`, { credentials: 'include', cache: 'no-store' })
      .then(r => r.json())
      .then(d => setDati(d.error ? null : d))
      .catch(() => setDati(null))
      .finally(() => setLoading(false))
  }, [intervallo.da, intervallo.a, periodo])

  const barre = (dati?.perGiorno ?? []).map(g => {
    if (dati?.raggruppa === 'mese') {
      // "2026-08" → "Ago"
      return { ...g, etichetta: MESI_BREVI[Number(g.giorno.slice(5, 7)) - 1] ?? g.giorno }
    }
    if (dati?.raggruppa === 'settimana') {
      // "2026-08#2" → "15–21", con l'ultima settimana che arriva a fine mese
      const [aaaaMm, idx] = g.giorno.split('#')
      const i = Number(idx)
      const [aa, mm] = aaaaMm.split('-').map(Number)
      const giorniMese = new Date(aa, mm, 0).getDate()
      const primo = i * 7 + 1
      const ultimo = i === 4 ? giorniMese : Math.min(primo + 6, giorniMese)
      return { ...g, etichetta: `${primo}–${ultimo}` }
    }
    const d = new Date(`${g.giorno}T12:00:00`)
    return { ...g, etichetta: d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) }
  })

  const titoloBarre = dati?.raggruppa === 'mese' ? 'Sedute per mese'
    : dati?.raggruppa === 'settimana' ? 'Sedute per settimana'
    : 'Sedute per giorno'

  const kpi = [
    { label: 'Sedute completate', valore: dati ? String(dati.seduteCompletate) : '—', nota: null as string | null },
    { label: 'Incasso totale', valore: dati ? `€${dati.incassoTotale.toFixed(0)}` : '—', nota: null },
    { label: 'Spesa media per paziente', valore: dati ? `€${dati.spesaMediaPaziente.toFixed(0)}` : '—', nota: null },
    {
      label: 'Tasso di no-show',
      valore: dati ? `${dati.tassoNoShow.toFixed(0)}%` : '—',
      nota: dati ? `${dati.noShow} su ${dati.seduteCompletate + dati.noShow} previste` : null,
    },
  ]

  // Nuovi = pazienti che non avevano mai fatto una seduta prima di questo periodo
  const pazientiTorta = dati
    ? [
        { nome: 'Nuovi', valore: dati.pazientiNuovi },
        { nome: 'Di ritorno', valore: dati.pazientiDiRitorno },
      ].filter(x => x.valore > 0)
    : []

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Analytics</h1>
          <p className="text-ink-navy/50 mt-0.5 capitalize">{etichettaPeriodo}</p>
        </div>

        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex rounded-xl border border-ink-navy/10 bg-white overflow-hidden shadow-sm text-sm font-medium">
            {(['settimana', 'mese', 'anno'] as const).map(p => (
              <button key={p} onClick={() => { setPeriodo(p); setRiferimento(new Date()) }}
                className={`px-4 py-2 transition-colors ${periodo === p ? 'bg-electric-blue text-white' : 'text-ink-navy/50 hover:bg-mist'}`}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 relative">
            <button onClick={() => setRiferimento(r => spostaRiferimento(r, periodo, -1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 bg-white text-ink-navy/50 hover:bg-mist transition-colors text-lg">‹</button>
            <button onClick={() => setCalendarioAperto(v => !v)}
              className="text-sm font-medium text-ink-navy/70 min-w-[180px] text-center px-3 py-1.5 rounded-lg border border-ink-navy/10 bg-white hover:bg-mist transition-colors capitalize">
              {etichettaPeriodo}
            </button>
            {calendarioAperto && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCalendarioAperto(false)} />
                <MiniCalendario periodo={periodo} riferimento={riferimento}
                  onScegli={d => setRiferimento(d)} onChiudi={() => setCalendarioAperto(false)} />
              </>
            )}
            <button onClick={() => setRiferimento(r => spostaRiferimento(r, periodo, 1))} disabled={avantiBloccato}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 bg-white text-ink-navy/50 hover:bg-mist transition-colors text-lg disabled:opacity-30">›</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpi.map(k => (
          <div key={k.label} className="bg-white border border-ink-navy/10 rounded-2xl p-5">
            <div className="text-3xl font-extrabold text-ink-navy">{k.valore}</div>
            <div className="text-sm text-ink-navy/50 mt-0.5">{k.label}</div>
            {k.nota && <div className="text-xs text-ink-navy/35 mt-0.5">{k.nota}</div>}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : !dati || dati.seduteCompletate === 0 ? (
        <div className="bg-white border border-dashed border-ink-navy/15 rounded-2xl p-12 text-center text-ink-navy/35">
          <div className="w-11 h-11 rounded-xl bg-mist flex items-center justify-center p-2.5 mx-auto mb-4">
            <IconChartBar />
          </div>
          <p className="font-medium">Nessuna seduta completata in questo periodo</p>
          <p className="text-sm mt-1">I numeri arrivano quando segni gli appuntamenti come completati</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white border border-ink-navy/10 rounded-2xl p-5">
            <h2 className="font-bold text-ink-navy mb-4">{titoloBarre}</h2>
            <GraficoBarre dati={barre.map(b => ({ etichetta: b.etichetta, valore: b.sedute }))} />
          </div>

          <div className="bg-white border border-ink-navy/10 rounded-2xl p-5">
            <h2 className="font-bold text-ink-navy mb-4">Pazienti</h2>
            <div className="flex items-center gap-5">
              <Ciambella dimensione={150} fette={[
                { nome: 'Nuovi', valore: dati.pazientiNuovi, colore: '#D6FB3D' },
                { nome: 'Di ritorno', valore: dati.pazientiDiRitorno, colore: '#1F52FF' },
              ]} />
              <div className="flex-1 min-w-0 space-y-2">
                <VoceLegenda nome="Nuovi" valore={dati.pazientiNuovi} colore="#D6FB3D"
                  percentuale={dati.pazientiDistinti ? Math.round(dati.pazientiNuovi / dati.pazientiDistinti * 100) : 0} />
                <VoceLegenda nome="Di ritorno" valore={dati.pazientiDiRitorno} colore="#1F52FF"
                  percentuale={dati.pazientiDistinti ? Math.round(dati.pazientiDiRitorno / dati.pazientiDistinti * 100) : 0} />
                <p className="text-xs text-ink-navy/35 pt-1 border-t border-ink-navy/8">
                  Nuovo = prima seduta completata nel periodo
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-ink-navy/10 rounded-2xl p-5 lg:col-span-2">
            <h2 className="font-bold text-ink-navy mb-4">Tipi di seduta</h2>
            <div className="flex items-center gap-6 flex-wrap">
              <Ciambella dimensione={180} fette={dati.perTipo.map((t, i) => ({
                nome: t.nome, valore: t.sedute, colore: COLORI[i % COLORI.length],
              }))} />
              <div className="flex-1 min-w-[260px] space-y-2">
                {dati.perTipo.map((t, i) => (
                  <VoceLegenda key={t.nome} nome={t.nome} valore={t.sedute} importo={t.incasso}
                    colore={COLORI[i % COLORI.length]}
                    percentuale={Math.round(t.sedute / dati.seduteCompletate * 100)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { IconChartBar } from '@/app/components/icons'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

// Colori della torta: il blu del brand più tinte ben distinguibili fra loro
const COLORI = ['#1F52FF', '#0B1533', '#7C9CFF', '#D6FB3D', '#F59E0B', '#10B981', '#E11D48']

interface Dati {
  seduteCompletate: number
  incassoTotale: number
  spesaMediaPaziente: number
  pazientiDistinti: number
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

type Modo = 'settimana' | 'mese' | 'scegli'

export default function CareAnalyticsPage() {
  const [modo, setModo] = useState<Modo>('settimana')
  const [dati, setDati] = useState<Dati | null>(null)
  const [loading, setLoading] = useState(true)

  // Stato del selettore "Scegli"
  const [tipoScelta, setTipoScelta] = useState<'settimana' | 'mese'>('mese')
  const [mese, setMese] = useState(() => new Date().getMonth())
  const [anno, setAnno] = useState(() => new Date().getFullYear())
  const [settimanaScelta, setSettimanaScelta] = useState(() => chiave(lunedi(new Date())))

  // Ultimi 26 lunedì, dal più recente: è la lista del menu "settimana"
  const lunediPassati = useMemo(() => {
    const out: string[] = []
    const l = lunedi(new Date())
    for (let i = 0; i < 26; i++) {
      out.push(chiave(new Date(l.getFullYear(), l.getMonth(), l.getDate() - i * 7)))
    }
    return out
  }, [])

  const anni = useMemo(() => {
    const y = new Date().getFullYear()
    return [y, y - 1, y - 2]
  }, [])

  // Periodo effettivo in base al modo scelto
  const periodo = useMemo(() => {
    if (modo === 'settimana') {
      const l = lunedi(new Date())
      return { da: chiave(l), a: chiave(new Date(l.getFullYear(), l.getMonth(), l.getDate() + 6)) }
    }
    if (modo === 'mese') {
      const d = new Date()
      return {
        da: chiave(new Date(d.getFullYear(), d.getMonth(), 1)),
        a: chiave(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      }
    }
    if (tipoScelta === 'mese') {
      return { da: chiave(new Date(anno, mese, 1)), a: chiave(new Date(anno, mese + 1, 0)) }
    }
    const [y, m, g] = settimanaScelta.split('-').map(Number)
    return { da: settimanaScelta, a: chiave(new Date(y, m - 1, g + 6)) }
  }, [modo, tipoScelta, mese, anno, settimanaScelta])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/care/analytics?da=${periodo.da}&a=${periodo.a}`, { credentials: 'include', cache: 'no-store' })
      .then(r => r.json())
      .then(d => setDati(d.error ? null : d))
      .catch(() => setDati(null))
      .finally(() => setLoading(false))
  }, [periodo.da, periodo.a])

  const barre = (dati?.perGiorno ?? []).map(g => ({
    ...g,
    etichetta: new Date(`${g.giorno}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }),
  }))

  const kpi = [
    { label: 'Sedute completate', valore: dati ? String(dati.seduteCompletate) : '—' },
    { label: 'Incasso totale', valore: dati ? `€${dati.incassoTotale.toFixed(0)}` : '—' },
    { label: 'Spesa media per paziente', valore: dati ? `€${dati.spesaMediaPaziente.toFixed(0)}` : '—' },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-navy">Analytics</h1>
          <p className="text-ink-navy/50 mt-0.5">
            {new Date(`${periodo.da}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
            {' – '}
            {new Date(`${periodo.a}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="flex gap-1 bg-mist rounded-xl p-1">
          {([['settimana', 'Settimana'], ['mese', 'Mese'], ['scegli', 'Scegli']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setModo(k)}
              className={`text-sm font-semibold px-3.5 py-1.5 rounded-lg transition-colors ${
                modo === k ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/45 hover:text-ink-navy/70'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {modo === 'scegli' && (
        <div className="bg-white rounded-2xl border border-ink-navy/10 p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-navy/50 mb-1">Periodo</label>
            <select value={tipoScelta} onChange={e => setTipoScelta(e.target.value as 'settimana' | 'mese')}
              className="border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
              <option value="mese">Mese</option>
              <option value="settimana">Settimana</option>
            </select>
          </div>

          {tipoScelta === 'mese' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-ink-navy/50 mb-1">Mese</label>
                <select value={mese} onChange={e => setMese(Number(e.target.value))}
                  className="border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
                  {MESI.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-navy/50 mb-1">Anno</label>
                <select value={anno} onChange={e => setAnno(Number(e.target.value))}
                  className="border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
                  {anni.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-ink-navy/50 mb-1">Settimana che inizia il</label>
              <select value={settimanaScelta} onChange={e => setSettimanaScelta(e.target.value)}
                className="border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
                {lunediPassati.map(l => (
                  <option key={l} value={l}>
                    {new Date(`${l}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kpi.map(k => (
          <div key={k.label} className="bg-white border border-ink-navy/10 rounded-2xl p-5">
            <div className="text-3xl font-extrabold text-ink-navy">{k.valore}</div>
            <div className="text-sm text-ink-navy/50 mt-0.5">{k.label}</div>
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
            <h2 className="font-bold text-ink-navy mb-4">Sedute per giorno</h2>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={barre} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0B153315" vertical={false} />
                  <XAxis dataKey="etichetta" tick={{ fontSize: 11, fill: '#0B153370' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#0B153370' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: '#1F52FF0D' }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #0B153315', fontSize: 13 }}
                    formatter={(v) => [Number(v), 'Sedute'] as [number, string]}
                  />
                  <Bar dataKey="sedute" fill="#1F52FF" radius={[6, 6, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-ink-navy/10 rounded-2xl p-5">
            <h2 className="font-bold text-ink-navy mb-4">Tipi di seduta</h2>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={dati.perTipo} dataKey="sedute" nameKey="nome" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {dati.perTipo.map((_, i) => <Cell key={i} fill={COLORI[i % COLORI.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #0B153315', fontSize: 13 }}
                    formatter={(v, nome) => {
                      const n = Number(v)
                      return [`${n} (${Math.round(n / dati.seduteCompletate * 100)}%)`, String(nome)] as [string, string]
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

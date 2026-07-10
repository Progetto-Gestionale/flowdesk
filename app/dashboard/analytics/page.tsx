'use client'
import { useEffect, useState } from 'react'

function scaricaPdf(nome: string, ruolo: string | null, mese: string, turniPerGiorno: Record<string, { oraInizio: string; oraFine: string; ore: number }[]>) {
  const [y, m] = mese.split('-').map(Number)
  const meseLbl = ({ '01':'Gennaio','02':'Febbraio','03':'Marzo','04':'Aprile','05':'Maggio','06':'Giugno','07':'Luglio','08':'Agosto','09':'Settembre','10':'Ottobre','11':'Novembre','12':'Dicembre' } as Record<string,string>)[String(m).padStart(2,'0')] ?? mese

  const righe = Object.entries(turniPerGiorno).sort(([a],[b]) => a.localeCompare(b))
  const totaleMensile = righe.reduce((s, [, ts]) => s + ts.reduce((ss, t) => ss + t.ore, 0), 0)

  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<title>Report ${nome} - ${meseLbl} ${y}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #4f46e5; color: #fff; text-align: left; padding: 9px 12px; font-size: 12px; letter-spacing: .04em; }
  td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  .total-row td { background: #eef2ff; font-weight: 700; border-top: 2px solid #4f46e5; }
  .ore { text-align: right; }
  @media print { body { padding: 16px } @page { margin: 1.5cm } }
</style></head><body>
<h1>${nome}</h1>
<div class="sub">${ruolo ? ruolo + ' · ' : ''}Report presenze — ${meseLbl} ${y}</div>
<table>
  <thead><tr><th>Data</th><th>Orario</th><th class="ore">Ore lavorate</th></tr></thead>
  <tbody>
    ${righe.map(([data, ts]) => {
      const d = new Date(data + 'T00:00:00')
      const dataFmt = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
      const orari = ts.map(t => `${t.oraInizio}–${t.oraFine}`).join(', ')
      const ore = ts.reduce((s, t) => s + t.ore, 0)
      return `<tr><td>${dataFmt}</td><td>${orari}</td><td class="ore">${ore}h</td></tr>`
    }).join('')}
    <tr class="total-row"><td colspan="2">Totale mensile</td><td class="ore">${Math.round(totaleMensile * 10) / 10}h</td></tr>
  </tbody>
</table>
<div style="margin-top:24px;font-size:11px;color:#aaa;">Generato il ${new Date().toLocaleDateString('it-IT')}</div>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

const MESI_LABEL: Record<string, string> = {
  '01': 'Gennaio', '02': 'Febbraio', '03': 'Marzo', '04': 'Aprile',
  '05': 'Maggio', '06': 'Giugno', '07': 'Luglio', '08': 'Agosto',
  '09': 'Settembre', '10': 'Ottobre', '11': 'Novembre', '12': 'Dicembre',
}

interface StatDip {
  id: string; nome: string; ruolo: string | null
  oreLavorate: number; giorniLavorati: number; giornoTop: string | null
  ferie: { totale: number; approvate: number }
  malattie: { totale: number; approvate: number }
  permessi: { totale: number; approvati: number }
  preferenze: number
}

interface MeseData {
  mese: string
  totale: number
  noShow: number
  cancellati: number
  completati: number
  revenue: number
}

interface Analytics {
  totaleApp: number
  noShow: number
  cancellati: number
  completati: number
  tassoNoShow: number
  giornoTop: string | null
  oraTop: string | null
  perMese: MeseData[]
  labelPeriodo: string
}

const MESI: Record<string, string> = {
  '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'Mag', '06': 'Giu', '07': 'Lug', '08': 'Ago',
  '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic',
}

type Periodo = 'settimana' | 'mese' | 'anno'
type TabAnalytics = 'servizi' | 'tavoli' | 'ordini' | 'personale'

interface Preventivo {
  id: string
  tipo: string | null
  totale: number
  status: string
  createdAt: string
}

function spostaRiferimento(rif: Date, periodo: Periodo, direzione: 1 | -1): Date {
  const d = new Date(rif)
  if (periodo === 'settimana') d.setDate(d.getDate() + direzione * 7)
  else if (periodo === 'mese') d.setMonth(d.getMonth() + direzione)
  else d.setFullYear(d.getFullYear() + direzione)
  return d
}

const MESI_BREVI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
const GIORNI_BREVI = ['L','M','M','G','V','S','D']

function MiniCalendario({ periodo, riferimento, onScegli, onChiudi }: {
  periodo: Periodo
  riferimento: Date
  onScegli: (d: Date) => void
  onChiudi: () => void
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
              disabled={a > ora.getFullYear()}>
              {a}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // mese e settimana: mostra griglia del mese con navigazione
  const primoGiorno = new Date(annoNav, meseNav, 1).getDay() // 0=dom
  const giorniMese = new Date(annoNav, meseNav + 1, 0).getDate()
  const offset = primoGiorno === 0 ? 6 : primoGiorno - 1 // lun=0

  function selGiorno(giorno: number) {
    const d = new Date(annoNav, meseNav, giorno)
    if (d > ora) return
    onScegli(d)
    onChiudi()
  }

  function mesePrecedente() {
    if (meseNav === 0) { setMeseNav(11); setAnnoNav(a => a - 1) }
    else setMeseNav(m => m - 1)
  }
  function meseSuccessivo() {
    if (annoNav > ora.getFullYear() || (annoNav === ora.getFullYear() && meseNav >= ora.getMonth())) return
    if (meseNav === 11) { setMeseNav(0); setAnnoNav(a => a + 1) }
    else setMeseNav(m => m + 1)
  }

  return (
    <div className="absolute right-0 top-full mt-1 bg-white border border-ink-navy/10 rounded-2xl shadow-xl z-50 p-4 w-72">
      {/* Header mese */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={mesePrecedente} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-lg">‹</button>
        <span className="text-sm font-semibold text-ink-navy">{MESI_BREVI[meseNav]} {annoNav}</span>
        <button onClick={meseSuccessivo} disabled={annoNav === ora.getFullYear() && meseNav >= ora.getMonth()}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-lg disabled:opacity-30">›</button>
      </div>
      {/* Intestazioni giorni */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {GIORNI_BREVI.map((g, i) => <div key={i} className="text-center text-[10px] font-semibold text-ink-navy/35">{g}</div>)}
      </div>
      {/* Celle giorni */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: giorniMese }).map((_, i) => {
          const giorno = i + 1
          const d = new Date(annoNav, meseNav, giorno)
          const futuro = d > ora
          const attivo = periodo === 'mese'
            ? d.getFullYear() === riferimento.getFullYear() && d.getMonth() === riferimento.getMonth()
            : (() => {
                const lun = new Date(riferimento)
                lun.setDate(riferimento.getDate() - ((riferimento.getDay()+6)%7))
                const dom = new Date(lun); dom.setDate(lun.getDate()+6)
                return d >= lun && d <= dom
              })()
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

export default function AnalyticsPage() {
  const [tabAnalytics, setTabAnalytics] = useState<TabAnalytics>('servizi')
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('anno')
  const [riferimento, setRiferimento] = useState<Date>(new Date())
  const [calendarioAperto, setCalendarioAperto] = useState(false)
  const [staff, setStaff] = useState<StatDip[]>([])
  const [mesiDisponibili, setMesiDisponibili] = useState<string[]>([])
  const [meseSel, setMeseSel] = useState<string>('')
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [fonteStaff, setFonteStaff] = useState<'turni' | 'cartellino'>('turni')
  const [preventivi, setPreventivi] = useState<Preventivo[]>([])
  const [loadingOrdini, setLoadingOrdini] = useState(false)

  // Dettaglio dipendente
  type TurnoGiorno = { oraInizio: string; oraFine: string; ore: number }
  type RichiestaDettaglio = { tipo: string; status: string; data: string | null; dataFine: string | null; oraInizio: string | null; oraFine: string | null }
  interface DettaglioDip { dip: StatDip; turniPerGiorno: Record<string, TurnoGiorno[]>; orePerDow: number[]; richieste: RichiestaDettaglio[]; mese: string }
  const [dettaglio, setDettaglio] = useState<DettaglioDip | null>(null)
  const [loadingDett, setLoadingDett] = useState(false)

  function apriDettaglio(dipId: string) {
    setLoadingDett(true)
    fetch(`/api/analytics/staff?mese=${meseSel}&dipendenteId=${dipId}&fonte=${fonteStaff}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDettaglio(d); setLoadingDett(false) })
  }

  const ora = new Date()
  const isOggi = riferimento.toDateString() === ora.toDateString()
  // Il prossimo periodo inizia dopo oggi?
  const prossimoInizio = spostaRiferimento(riferimento, periodo, 1)
  const isFuturo = (() => {
    if (periodo === 'settimana') { const lun = new Date(prossimoInizio); lun.setDate(prossimoInizio.getDate() - ((prossimoInizio.getDay()+6)%7)); return lun > ora }
    if (periodo === 'mese') return new Date(prossimoInizio.getFullYear(), prossimoInizio.getMonth(), 1) > ora
    return prossimoInizio.getFullYear() > ora.getFullYear()
  })()

  useEffect(() => {
    setLoading(true)
    const rifStr = riferimento.toISOString()
    fetch(`/api/analytics?periodo=${periodo}&riferimento=${rifStr}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [periodo, riferimento])

  useEffect(() => {
    fetch('/api/analytics/staff', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setStaff(d.staff ?? [])
        setMesiDisponibili(d.mesiDisponibili ?? [])
        setMeseSel(d.mese ?? '')
      })
  }, [])

  useEffect(() => {
    if (!meseSel) return
    setLoadingStaff(true)
    fetch(`/api/analytics/staff?mese=${meseSel}&fonte=${fonteStaff}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setStaff(d.staff ?? []); setLoadingStaff(false) })
  }, [fonteStaff])

  useEffect(() => {
    if (tabAnalytics !== 'ordini' || preventivi.length > 0) return
    setLoadingOrdini(true)
    fetch('/api/preventivi', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setPreventivi(d.preventivi ?? []); setLoadingOrdini(false) })
  }, [tabAnalytics])

  function cambiaMe(mese: string) {
    setMeseSel(mese)
    setLoadingStaff(true)
    fetch(`/api/analytics/staff?mese=${mese}&fonte=${fonteStaff}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setStaff(d.staff ?? []); setLoadingStaff(false) })
  }

  if (loading && !data) return <div className="flex items-center justify-center h-64 text-ink-navy/35">Caricamento...</div>
  if (!data) return null

  const maxTotale = Math.max(...data.perMese.map(m => m.totale), 1)
  const maxRevenue = Math.max(...data.perMese.map(m => m.revenue), 1)

  function bucketLabel(mese: string) {
    if (periodo === 'anno') return MESI[mese.split('-')[1]] ?? mese
    if (periodo === 'settimana') return mese
    return mese
  }
  function bucketFull(mese: string) {
    if (periodo === 'anno') return `${MESI[mese.split('-')[1]]} ${mese.split('-')[0]}`
    if (periodo === 'settimana') return mese
    return `${mese} ${new Date().toLocaleDateString('it-IT', { month: 'long' })}`
  }

  // Aggregazioni ordini
  const ordiniList = preventivi.filter(p => p.tipo === 'ordine')
  const deliveryList = preventivi.filter(p => p.tipo === 'delivery')
  const totOrdini = ordiniList.reduce((s, p) => s + p.totale, 0)
  const totDelivery = deliveryList.reduce((s, p) => s + p.totale, 0)

  const TABS: { key: TabAnalytics; label: string }[] = [
    { key: 'servizi', label: 'Servizi' },
    { key: 'tavoli', label: 'Tavoli' },
    { key: 'ordini', label: 'Ordini & Asporto' },
    { key: 'personale', label: 'Personale' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-navy">Analytics</h1>
        <p className="text-ink-navy/50 text-sm mt-0.5">Statistiche sull&apos;andamento del tuo locale</p>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 bg-mist rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTabAnalytics(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tabAnalytics === t.key ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB SERVIZI ── */}
      {tabAnalytics === 'servizi' && (
        <div className="space-y-6">
          {/* Selettore periodo */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex flex-col items-start gap-2">
              <div className="flex rounded-xl border border-ink-navy/10 bg-white overflow-hidden shadow-sm text-sm font-medium">
                {(['settimana', 'mese', 'anno'] as Periodo[]).map(p => (
                  <button key={p} onClick={() => { setPeriodo(p); setRiferimento(new Date()) }}
                    className={`px-4 py-2 capitalize transition-colors ${periodo === p ? 'bg-electric-blue text-white' : 'text-ink-navy/50 hover:bg-mist'}`}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 relative">
                <button onClick={() => setRiferimento(r => spostaRiferimento(r, periodo, -1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 bg-white text-ink-navy/50 hover:bg-mist transition-colors text-lg">‹</button>
                <button onClick={() => setCalendarioAperto(v => !v)}
                  className="text-sm font-medium text-ink-navy/70 min-w-[160px] text-center px-3 py-1.5 rounded-lg border border-ink-navy/10 bg-white hover:bg-mist transition-colors">
                  {data?.labelPeriodo ?? '—'}
                </button>
                {calendarioAperto && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setCalendarioAperto(false)} />
                    <MiniCalendario periodo={periodo} riferimento={riferimento}
                      onScegli={d => { setRiferimento(d); setCalendarioAperto(false) }}
                      onChiudi={() => setCalendarioAperto(false)} />
                  </>
                )}
                <button onClick={() => setRiferimento(r => spostaRiferimento(r, periodo, 1))} disabled={isFuturo}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 bg-white text-ink-navy/50 hover:bg-mist transition-colors text-lg disabled:opacity-30 disabled:cursor-not-allowed">›</button>
                {!isOggi && (
                  <button onClick={() => setRiferimento(new Date())} className="text-xs text-electric-blue hover:underline ml-1">Oggi</button>
                )}
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
              <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Prenotazioni totali</p>
              <p className="text-3xl font-bold text-ink-navy mt-1">{data.totaleApp}</p>
              <p className="text-xs text-ink-navy/35 mt-1">{periodo === 'settimana' ? 'questa settimana' : periodo === 'mese' ? 'questo mese' : 'ultimi 12 mesi'}</p>
            </div>
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
              <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Tasso no-show</p>
              <p className={`text-3xl font-bold mt-1 ${data.tassoNoShow > 15 ? 'text-red-500' : data.tassoNoShow > 8 ? 'text-amber-500' : 'text-green-500'}`}>
                {data.tassoNoShow}%
              </p>
              <p className="text-xs text-ink-navy/35 mt-1">{data.noShow} no-show · {data.cancellati} cancellate</p>
            </div>
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
              <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Giorno più gettonato</p>
              <p className="text-3xl font-bold text-electric-blue mt-1">{data.giornoTop ?? '—'}</p>
              <p className="text-xs text-ink-navy/35 mt-1">giorno della settimana</p>
            </div>
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
              <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Orario più richiesto</p>
              <p className="text-3xl font-bold text-electric-blue mt-1">{data.oraTop ?? '—'}</p>
              <p className="text-xs text-ink-navy/35 mt-1">fascia oraria</p>
            </div>
          </div>

          {/* Grafico prenotazioni */}
          <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-ink-navy mb-4">
              {periodo === 'settimana' ? 'Prenotazioni questa settimana' : periodo === 'mese' ? 'Prenotazioni questo mese' : 'Prenotazioni ultimi 12 mesi'}
            </h2>
            <div className="flex items-end gap-3 h-40">
              {data.perMese.map(m => {
                const label = bucketLabel(m.mese)
                const hTot = Math.round((m.totale / maxTotale) * 130)
                const hNS = m.totale > 0 ? Math.round((m.noShow / m.totale) * hTot) : 0
                const hCanc = m.totale > 0 ? Math.round((m.cancellati / m.totale) * hTot) : 0
                const hOk = Math.max(hTot - hNS - hCanc, 0)
                return (
                  <div key={m.mese} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-ink-navy/50 font-medium">{m.totale}</span>
                    <div className="w-full flex flex-col justify-end rounded-t-lg overflow-hidden" style={{ height: `${Math.max(hTot, 4)}px` }}>
                      <div className="w-full bg-red-300" style={{ height: `${hNS}px` }} title={`No-show: ${m.noShow}`} />
                      <div className="w-full bg-orange-300" style={{ height: `${hCanc}px` }} title={`Cancellate: ${m.cancellati}`} />
                      <div className="w-full bg-electric-blue" style={{ height: `${hOk}px` }} />
                    </div>
                    <span className="text-xs text-ink-navy/35">{label}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-ink-navy/50">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-electric-blue inline-block" /> Prenotazioni</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-300 inline-block" /> Cancellate</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> No-show</span>
            </div>
          </div>

          {/* Tabella dettaglio */}
          <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-ink-navy/8">
              <h2 className="text-base font-semibold text-ink-navy">Dettaglio mensile</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-mist text-ink-navy/50 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-3">Periodo</th>
                  <th className="text-right px-4 py-3">Totale</th>
                  <th className="text-right px-4 py-3">Completate</th>
                  <th className="text-right px-4 py-3">Cancellate</th>
                  <th className="text-right px-4 py-3">No-show</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...data.perMese].reverse().map(m => (
                  <tr key={m.mese} className="hover:bg-mist">
                    <td className="px-6 py-3 font-medium text-ink-navy">{bucketFull(m.mese)}</td>
                    <td className="text-right px-4 py-3 text-ink-navy/70">{m.totale}</td>
                    <td className="text-right px-4 py-3 text-green-600">{m.completati}</td>
                    <td className="text-right px-4 py-3 text-orange-500">{m.cancellati > 0 ? m.cancellati : '—'}</td>
                    <td className="text-right px-4 py-3 text-red-500">{m.noShow > 0 ? m.noShow : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB TAVOLI ── */}
      {tabAnalytics === 'tavoli' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
              <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Revenue totale</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">
                €{data.perMese.reduce((s, m) => s + m.revenue, 0).toLocaleString('it-IT')}
              </p>
              <p className="text-xs text-ink-navy/35 mt-1">ultimi 12 mesi</p>
            </div>
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
              <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Prenotazioni tavoli</p>
              <p className="text-3xl font-bold text-ink-navy mt-1">{data.totaleApp}</p>
              <p className="text-xs text-ink-navy/35 mt-1">nel periodo selezionato</p>
            </div>
          </div>

          {maxRevenue > 0 ? (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-ink-navy mb-4">Revenue tavoli per periodo</h2>
              <div className="flex items-end gap-3 h-40">
                {data.perMese.map(m => {
                  const label = bucketLabel(m.mese)
                  const h = Math.round((m.revenue / maxRevenue) * 130)
                  return (
                    <div key={m.mese} className="flex-1 flex flex-col items-center gap-1">
                      {m.revenue > 0 && <span className="text-xs text-ink-navy/50 font-medium">€{m.revenue.toLocaleString('it-IT')}</span>}
                      <div className="w-full flex flex-col justify-end" style={{ height: '130px' }}>
                        <div className="w-full bg-emerald-500 rounded-t-lg" style={{ height: `${Math.max(h, m.revenue > 0 ? 4 : 0)}px` }} />
                      </div>
                      <span className="text-xs text-ink-navy/35">{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-12 text-center shadow-sm">
              <p className="text-ink-navy/35 text-sm">Nessun dato revenue disponibile</p>
              <p className="text-xs text-ink-navy/25 mt-1">I dati appariranno quando i tavoli avranno un valore associato</p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-ink-navy/8">
              <h2 className="text-base font-semibold text-ink-navy">Dettaglio revenue mensile</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-mist text-ink-navy/50 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-3">Periodo</th>
                  <th className="text-right px-4 py-3">Prenotazioni</th>
                  <th className="text-right px-6 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...data.perMese].reverse().map(m => (
                  <tr key={m.mese} className="hover:bg-mist">
                    <td className="px-6 py-3 font-medium text-ink-navy">{bucketFull(m.mese)}</td>
                    <td className="text-right px-4 py-3 text-ink-navy/70">{m.totale}</td>
                    <td className="text-right px-6 py-3 text-emerald-600 font-medium">
                      {m.revenue > 0 ? `€${m.revenue.toLocaleString('it-IT')}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB ORDINI & ASPORTO ── */}
      {tabAnalytics === 'ordini' && (
        <div className="space-y-6">
          {loadingOrdini ? (
            <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
                  <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Ordini asporto</p>
                  <p className="text-3xl font-bold text-ink-navy mt-1">{ordiniList.length}</p>
                  <p className="text-xs text-ink-navy/35 mt-1">totale ordini</p>
                </div>
                <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
                  <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Revenue asporto</p>
                  <p className="text-3xl font-bold text-emerald-600 mt-1">€{totOrdini.toLocaleString('it-IT')}</p>
                  <p className="text-xs text-ink-navy/35 mt-1">valore totale</p>
                </div>
                <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
                  <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Delivery</p>
                  <p className="text-3xl font-bold text-ink-navy mt-1">{deliveryList.length}</p>
                  <p className="text-xs text-ink-navy/35 mt-1">totale delivery</p>
                </div>
                <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
                  <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Revenue delivery</p>
                  <p className="text-3xl font-bold text-emerald-600 mt-1">€{totDelivery.toLocaleString('it-IT')}</p>
                  <p className="text-xs text-ink-navy/35 mt-1">valore totale</p>
                </div>
              </div>

              {preventivi.filter(p => p.tipo === 'ordine' || p.tipo === 'delivery').length === 0 ? (
                <div className="bg-white rounded-2xl border border-ink-navy/10 p-12 text-center shadow-sm">
                  <p className="text-ink-navy/35 text-sm">Nessun ordine o delivery ancora</p>
                  <p className="text-xs text-ink-navy/25 mt-1">Gli ordini ricevuti tramite il widget appariranno qui</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-ink-navy/8">
                    <h2 className="text-base font-semibold text-ink-navy">Ultimi ordini</h2>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-mist text-ink-navy/50 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-6 py-3">Data</th>
                        <th className="text-left px-4 py-3">Tipo</th>
                        <th className="text-left px-4 py-3">Cliente</th>
                        <th className="text-right px-4 py-3">Status</th>
                        <th className="text-right px-6 py-3">Totale</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preventivi
                        .filter(p => p.tipo === 'ordine' || p.tipo === 'delivery')
                        .slice(0, 30)
                        .map((p: Preventivo & { clienteName?: string; clienteEmail?: string }) => (
                          <tr key={p.id} className="hover:bg-mist">
                            <td className="px-6 py-3 text-ink-navy/70">{new Date(p.createdAt).toLocaleDateString('it-IT')}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.tipo === 'delivery' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {p.tipo === 'delivery' ? 'Delivery' : 'Asporto'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-ink-navy/70">{(p as Preventivo & { clienteName?: string }).clienteName ?? '—'}</td>
                            <td className="text-right px-4 py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.status === 'confermato' ? 'bg-green-100 text-green-700' : p.status === 'da_verificare' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                                {p.status === 'da_verificare' ? 'Da verificare' : p.status === 'confermato' ? 'Confermato' : p.status}
                              </span>
                            </td>
                            <td className="text-right px-6 py-3 text-emerald-600 font-medium">€{p.totale.toLocaleString('it-IT')}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB PERSONALE ── */}
      {tabAnalytics === 'personale' && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-ink-navy">Statistiche staff</h2>
              <p className="text-ink-navy/50 text-sm mt-0.5">Ore, presenze e richieste per dipendente</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Toggle fonte */}
              <div className="flex bg-mist rounded-lg p-0.5">
                <button onClick={() => setFonteStaff('turni')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${fonteStaff === 'turni' ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy'}`}>
                  Turni
                </button>
                <button onClick={() => setFonteStaff('cartellino')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${fonteStaff === 'cartellino' ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy'}`}>
                  Cartellino
                </button>
              </div>
              {mesiDisponibili.length > 0 && (
                <select value={meseSel} onChange={e => cambiaMe(e.target.value)}
                  className="text-sm border border-ink-navy/10 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric-blue bg-white">
                  {mesiDisponibili.map(m => (
                    <option key={m} value={m}>
                      {MESI_LABEL[m.split('-')[1]]} {m.split('-')[0]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {loadingStaff ? (
            <div className="text-ink-navy/35 text-sm py-8 text-center">Caricamento...</div>
          ) : staff.length === 0 ? (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-12 text-center shadow-sm">
              <p className="text-ink-navy/35 text-sm">Nessun dipendente trovato</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {staff.map(dip => (
                <div key={dip.id} onClick={() => apriDettaglio(dip.id)} className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-4 cursor-pointer hover:border-electric-blue/40 hover:shadow-md transition-all">
                  <div>
                    <p className="font-bold text-ink-navy">{dip.nome}</p>
                    {dip.ruolo && <p className="text-xs text-ink-navy/35">{dip.ruolo}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center bg-electric-blue/10 rounded-xl py-2">
                      <p className="text-lg font-bold text-electric-blue">{dip.oreLavorate}</p>
                      <p className="text-[10px] text-electric-blue font-medium">ore</p>
                    </div>
                    <div className="text-center bg-electric-blue/10 rounded-xl py-2">
                      <p className="text-lg font-bold text-electric-blue">{dip.giorniLavorati}</p>
                      <p className="text-[10px] text-electric-blue font-medium">giorni</p>
                    </div>
                    <div className="text-center bg-electric-blue/10 rounded-xl py-2">
                      <p className="text-lg font-bold text-electric-blue">{dip.giornoTop ?? '—'}</p>
                      <p className="text-[10px] text-electric-blue font-medium">giorno top</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: 'Ferie', tot: dip.ferie.totale, app: dip.ferie.approvate, color: 'text-blue-600' },
                      { label: 'Malattie', tot: dip.malattie.totale, app: dip.malattie.approvate, color: 'text-red-500' },
                      { label: 'Permessi', tot: dip.permessi.totale, app: dip.permessi.approvati, color: 'text-amber-600' },
                    ].map(r => r.tot > 0 && (
                      <div key={r.label} className="flex items-center justify-between text-sm">
                        <span className="text-ink-navy/50">{r.label}</span>
                        <span className={`font-semibold ${r.color}`}>
                          {r.app}/{r.tot}
                          <span className="text-ink-navy/35 font-normal text-xs ml-1">approv.</span>
                        </span>
                      </div>
                    ))}
                    {dip.preferenze > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-navy/50">Pref. orario</span>
                        <span className="font-semibold text-purple-600">{dip.preferenze}</span>
                      </div>
                    )}
                    {dip.ferie.totale === 0 && dip.malattie.totale === 0 && dip.permessi.totale === 0 && dip.preferenze === 0 && (
                      <p className="text-xs text-ink-navy/25 italic">Nessuna richiesta questo mese</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal dettaglio dipendente */}
      {(dettaglio || loadingDett) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setDettaglio(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {loadingDett ? (
              <div className="p-12 text-center text-ink-navy/35">Caricamento...</div>
            ) : dettaglio && (() => {
              const { dip, turniPerGiorno, orePerDow, richieste: rich, mese } = dettaglio
              const [y, m] = mese.split('-').map(Number)
              const giorniMese = new Date(y, m, 0).getDate()
              const primoGiorno = new Date(y, m - 1, 1).getDay() // 0=dom
              const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
              const maxDow = Math.max(...orePerDow, 1)
              const tipiAssenza = ['assenza', 'malattia', 'permesso', 'ferie']
              const assenze = rich.filter(r => tipiAssenza.includes(r.tipo))
              const preferenze = rich.filter(r => !tipiAssenza.includes(r.tipo))
              const fmtData = (s: string | null) => s ? new Date(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '—'

              return (
                <div className="p-6 space-y-6">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-ink-navy">{dip.nome}</h2>
                      {dip.ruolo && <p className="text-sm text-ink-navy/35">{dip.ruolo}</p>}
                      <p className="text-xs text-ink-navy/35 mt-0.5">{MESI_LABEL[mese.split('-')[1]]} {mese.split('-')[0]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => scaricaPdf(dip.nome, dip.ruolo, mese, turniPerGiorno)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-electric-blue text-white font-semibold hover:bg-electric-blue/90 transition-colors">
                        Scarica PDF
                      </button>
                      <button onClick={() => setDettaglio(null)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl leading-none">✕</button>
                    </div>
                  </div>

                  {/* KPI */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Ore lavorate', val: `${dip.oreLavorate}h` },
                      { label: 'Giorni lavorati', val: dip.giorniLavorati },
                      { label: 'Giorno top', val: dip.giornoTop ?? '—' },
                    ].map(k => (
                      <div key={k.label} className="bg-electric-blue/10 rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-electric-blue">{k.val}</p>
                        <p className="text-[11px] text-electric-blue mt-0.5">{k.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Calendario turni del mese */}
                  <div>
                    <h3 className="text-sm font-semibold text-ink-navy/70 mb-3">Presenze nel mese</h3>
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {['L','M','M','G','V','S','D'].map((d, i) => (
                        <div key={i} className="text-[10px] font-semibold text-ink-navy/35 pb-1">{d}</div>
                      ))}
                      {/* celle vuote prima del primo giorno (lun=0) */}
                      {Array.from({ length: (primoGiorno === 0 ? 6 : primoGiorno - 1) }).map((_, i) => <div key={`e${i}`} />)}
                      {Array.from({ length: giorniMese }).map((_, i) => {
                        const day = i + 1
                        const key = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                        const ts = turniPerGiorno[key]
                        const oreGiorno = ts ? ts.reduce((s, t) => s + t.ore, 0) : 0
                        return (
                          <div key={day} title={ts ? ts.map(t => `${t.oraInizio}–${t.oraFine} (${t.ore}h)`).join('\n') : undefined}
                            className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${ts ? 'bg-electric-blue text-white' : 'bg-mist text-ink-navy/35'}`}>
                            <div>{day}</div>
                            {ts && <div className="text-[9px] opacity-80">{oreGiorno}h</div>}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Distribuzione per giorno settimana */}
                  <div>
                    <h3 className="text-sm font-semibold text-ink-navy/70 mb-3">Ore per giorno della settimana</h3>
                    <div className="flex items-end gap-2 h-24">
                      {/* orePerDow da API: 0=dom, riordino lun-dom */}
                      {[1,2,3,4,5,6,0].map((dow, i) => {
                        const ore = orePerDow[dow]
                        const h = Math.round((ore / maxDow) * 80)
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            {ore > 0 && <span className="text-[10px] text-ink-navy/50">{ore}h</span>}
                            <div className="w-full rounded-t-md bg-electric-blue" style={{ height: `${Math.max(h, ore > 0 ? 4 : 0)}px` }} />
                            <span className="text-[10px] text-ink-navy/35">{DOW[i]}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Assenze */}
                  {assenze.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-ink-navy/70 mb-2">Assenze e permessi</h3>
                      <div className="space-y-2">
                        {assenze.map((r, i) => (
                          <div key={i} className="flex items-center justify-between bg-mist rounded-xl px-4 py-2.5">
                            <div>
                              <span className="text-sm font-medium text-ink-navy capitalize">{r.tipo.replace('_', ' ')}</span>
                              <span className="text-xs text-ink-navy/35 ml-2">{fmtData(r.data)}{r.dataFine && r.dataFine !== r.data ? ` → ${fmtData(r.dataFine)}` : ''}</span>
                            </div>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.status === 'approvata' ? 'bg-green-100 text-green-700' : r.status === 'rifiutata' ? 'bg-red-100 text-red-500' : 'bg-amber-100 text-amber-600'}`}>
                              {r.status === 'approvata' ? 'Approvata' : r.status === 'rifiutata' ? 'Rifiutata' : 'In attesa'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preferenze orario */}
                  {preferenze.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-ink-navy/70 mb-2">Preferenze orario</h3>
                      <div className="space-y-2">
                        {preferenze.map((r, i) => (
                          <div key={i} className="flex items-center justify-between bg-purple-50 rounded-xl px-4 py-2.5">
                            <span className="text-sm text-ink-navy/70">{fmtData(r.data)}{r.oraInizio ? ` · ${r.oraInizio}–${r.oraFine}` : ''}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.status === 'approvata' ? 'bg-green-100 text-green-700' : 'bg-mist text-ink-navy/50'}`}>
                              {r.status === 'approvata' ? 'Confermata' : 'In attesa'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {assenze.length === 0 && preferenze.length === 0 && dip.giorniLavorati === 0 && (
                    <p className="text-center text-ink-navy/35 text-sm py-4">Nessun dato per questo mese</p>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

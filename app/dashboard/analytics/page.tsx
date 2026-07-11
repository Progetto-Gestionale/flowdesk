'use client'
import { useEffect, useState } from 'react'

// ── helpers ──────────────────────────────────────────────────────────────────

function minToLabel(min: number): string {
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const sign = min >= 0 ? '+' : '-'
  if (h > 0 && m > 0) return `${sign}${h}h ${m}m`
  if (h > 0) return `${sign}${h}h`
  return `${sign}${m}m`
}

function fmtData(s: string | null): string {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

function fmtDataLong(s: string): string {
  return new Date(s + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

type PerGiorno = Record<string, { oraInizio: string; oraFine: string; ore: number }[]>

function scaricaPdf(
  nome: string,
  ruolo: string | null,
  rangeLabel: string,
  periodo: string,
  perGiorno: PerGiorno,
  inizioPeriodo: string,
  ritardi: RitardoItem[],
) {
  const GIORNI_ITA = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']

  let righe: { dataFmt: string; orari: string; ore: number }[] = []

  if (periodo === 'settimana') {
    const [y, m, d] = inizioPeriodo.split('-').map(Number)
    for (let i = 0; i < 7; i++) {
      const dt = new Date(y, m - 1, d + i)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      const ts = perGiorno[key]
      const dataFmt = `${GIORNI_ITA[dt.getDay()]} ${dt.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`
      const orari = ts ? ts.map(t => `${t.oraInizio}–${t.oraFine}`).join(', ') : '—'
      const ore = ts ? ts.reduce((s, t) => s + t.ore, 0) : 0
      righe.push({ dataFmt, orari, ore })
    }
  } else {
    righe = Object.entries(perGiorno)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, ts]) => ({
        dataFmt: fmtDataLong(data),
        orari: ts.map(t => `${t.oraInizio}–${t.oraFine}`).join(', '),
        ore: ts.reduce((s, t) => s + t.ore, 0),
      }))
  }

  const totaleOre = Math.round(righe.reduce((s, r) => s + r.ore, 0) * 10) / 10

  const ritardiRows = ritardi.filter(r => r.ritardoMin > 2 || r.straordinarioMin > 5)
  const ritardiHtml = ritardiRows.length > 0 ? `
    <h2 style="font-size:15px;font-weight:700;margin:28px 0 10px">Ritardi & Straordinari</h2>
    <table>
      <thead><tr><th>Data</th><th>Turno</th><th>Entrata eff.</th><th>Uscita eff.</th><th class="ore">Ritardo</th><th class="ore">Straordinario</th></tr></thead>
      <tbody>
        ${ritardiRows.map(r => `
          <tr>
            <td>${fmtData(r.data)}</td>
            <td>${r.turnoInizio}–${r.turnoFine}</td>
            <td>${r.entrataEff ?? '—'}</td>
            <td>${r.uscitaEff ?? '—'}</td>
            <td class="ore" style="color:${r.ritardoMin > 2 ? '#dc2626' : '#16a34a'}">${r.ritardoMin !== 0 ? minToLabel(r.ritardoMin) : '—'}</td>
            <td class="ore" style="color:${r.straordinarioMin > 0 ? '#2563eb' : '#6b7280'}">${r.straordinarioMin !== 0 ? minToLabel(r.straordinarioMin) : '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : ''

  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<title>Report ${nome} – ${rangeLabel}</title>
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
  .zero { color: #ccc; }
  @media print { body { padding: 16px } @page { margin: 1.5cm } }
</style></head><body>
<h1>${nome}</h1>
<div class="sub">${ruolo ? ruolo + ' · ' : ''}Report presenze — ${rangeLabel}</div>
<table>
  <thead><tr><th>Data</th><th>Orario</th><th class="ore">Ore</th></tr></thead>
  <tbody>
    ${righe.map(r => `<tr>
      <td>${r.dataFmt}</td>
      <td class="${r.ore === 0 ? 'zero' : ''}">${r.orari}</td>
      <td class="ore ${r.ore === 0 ? 'zero' : ''}">${r.ore > 0 ? r.ore + 'h' : '—'}</td>
    </tr>`).join('')}
    <tr class="total-row"><td colspan="2">Totale ore</td><td class="ore">${totaleOre}h</td></tr>
  </tbody>
</table>
${ritardiHtml}
<div style="margin-top:24px;font-size:11px;color:#aaa;">Generato il ${new Date().toLocaleDateString('it-IT')}</div>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

// ── tipi ─────────────────────────────────────────────────────────────────────

const MESI_LABEL: Record<string, string> = {
  '01': 'Gennaio', '02': 'Febbraio', '03': 'Marzo', '04': 'Aprile',
  '05': 'Maggio', '06': 'Giugno', '07': 'Luglio', '08': 'Agosto',
  '09': 'Settembre', '10': 'Ottobre', '11': 'Novembre', '12': 'Dicembre',
}

interface StatDip {
  id: string; nome: string; ruolo: string | null
  oreLavorate: number; giorniLavorati: number; giornoTop: string | null
  ritardi: { count: number; minTotali: number }
  ferie: { totale: number; approvate: number }
  malattie: { totale: number; approvate: number }
  permessi: { totale: number; approvati: number }
}

interface MeseData {
  mese: string; totale: number; noShow: number; cancellati: number; completati: number; revenue: number
}

interface Analytics {
  totaleApp: number; noShow: number; cancellati: number; completati: number
  tassoNoShow: number; giornoTop: string | null; oraTop: string | null
  perMese: MeseData[]; labelPeriodo: string
}

interface RitardoItem {
  data: string; turnoInizio: string; turnoFine: string
  entrataEff: string | null; uscitaEff: string | null
  ritardoMin: number; straordinarioMin: number
}

interface RichiestaDettaglio {
  tipo: string; status: string
  data: string | null; dataFine: string | null
  oraInizio: string | null; oraFine: string | null
}

interface DettaglioDip {
  dip: { id: string; nome: string; ruolo: string | null }
  turniPerGiorno: PerGiorno
  timbraturePerGiorno: PerGiorno
  richieste: RichiestaDettaglio[]
  usaTimbri: boolean
  ritardi: RitardoItem[]
  periodo: string
  inizioPeriodo: string
  finePeriodo: string
  rangeLabel: string
}

interface Preventivo { id: string; tipo: string | null; totale: number; status: string; createdAt: string }

type Periodo = 'settimana' | 'mese' | 'anno'
type TabAnalytics = 'servizi' | 'tavoli' | 'ordini' | 'personale'
type ExpandedCard = 'giorni' | 'ore' | 'ferie' | 'malattie' | 'permessi' | 'preferenze' | 'ritardi' | 'straordinari' | null

// ── MiniCalendario ────────────────────────────────────────────────────────────

const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const GIORNI_BREVI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
const MESI: Record<string, string> = {
  '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'Mag', '06': 'Giu', '07': 'Lug', '08': 'Ago',
  '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic',
}

function spostaRiferimento(rif: Date, periodo: Periodo, direzione: 1 | -1): Date {
  const d = new Date(rif)
  if (periodo === 'settimana') d.setDate(d.getDate() + direzione * 7)
  else if (periodo === 'mese') d.setMonth(d.getMonth() + direzione)
  else d.setFullYear(d.getFullYear() + direzione)
  return d
}

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
          const attivo = periodo === 'mese'
            ? d.getFullYear() === riferimento.getFullYear() && d.getMonth() === riferimento.getMonth()
            : (() => {
                const lun = new Date(riferimento)
                lun.setDate(riferimento.getDate() - ((riferimento.getDay() + 6) % 7))
                const dom = new Date(lun); dom.setDate(lun.getDate() + 6)
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

// ── AnalyticsPage ─────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  // data client-side: default 11 (dicembre) così tutti i mesi sono cliccabili in SSR,
  // poi useEffect la corregge al valore reale del browser
  const [OGGI_ANNO, setOggiAnno] = useState(new Date().getFullYear())
  const [OGGI_MESE, setOggiMese] = useState(11)
  useEffect(() => {
    const d = new Date()
    setOggiAnno(d.getFullYear())
    setOggiMese(d.getMonth())
  }, [])

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
  const [dettaglioDipId, setDettaglioDipId] = useState<string | null>(null)
  const [dettaglio, setDettaglio] = useState<DettaglioDip | null>(null)
  const [loadingDett, setLoadingDett] = useState(false)
  const [dettaglioPeriodo, setDettaglioPeriodo] = useState<Periodo>('mese')
  const [dettaglioRif, setDettaglioRif] = useState<Date>(new Date())
  const [fonteDettaglio, setFonteDettaglio] = useState<'turni' | 'cartellino'>('turni')
  const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null)
  const [dettaglioCalAperto, setDettaglioCalAperto] = useState(false)

  // Modal sezione dettaglio
  const [modalSezione, setModalSezione] = useState<'turni' | 'ferie' | 'malattia' | 'permesso' | null>(null)

  // Modal PDF
  const [pdfModal, setPdfModal] = useState(false)
  const [pdfAnno, setPdfAnno] = useState(new Date().getFullYear())
  const [pdfMese, setPdfMese] = useState(new Date().getMonth()) // 0-indexed
  const [pdfFonte, setPdfFonte] = useState<'turni' | 'cartellino'>('turni')
  const [pdfLoading, setPdfLoading] = useState(false)

  async function scaricaPdfConScelta() {
    if (!dettaglioDipId || !dettaglio) return
    setPdfLoading(true)
    const rifStr = `${pdfAnno}-${String(pdfMese + 1).padStart(2, '0')}-01`
    try {
      const res = await fetch(`/api/analytics/staff?dipendenteId=${dettaglioDipId}&periodo=mese&riferimento=${rifStr}`, { credentials: 'include' })
      const d: DettaglioDip = await res.json()
      const pg = pdfFonte === 'cartellino' ? d.timbraturePerGiorno : d.turniPerGiorno
      scaricaPdf(dettaglio.dip.nome, dettaglio.dip.ruolo, d.rangeLabel, 'mese', pg, d.inizioPeriodo, d.ritardi)
      setPdfModal(false)
    } finally {
      setPdfLoading(false)
    }
  }

  function fetchDettaglio(dipId: string, p: Periodo, rif: Date) {
    setLoadingDett(true)
    setDettaglio(null)
    setExpandedCard(null)
    const rifStr = `${rif.getFullYear()}-${String(rif.getMonth() + 1).padStart(2, '0')}-${String(rif.getDate()).padStart(2, '0')}`
    fetch(`/api/analytics/staff?dipendenteId=${dipId}&periodo=${p}&riferimento=${rifStr}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDettaglio(d); setLoadingDett(false) })
  }

  function apriDettaglio(dipId: string) {
    setDettaglioDipId(dipId)
    setDettaglioPeriodo('mese')
    const rif = new Date()
    setDettaglioRif(rif)
    fetchDettaglio(dipId, 'mese', rif)
  }

  function cambiaDettaglioPeriodo(p: Periodo) {
    if (!dettaglioDipId) return
    setDettaglioPeriodo(p)
    const rif = new Date()
    setDettaglioRif(rif)
    fetchDettaglio(dettaglioDipId, p, rif)
  }

  function cambiaDettaglioRif(rif: Date) {
    if (!dettaglioDipId) return
    setDettaglioRif(rif)
    fetchDettaglio(dettaglioDipId, dettaglioPeriodo, rif)
  }

  const ora = new Date()
  const isOggi = riferimento.toDateString() === ora.toDateString()
  const prossimoInizio = spostaRiferimento(riferimento, periodo, 1)
  const isFuturo = (() => {
    if (periodo === 'settimana') { const lun = new Date(prossimoInizio); lun.setDate(prossimoInizio.getDate() - ((prossimoInizio.getDay() + 6) % 7)); return lun > ora }
    if (periodo === 'mese') return new Date(prossimoInizio.getFullYear(), prossimoInizio.getMonth(), 1) > ora
    return prossimoInizio.getFullYear() > ora.getFullYear()
  })()

  const dettaglioProssimo = spostaRiferimento(dettaglioRif, dettaglioPeriodo, 1)
  const dettaglioIsFuturo = (() => {
    if (dettaglioPeriodo === 'settimana') { const lun = new Date(dettaglioProssimo); lun.setDate(dettaglioProssimo.getDate() - ((dettaglioProssimo.getDay() + 6) % 7)); return lun > ora }
    if (dettaglioPeriodo === 'mese') return new Date(dettaglioProssimo.getFullYear(), dettaglioProssimo.getMonth(), 1) > ora
    return dettaglioProssimo.getFullYear() > ora.getFullYear()
  })()

  useEffect(() => {
    setLoading(true)
    fetch(`/api/analytics?periodo=${periodo}&riferimento=${riferimento.toISOString()}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [periodo, riferimento])

  useEffect(() => {
    fetch('/api/analytics/staff', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setStaff(d.staff ?? []); setMesiDisponibili(d.mesiDisponibili ?? []); setMeseSel(d.mese ?? '') })
  }, [])

  useEffect(() => {
    if (!meseSel) return
    setLoadingStaff(true)
    fetch(`/api/analytics/staff?mese=${meseSel}&fonte=${fonteStaff}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setStaff(d.staff ?? []); setLoadingStaff(false) })
  }, [fonteStaff, meseSel])

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
    return mese
  }
  function bucketFull(mese: string) {
    if (periodo === 'anno') return `${MESI[mese.split('-')[1]]} ${mese.split('-')[0]}`
    if (periodo === 'settimana') return mese
    return `${mese} ${new Date().toLocaleDateString('it-IT', { month: 'long' })}`
  }

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

  // ── Dettaglio calcolato client-side ──────────────────────────────────────
  const perGiornoDettaglio = dettaglio
    ? (fonteDettaglio === 'cartellino' ? dettaglio.timbraturePerGiorno : dettaglio.turniPerGiorno)
    : {}

  const oreLavorateDettaglio = Math.round(
    Object.values(perGiornoDettaglio).flat().reduce((s, t) => s + t.ore, 0) * 10
  ) / 10

  const giorniLavoratiDettaglio = Object.keys(perGiornoDettaglio).length

  const ritardiCount = dettaglio ? dettaglio.ritardi.filter(r => r.ritardoMin > 2).length : 0
  const ritardiMin = dettaglio ? dettaglio.ritardi.filter(r => r.ritardoMin > 2).reduce((s, r) => s + r.ritardoMin, 0) : 0
  const straordCount = dettaglio ? dettaglio.ritardi.filter(r => r.straordinarioMin > 5).length : 0
  const straordMin = dettaglio ? dettaglio.ritardi.filter(r => r.straordinarioMin > 5).reduce((s, r) => s + r.straordinarioMin, 0) : 0

  const richiesteDettaglio = dettaglio?.richieste ?? []
  const ferieR = richiesteDettaglio.filter(r => r.tipo === 'ferie')
  const malattieR = richiesteDettaglio.filter(r => r.tipo === 'malattia')
  const permessiR = richiesteDettaglio.filter(r => r.tipo === 'permesso')
  const preferenzeR = richiesteDettaglio.filter(r => r.tipo === 'preferenza_orario')

  // Per anno: breakdown per mese
  function perMeseBreakdown(pg: PerGiorno) {
    const acc: Record<string, { giorni: number; ore: number }> = {}
    Object.entries(pg).forEach(([data, ts]) => {
      const m = data.substring(0, 7)
      if (!acc[m]) acc[m] = { giorni: 0, ore: 0 }
      acc[m].giorni++
      acc[m].ore += ts.reduce((s, t) => s + t.ore, 0)
    })
    return acc
  }

  // Per settimana: 7 giorni fissi
  function giorniSettimana(inizioPeriodo: string) {
    const [y, m, d] = inizioPeriodo.split('-').map(Number)
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(y, m - 1, d + i)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      return { key, dt }
    })
  }

  function ExpandableCard({ id, label, value, color = 'text-electric-blue', bg = 'bg-electric-blue/10', children }: {
    id: ExpandedCard; label: string; value: string | number; color?: string; bg?: string; children: React.ReactNode
  }) {
    const isOpen = expandedCard === id
    return (
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
        <button onClick={() => setExpandedCard(isOpen ? null : id)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-mist transition-colors">
          <span className="text-sm font-semibold text-ink-navy/60">{label}</span>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${color}`}>{value}</span>
            <svg className={`w-4 h-4 text-ink-navy/30 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </div>
        </button>
        {isOpen && <div className={`border-t border-ink-navy/8 ${bg} bg-opacity-30`}>{children}</div>}
      </div>
    )
  }

  function StatusBadge({ status }: { status: string }) {
    const cfg: Record<string, string> = {
      approvata: 'bg-green-100 text-green-700',
      rifiutata: 'bg-red-100 text-red-500',
      in_attesa: 'bg-amber-100 text-amber-600',
    }
    const label: Record<string, string> = { approvata: 'Approvata', rifiutata: 'Rifiutata', in_attesa: 'In attesa' }
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg[status] ?? 'bg-mist text-ink-navy/50'}`}>{label[status] ?? status}</span>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-navy">Analytics</h1>
        <p className="text-ink-navy/50 text-sm mt-0.5">Statistiche sull&apos;andamento del tuo locale</p>
      </div>

      <div className="flex gap-1 bg-mist rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTabAnalytics(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tabAnalytics === t.key ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SERVIZI ── */}
      {tabAnalytics === 'servizi' && (
        <div className="space-y-6">
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
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 bg-white text-ink-navy/50 hover:bg-mist transition-colors text-lg disabled:opacity-30">›</button>
                {!isOggi && <button onClick={() => setRiferimento(new Date())} className="text-xs text-electric-blue hover:underline ml-1">Oggi</button>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Prenotazioni totali', val: data.totaleApp, sub: periodo === 'settimana' ? 'questa settimana' : periodo === 'mese' ? 'questo mese' : 'ultimi 12 mesi', bold: 'text-ink-navy' },
              { label: 'Tasso no-show', val: `${data.tassoNoShow}%`, sub: `${data.noShow} no-show · ${data.cancellati} cancellate`, bold: data.tassoNoShow > 15 ? 'text-red-500' : data.tassoNoShow > 8 ? 'text-amber-500' : 'text-green-500' },
              { label: 'Giorno più gettonato', val: data.giornoTop ?? '—', sub: 'giorno della settimana', bold: 'text-electric-blue' },
              { label: 'Orario più richiesto', val: data.oraTop ?? '—', sub: 'fascia oraria', bold: 'text-electric-blue' },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
                <p className="text-xs text-ink-navy/50 uppercase tracking-wide">{k.label}</p>
                <p className={`text-3xl font-bold mt-1 ${k.bold}`}>{k.val}</p>
                <p className="text-xs text-ink-navy/35 mt-1">{k.sub}</p>
              </div>
            ))}
          </div>

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
                      <div className="w-full bg-red-300" style={{ height: `${hNS}px` }} />
                      <div className="w-full bg-orange-300" style={{ height: `${hCanc}px` }} />
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

          <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-ink-navy/8"><h2 className="text-base font-semibold text-ink-navy">Dettaglio mensile</h2></div>
            <table className="w-full text-sm">
              <thead className="bg-mist text-ink-navy/50 text-xs uppercase tracking-wide">
                <tr><th className="text-left px-6 py-3">Periodo</th><th className="text-right px-4 py-3">Totale</th><th className="text-right px-4 py-3">Completate</th><th className="text-right px-4 py-3">Cancellate</th><th className="text-right px-4 py-3">No-show</th></tr>
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

      {/* ── TAVOLI ── */}
      {tabAnalytics === 'tavoli' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
              <p className="text-xs text-ink-navy/50 uppercase tracking-wide">Revenue totale</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">€{data.perMese.reduce((s, m) => s + m.revenue, 0).toLocaleString('it-IT')}</p>
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
                  const h = Math.round((m.revenue / maxRevenue) * 130)
                  return (
                    <div key={m.mese} className="flex-1 flex flex-col items-center gap-1">
                      {m.revenue > 0 && <span className="text-xs text-ink-navy/50 font-medium">€{m.revenue.toLocaleString('it-IT')}</span>}
                      <div className="w-full flex flex-col justify-end" style={{ height: '130px' }}>
                        <div className="w-full bg-emerald-500 rounded-t-lg" style={{ height: `${Math.max(h, m.revenue > 0 ? 4 : 0)}px` }} />
                      </div>
                      <span className="text-xs text-ink-navy/35">{bucketLabel(m.mese)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-12 text-center shadow-sm">
              <p className="text-ink-navy/35 text-sm">Nessun dato revenue disponibile</p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-ink-navy/8"><h2 className="text-base font-semibold text-ink-navy">Dettaglio revenue mensile</h2></div>
            <table className="w-full text-sm">
              <thead className="bg-mist text-ink-navy/50 text-xs uppercase tracking-wide">
                <tr><th className="text-left px-6 py-3">Periodo</th><th className="text-right px-4 py-3">Prenotazioni</th><th className="text-right px-6 py-3">Revenue</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...data.perMese].reverse().map(m => (
                  <tr key={m.mese} className="hover:bg-mist">
                    <td className="px-6 py-3 font-medium text-ink-navy">{bucketFull(m.mese)}</td>
                    <td className="text-right px-4 py-3 text-ink-navy/70">{m.totale}</td>
                    <td className="text-right px-6 py-3 text-emerald-600 font-medium">{m.revenue > 0 ? `€${m.revenue.toLocaleString('it-IT')}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ORDINI ── */}
      {tabAnalytics === 'ordini' && (
        <div className="space-y-6">
          {loadingOrdini ? (
            <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Ordini asporto', val: ordiniList.length, sub: 'totale ordini', color: 'text-ink-navy' },
                  { label: 'Revenue asporto', val: `€${totOrdini.toLocaleString('it-IT')}`, sub: 'valore totale', color: 'text-emerald-600' },
                  { label: 'Delivery', val: deliveryList.length, sub: 'totale delivery', color: 'text-ink-navy' },
                  { label: 'Revenue delivery', val: `€${totDelivery.toLocaleString('it-IT')}`, sub: 'valore totale', color: 'text-emerald-600' },
                ].map(k => (
                  <div key={k.label} className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
                    <p className="text-xs text-ink-navy/50 uppercase tracking-wide">{k.label}</p>
                    <p className={`text-3xl font-bold mt-1 ${k.color}`}>{k.val}</p>
                    <p className="text-xs text-ink-navy/35 mt-1">{k.sub}</p>
                  </div>
                ))}
              </div>
              {preventivi.filter(p => p.tipo === 'ordine' || p.tipo === 'delivery').length === 0 ? (
                <div className="bg-white rounded-2xl border border-ink-navy/10 p-12 text-center shadow-sm">
                  <p className="text-ink-navy/35 text-sm">Nessun ordine o delivery ancora</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-ink-navy/8"><h2 className="text-base font-semibold text-ink-navy">Ultimi ordini</h2></div>
                  <table className="w-full text-sm">
                    <thead className="bg-mist text-ink-navy/50 text-xs uppercase tracking-wide">
                      <tr><th className="text-left px-6 py-3">Data</th><th className="text-left px-4 py-3">Tipo</th><th className="text-right px-4 py-3">Status</th><th className="text-right px-6 py-3">Totale</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preventivi.filter(p => p.tipo === 'ordine' || p.tipo === 'delivery').slice(0, 30).map(p => (
                        <tr key={p.id} className="hover:bg-mist">
                          <td className="px-6 py-3 text-ink-navy/70">{new Date(p.createdAt).toLocaleDateString('it-IT')}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.tipo === 'delivery' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {p.tipo === 'delivery' ? 'Delivery' : 'Asporto'}
                            </span>
                          </td>
                          <td className="text-right px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.status === 'confermato' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-600'}`}>
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

      {/* ── PERSONALE ── */}
      {tabAnalytics === 'personale' && !dettaglioDipId && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-ink-navy">Statistiche staff</h2>
              <p className="text-ink-navy/50 text-sm mt-0.5">Clicca su un dipendente per il dettaglio</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex bg-mist rounded-lg p-0.5">
                {(['turni', 'cartellino'] as const).map(f => (
                  <button key={f} onClick={() => setFonteStaff(f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${fonteStaff === f ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy'}`}>
                    {f === 'turni' ? 'Turni' : 'Cartellino'}
                  </button>
                ))}
              </div>
              {mesiDisponibili.length > 0 && (
                <select value={meseSel} onChange={e => cambiaMe(e.target.value)}
                  className="text-sm border border-ink-navy/10 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric-blue bg-white">
                  {mesiDisponibili.map(m => (
                    <option key={m} value={m}>{MESI_LABEL[m.split('-')[1]]} {m.split('-')[0]}</option>
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
                <div key={dip.id} onClick={() => apriDettaglio(dip.id)}
                  className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-4 cursor-pointer hover:border-electric-blue/40 hover:shadow-md transition-all">
                  <div>
                    <p className="font-bold text-ink-navy">{dip.nome}</p>
                    {dip.ruolo && <p className="text-xs text-ink-navy/35">{dip.ruolo}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { val: dip.oreLavorate, label: 'ore' },
                      { val: dip.giorniLavorati, label: 'giorni' },
                      { val: dip.ritardi.count, label: 'ritardi', red: dip.ritardi.count > 0 },
                    ].map(k => (
                      <div key={k.label} className={`text-center rounded-xl py-2 ${'red' in k && k.red ? 'bg-red-50' : 'bg-electric-blue/10'}`}>
                        <p className={`text-lg font-bold ${'red' in k && k.red ? 'text-red-500' : 'text-electric-blue'}`}>{k.val}</p>
                        <p className={`text-[10px] font-medium ${'red' in k && k.red ? 'text-red-400' : 'text-electric-blue'}`}>{k.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: 'Ferie', tot: dip.ferie.totale, app: dip.ferie.approvate, color: 'text-blue-600' },
                      { label: 'Malattie', tot: dip.malattie.totale, app: dip.malattie.approvate, color: 'text-red-500' },
                      { label: 'Permessi', tot: dip.permessi.totale, app: dip.permessi.approvati, color: 'text-amber-600' },
                    ].filter(r => r.tot > 0).map(r => (
                      <div key={r.label} className="flex items-center justify-between text-sm">
                        <span className="text-ink-navy/50">{r.label}</span>
                        <span className={`font-semibold ${r.color}`}>{r.app}/{r.tot} <span className="text-ink-navy/35 font-normal text-xs">approv.</span></span>
                      </div>
                    ))}
                    {dip.ferie.totale === 0 && dip.malattie.totale === 0 && dip.permessi.totale === 0 && (
                      <p className="text-xs text-ink-navy/25 italic">Nessuna richiesta questo mese</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DETTAGLIO DIPENDENTE (inline, full-width) ── */}
      {tabAnalytics === 'personale' && dettaglioDipId && (
        <div className="space-y-6">

            {loadingDett && !dettaglio ? (
              <div className="py-20 text-center text-ink-navy/35">Caricamento...</div>
            ) : dettaglio && (() => {
              const pg = perGiornoDettaglio
              const mbk = perMeseBreakdown(pg)
              const gs = dettaglio.periodo === 'settimana' ? giorniSettimana(dettaglio.inizioPeriodo) : []

              // ── dati grafici ──────────────────────────────────────────
              const GG_BREVI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

              // barre ore: struttura uniforme per settimana/mese/anno
              type BarItem = { label: string; sublabel?: string; ore: number; presente: boolean }
              let barre: BarItem[] = []

              if (dettaglio.periodo === 'settimana') {
                barre = gs.map(({ key, dt }) => {
                  const ts = pg[key]
                  const ore = ts ? ts.reduce((s, t) => s + t.ore, 0) : 0
                  return { label: GG_BREVI[dt.getDay()], sublabel: String(dt.getDate()), ore, presente: !!ts }
                })
              } else if (dettaglio.periodo === 'mese') {
                // tutti i giorni del mese selezionato
                const anno = dettaglioRif.getFullYear()
                const meseIdx = dettaglioRif.getMonth()
                const giorniNelMese = new Date(anno, meseIdx + 1, 0).getDate()
                barre = Array.from({ length: giorniNelMese }, (_, i) => {
                  const giorno = i + 1
                  const key = `${anno}-${String(meseIdx + 1).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
                  const ts = pg[key]
                  const ore = ts ? ts.reduce((s, t) => s + t.ore, 0) : 0
                  return { label: String(giorno), ore, presente: !!ts }
                })
              } else {
                // tutti e 12 i mesi dell'anno selezionato
                const anno = dettaglioRif.getFullYear()
                barre = Array.from({ length: 12 }, (_, i) => {
                  const mm = String(i + 1).padStart(2, '0')
                  const key = `${anno}-${mm}`
                  const v = mbk[key]
                  return {
                    label: Object.values(MESI_LABEL)[i].slice(0, 3),
                    ore: v ? Math.round(v.ore * 10) / 10 : 0,
                    presente: !!v && v.giorni > 0,
                  }
                })
              }

              const maxOre = Math.max(...barre.map(b => b.ore), 1)

              // barre ritardi: una barra per ogni turno (ritardo vs straordinario)
              const ritardiConTimbro = dettaglio.ritardi.filter(r => r.entrataEff !== null)
              const maxRitMin = Math.max(...ritardiConTimbro.map(r => Math.abs(r.ritardoMin)), ...ritardiConTimbro.map(r => Math.abs(r.straordinarioMin)), 1)

              return (
                <div className="space-y-6">

                  {/* ── breadcrumb + controlli ── */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => { setDettaglioDipId(null); setDettaglio(null) }}
                        className="flex items-center gap-1.5 text-sm text-ink-navy/50 hover:text-ink-navy transition-colors">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                        Personale
                      </button>
                      <span className="text-ink-navy/25">/</span>
                      <span className="text-sm font-semibold text-ink-navy">{dettaglio.dip.nome}</span>
                      {dettaglio.dip.ruolo && <span className="text-xs text-ink-navy/35 bg-mist px-2 py-0.5 rounded-full">{dettaglio.dip.ruolo}</span>}
                    </div>
                    <button onClick={() => { setPdfAnno(OGGI_ANNO); setPdfMese(OGGI_MESE); setPdfFonte(fonteDettaglio); setPdfModal(true) }}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-electric-blue text-white font-semibold hover:bg-electric-blue/90 transition-colors">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Scarica PDF
                    </button>
                  </div>

                  {/* ── Selettore periodo ── */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex rounded-xl border border-ink-navy/10 bg-mist overflow-hidden text-sm font-medium">
                      {(['settimana', 'mese', 'anno'] as Periodo[]).map(p => (
                        <button key={p} onClick={() => cambiaDettaglioPeriodo(p)}
                          className={`px-4 py-2 capitalize transition-colors ${dettaglioPeriodo === p ? 'bg-electric-blue text-white' : 'text-ink-navy/50 hover:bg-white/60'}`}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 relative">
                      <button onClick={() => cambiaDettaglioRif(spostaRiferimento(dettaglioRif, dettaglioPeriodo, -1))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 bg-white text-ink-navy/50 hover:bg-mist text-lg">‹</button>
                      <button onClick={() => setDettaglioCalAperto(v => !v)}
                        className="text-sm font-medium text-ink-navy/70 min-w-[180px] text-center px-3 py-1.5 rounded-lg border border-ink-navy/10 bg-white hover:bg-mist">
                        {dettaglio.rangeLabel}
                      </button>
                      {dettaglioCalAperto && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setDettaglioCalAperto(false)} />
                          <MiniCalendario periodo={dettaglioPeriodo} riferimento={dettaglioRif}
                            onScegli={d => { cambiaDettaglioRif(d); setDettaglioCalAperto(false) }}
                            onChiudi={() => setDettaglioCalAperto(false)} />
                        </>
                      )}
                      <button onClick={() => cambiaDettaglioRif(spostaRiferimento(dettaglioRif, dettaglioPeriodo, 1))}
                        disabled={dettaglioIsFuturo}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 bg-white text-ink-navy/50 hover:bg-mist text-lg disabled:opacity-30">›</button>
                      {loadingDett && <span className="text-xs text-ink-navy/30 ml-2">aggiornamento...</span>}
                    </div>
                    <div className="flex bg-mist rounded-lg p-0.5 ml-auto">
                      {(['turni', 'cartellino'] as const).map(f => (
                        <button key={f} onClick={() => setFonteDettaglio(f)}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${fonteDettaglio === f ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/40 hover:text-ink-navy'}`}>
                          {f === 'turni' ? 'Turni' : 'Cartellino'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── KPI hero row ── */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: 'Giorni lavorati', val: giorniLavoratiDettaglio, unit: 'giorni', color: 'text-ink-navy', bg: 'bg-mist' },
                      { label: 'Ore totali', val: oreLavorateDettaglio, unit: 'ore', color: 'text-electric-blue', bg: 'bg-electric-blue/8' },
                      { label: 'Ritardi', val: ritardiCount, unit: ritardiCount === 1 ? 'ritardo' : 'ritardi', color: ritardiCount > 0 ? 'text-red-500' : 'text-green-500', bg: ritardiCount > 0 ? 'bg-red-50' : 'bg-green-50' },
                      { label: 'Straordinari', val: straordCount, unit: straordCount === 1 ? 'turno' : 'turni', color: straordCount > 0 ? 'text-electric-blue' : 'text-ink-navy/25', bg: 'bg-electric-blue/8' },
                    ].map(k => (
                      <div key={k.label} className={`${k.bg} rounded-2xl p-4`}>
                        <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wide">{k.label}</p>
                        <p className={`text-3xl font-bold mt-1 ${k.color}`}>{k.val}</p>
                        <p className="text-xs text-ink-navy/35 mt-0.5">{k.unit}</p>
                      </div>
                    ))}
                  </div>

                  {/* ── Grafico ore lavorate ── */}
                  <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-semibold text-ink-navy">Ore lavorate</p>
                        <p className="text-xs text-ink-navy/40 mt-0.5">{dettaglio.rangeLabel} · da {fonteDettaglio === 'turni' ? 'turni' : 'cartellino'}</p>
                      </div>
                    </div>
                    {fonteDettaglio === 'cartellino' && Object.keys(dettaglio.timbraturePerGiorno).length === 0 && (
                      <p className="text-xs text-amber-500 mb-2">Nessun timbro registrato nel periodo</p>
                    )}
                    {/* Barre */}
                    <div className="mt-4 flex items-end gap-1.5" style={{ height: 120 }}>
                      {barre.map((b, i) => {
                        const h = Math.round((b.ore / maxOre) * 96)
                        const barH = Math.max(h, b.presente ? 4 : 2)
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1" style={{ height: 130 }}>
                            <div className="w-full flex flex-col items-center justify-end" style={{ height: 108 }}>
                              {b.ore > 0 && (
                                <span className="text-[9px] font-bold text-electric-blue leading-none mb-0.5">{b.ore}h</span>
                              )}
                              <div
                                className={`w-full rounded-t-md ${b.presente ? 'bg-electric-blue' : 'bg-ink-navy/8'}`}
                                style={{ height: `${barH}px` }}
                              />
                            </div>
                            <span className="text-[10px] font-medium text-ink-navy/40 leading-none">{b.label}</span>
                            {b.sublabel && <span className="text-[9px] text-ink-navy/25 leading-none">{b.sublabel}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── Layout 2 colonne: ritardi | assenze ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                    {/* Grafico ritardi & straordinari */}
                    <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5">
                      <p className="text-sm font-semibold text-ink-navy">Ritardi & Straordinari</p>
                      <p className="text-xs text-ink-navy/40 mt-0.5">Minuti rispetto all&apos;orario del turno</p>

                      {!dettaglio.usaTimbri ? (
                        <div className="mt-4 flex items-center gap-2 bg-mist rounded-xl p-3">
                          <svg className="w-4 h-4 text-ink-navy/30 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          <p className="text-xs text-ink-navy/50">Attiva il QR timbratura per calcolare ritardi e straordinari.</p>
                        </div>
                      ) : ritardiConTimbro.length === 0 ? (
                        <div className="mt-4 text-center py-6">
                          <p className="text-ink-navy/25 text-sm">Nessun timbro nel periodo</p>
                        </div>
                      ) : (
                        <>
                          {/* Barre ritardi: asse centrale, sx=ritardo, dx=straordinario */}
                          <div className="mt-5 space-y-2">
                            {ritardiConTimbro.slice(0, 10).map((r, i) => {
                              const ritH = Math.round((Math.min(Math.abs(r.ritardoMin), 60) / 60) * 80)
                              const strH = Math.round((Math.min(Math.abs(r.straordinarioMin), 60) / 60) * 80)
                              const isRit = r.ritardoMin > 2
                              const isStr = r.straordinarioMin > 5
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="w-10 text-right text-ink-navy/40 flex-shrink-0">{fmtData(r.data)}</span>
                                  {/* barra ritardo (cresce a sinistra) */}
                                  <div className="flex-1 flex justify-end">
                                    <div className={`h-5 rounded-l-md flex items-center justify-end pr-1 transition-all ${isRit ? 'bg-red-100' : 'bg-ink-navy/5'}`}
                                      style={{ width: `${Math.max(ritH, isRit ? 8 : 4)}%` }}>
                                      {isRit && r.ritardoMin > 10 && <span className="text-[10px] font-bold text-red-500">{r.ritardoMin}m</span>}
                                    </div>
                                  </div>
                                  {/* punto centrale */}
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isRit ? 'bg-red-400' : isStr ? 'bg-electric-blue' : 'bg-green-400'}`} />
                                  {/* barra straordinario (cresce a destra) */}
                                  <div className="flex-1 flex justify-start">
                                    <div className={`h-5 rounded-r-md flex items-center pl-1 transition-all ${isStr ? 'bg-electric-blue/20' : 'bg-ink-navy/5'}`}
                                      style={{ width: `${Math.max(strH, isStr ? 8 : 4)}%` }}>
                                      {isStr && r.straordinarioMin > 10 && <span className="text-[10px] font-bold text-electric-blue">{r.straordinarioMin}m</span>}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                            {ritardiConTimbro.length > 10 && (
                              <p className="text-xs text-center text-ink-navy/30 pt-1">+{ritardiConTimbro.length - 10} turni non mostrati</p>
                            )}
                          </div>
                          <div className="flex justify-between mt-3 text-[10px] text-ink-navy/35 font-medium">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-200 inline-block"/>Ritardo</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-electric-blue/30 inline-block"/>Straordinario</span>
                          </div>
                          {ritardiMin > 0 && (
                            <p className="mt-2 text-xs text-red-500 font-medium">Ritardo totale: {minToLabel(ritardiMin)}</p>
                          )}
                          {straordMin > 0 && (
                            <p className="text-xs text-electric-blue font-medium">Straordinario totale: {minToLabel(straordMin)}</p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Assenze */}
                    <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5">
                      <p className="text-sm font-semibold text-ink-navy">Assenze & Richieste</p>
                      <p className="text-xs text-ink-navy/40 mt-0.5">Nel periodo selezionato</p>

                      {richiesteDettaglio.length === 0 ? (
                        <div className="mt-4 text-center py-6">
                          <p className="text-ink-navy/25 text-sm">Nessuna richiesta</p>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-2">
                          {[
                            { tipo: 'ferie' as const, label: 'Ferie', items: ferieR, dot: 'bg-blue-500' },
                            { tipo: 'malattia' as const, label: 'Malattia', items: malattieR, dot: 'bg-red-400' },
                            { tipo: 'permesso' as const, label: 'Permessi', items: permessiR, dot: 'bg-amber-400' },
                          ].filter(t => t.items.length > 0).map(t => (
                            <button key={t.tipo} onClick={() => setModalSezione(t.tipo)}
                              className="w-full flex items-center justify-between px-4 py-3 bg-mist rounded-xl hover:bg-electric-blue/8 transition-colors text-left">
                              <div className="flex items-center gap-2.5">
                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.dot}`} />
                                <span className="text-sm font-semibold text-ink-navy">{t.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-ink-navy">{t.items.length}</span>
                                <svg className="w-4 h-4 text-ink-navy/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Dettaglio turni ── */}
                  <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                    <button onClick={() => setModalSezione('turni')}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-mist transition-colors">
                      <div className="text-left">
                        <p className="text-sm font-semibold text-ink-navy">Dettaglio turni</p>
                        <p className="text-xs text-ink-navy/40 mt-0.5">{giorniLavoratiDettaglio} giorni · {oreLavorateDettaglio}h totali</p>
                      </div>
                      <svg className="w-4 h-4 text-ink-navy/30 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                  </div>

                  {giorniLavoratiDettaglio === 0 && richiesteDettaglio.length === 0 && (
                    <div className="text-center py-8 bg-white rounded-2xl border border-ink-navy/10">
                      <p className="text-ink-navy/30 text-sm">Nessun dato per questo periodo</p>
                    </div>
                  )}

                  {/* ── Modal sezione (turni / assenze) ── */}
                  {modalSezione && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-navy/40 p-0 sm:p-4"
                      onClick={() => setModalSezione(null)}>
                      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-navy/8 flex-shrink-0">
                          <div>
                            <p className="text-base font-bold text-ink-navy">
                              {modalSezione === 'turni' ? 'Dettaglio turni' :
                               modalSezione === 'ferie' ? 'Ferie' :
                               modalSezione === 'malattia' ? 'Malattia' :
                               modalSezione === 'permesso' ? 'Permessi' : 'Preferenze orario'}
                            </p>
                            {modalSezione === 'turni' && (
                              <p className="text-xs text-ink-navy/40 mt-0.5">{dettaglio.rangeLabel}</p>
                            )}
                          </div>
                          <button onClick={() => setModalSezione(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-mist text-ink-navy/50 hover:text-ink-navy transition-colors text-lg leading-none">✕</button>
                        </div>
                        <div className="overflow-y-auto divide-y divide-ink-navy/6">
                          {modalSezione === 'turni' ? (
                            <>
                              {dettaglio.periodo === 'settimana' ? (
                                gs.map(({ key, dt }) => {
                                  const ts = pg[key]
                                  return (
                                    <div key={key} className={`flex items-center justify-between px-5 py-3.5 text-sm ${ts ? '' : 'opacity-35'}`}>
                                      <span className="text-ink-navy/60 w-28">{GG_BREVI[dt.getDay()]} {dt.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
                                      {ts ? (
                                        <>
                                          <span className="flex-1 text-ink-navy font-medium">{ts.map(t => `${t.oraInizio}–${t.oraFine}`).join(', ')}</span>
                                          <span className="text-electric-blue font-bold w-12 text-right">{ts.reduce((s, t) => s + t.ore, 0)}h</span>
                                        </>
                                      ) : <span className="text-ink-navy/25">Riposo</span>}
                                    </div>
                                  )
                                })
                              ) : dettaglio.periodo === 'anno' ? (
                                Object.entries(mbk).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => (
                                  <div key={m} className="flex items-center justify-between px-5 py-3.5 text-sm">
                                    <span className="text-ink-navy/60">{MESI_LABEL[m.split('-')[1]]} {m.split('-')[0]}</span>
                                    <span className="text-ink-navy/50">{v.giorni} giorni</span>
                                    <span className="text-electric-blue font-bold">{Math.round(v.ore * 10) / 10}h</span>
                                  </div>
                                ))
                              ) : (
                                Object.entries(pg).sort(([a], [b]) => a.localeCompare(b)).map(([data, ts]) => (
                                  <div key={data} className="flex items-center justify-between px-5 py-3.5 text-sm">
                                    <span className="text-ink-navy/60 w-28">{fmtData(data)}</span>
                                    <span className="flex-1 text-ink-navy font-medium">{ts.map(t => `${t.oraInizio}–${t.oraFine}`).join(', ')}</span>
                                    <span className="text-electric-blue font-bold w-12 text-right">{ts.reduce((s, t) => s + t.ore, 0)}h</span>
                                  </div>
                                ))
                              )}
                              {Object.keys(pg).length === 0 && (
                                <p className="px-5 py-6 text-sm text-ink-navy/30 italic text-center">Nessun turno registrato in questo periodo.</p>
                              )}
                            </>
                          ) : (
                            (() => {
                              const tipoItems = modalSezione === 'ferie' ? ferieR :
                                               modalSezione === 'malattia' ? malattieR :
                                               modalSezione === 'permesso' ? permessiR : []
                              return tipoItems.length === 0 ? (
                                <p className="px-5 py-6 text-sm text-ink-navy/30 italic text-center">Nessuna richiesta.</p>
                              ) : tipoItems.map((r, i) => (
                                <div key={i} className="flex items-center justify-between px-5 py-3.5">
                                  <span className="text-sm text-ink-navy/70">{fmtData(r.data)}{r.dataFine && r.dataFine !== r.data ? ` → ${fmtData(r.dataFine)}` : ''}{r.oraInizio ? ` · ${r.oraInizio}–${r.oraFine}` : ''}</span>
                                  <StatusBadge status={r.status} />
                                </div>
                              ))
                            })()
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Modal PDF ── */}
                  {pdfModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-navy/30 p-4"
                      onClick={() => setPdfModal(false)}>
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5"
                        onClick={e => e.stopPropagation()}>

                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-bold text-ink-navy">Scarica PDF</h3>
                          <button onClick={() => setPdfModal(false)} className="text-ink-navy/30 hover:text-ink-navy/60 text-lg leading-none">✕</button>
                        </div>

                        {/* Anno */}
                        <div>
                          <p className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide mb-2">Anno</p>
                          <div className="flex gap-2 flex-wrap">
                            {Array.from({ length: OGGI_ANNO - 2022 }, (_, i) => 2023 + i).map(a => (
                              <button key={a} onClick={() => {
                                setPdfAnno(a)
                                if (a === OGGI_ANNO && pdfMese > OGGI_MESE) setPdfMese(OGGI_MESE)
                              }}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${pdfAnno === a ? 'bg-electric-blue text-white' : 'bg-mist text-ink-navy/60 hover:bg-electric-blue/10'}`}>
                                {a}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Mese */}
                        <div>
                          <p className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide mb-2">Mese</p>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[
                              ['01','Gen'],['02','Feb'],['03','Mar'],['04','Apr'],
                              ['05','Mag'],['06','Giu'],['07','Lug'],['08','Ago'],
                              ['09','Set'],['10','Ott'],['11','Nov'],['12','Dic'],
                            ].map(([mm, label]) => {
                              const mIdx = parseInt(mm) - 1 // 0-indexed
                              const futuro = pdfAnno === OGGI_ANNO && mIdx > OGGI_MESE
                              return (
                                <button key={mm} onClick={() => !futuro && setPdfMese(mIdx)} disabled={futuro}
                                  className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${pdfMese === mIdx ? 'bg-electric-blue text-white' : futuro ? 'text-ink-navy/20 cursor-not-allowed' : 'bg-mist text-ink-navy/60 hover:bg-electric-blue/10'}`}>
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Fonte */}
                        <div>
                          <p className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide mb-2">Calcola da</p>
                          <div className="flex bg-mist rounded-lg p-0.5 w-fit">
                            {(['turni', 'cartellino'] as const).map(f => (
                              <button key={f} onClick={() => setPdfFonte(f)}
                                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${pdfFonte === f ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/40 hover:text-ink-navy'}`}>
                                {f === 'turni' ? 'Turni' : 'Cartellino'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button onClick={scaricaPdfConScelta} disabled={pdfLoading}
                          className="w-full py-2.5 rounded-xl bg-electric-blue text-white text-sm font-bold hover:bg-electric-blue/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                          {pdfLoading ? (
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          )}
                          {pdfLoading ? 'Preparazione...' : `Scarica ${['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][pdfMese]} ${pdfAnno}`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
        </div>
      )}
    </div>
  )
}

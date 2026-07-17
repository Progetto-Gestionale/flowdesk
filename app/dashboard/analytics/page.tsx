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
  richieste: RichiestaDettaglio[],
  opzioni: { includiRitardi: boolean; includiRichieste: boolean },
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

  const ritardiRows = ritardi.filter(r => r.hasTimbro && (r.ritardoMin > 5 || r.straordinarioMin > 5))
  const assenzaRows = ritardi.filter(r => !r.hasTimbro)
  const assenzaHtml = opzioni.includiRitardi && assenzaRows.length > 0 ? `
    <h2 style="font-size:15px;font-weight:700;margin:28px 0 10px;color:#dc2626">Assenze ingiustificate</h2>
    <table>
      <thead><tr><th>Data</th><th>Turno previsto</th></tr></thead>
      <tbody>
        ${assenzaRows.map(r => `
          <tr>
            <td style="color:#dc2626;font-weight:600">${fmtData(r.data)}</td>
            <td style="color:#dc2626">${r.turni.map(t => t.inizio + '–' + t.fine).join(', ')}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : ''
  const ritardiHtml = opzioni.includiRitardi && ritardiRows.length > 0 ? `
    <h2 style="font-size:15px;font-weight:700;margin:28px 0 10px">Ritardi &amp; Straordinari</h2>
    <table>
      <thead><tr><th>Data</th><th>Turni</th><th>Timbri</th><th class="ore">Ritardo</th><th class="ore">Straordinario</th></tr></thead>
      <tbody>
        ${ritardiRows.map(r => `
          <tr>
            <td>${fmtData(r.data)}</td>
            <td>${r.turni.map(t => t.inizio + '–' + t.fine).join(', ')}</td>
            <td>${r.timbri.map(t => t.inizio + '–' + t.fine).join(', ') || '—'}</td>
            <td class="ore" style="color:${r.ritardoMin > 5 ? '#dc2626' : '#16a34a'}">${r.ritardoMin > 5 ? minToLabel(r.ritardoMin) : '—'}</td>
            <td class="ore" style="color:${r.straordinarioMin > 5 ? '#2563eb' : '#6b7280'}">${r.straordinarioMin > 5 ? minToLabel(r.straordinarioMin) : '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:11px;color:#888;margin-top:6px">* Il ritardo include sia entrate tardive che uscite anticipate rispetto al turno previsto.</p>` : ''

  const tipiLabel: Record<string, string> = {
    ferie: 'Ferie', malattia: 'Malattia', permesso: 'Permesso', assenza: 'Assenza',
  }
  const statusLabel: Record<string, string> = {
    approvata: 'Approvata', in_attesa: 'In attesa', rifiutata: 'Rifiutata',
  }
  const richiesteFiltered = richieste.filter(r => ['ferie','malattia','permesso','assenza'].includes(r.tipo))
  const richiesteHtml = opzioni.includiRichieste && richiesteFiltered.length > 0 ? `
    <h2 style="font-size:15px;font-weight:700;margin:28px 0 10px">Assenze &amp; Richieste</h2>
    <table>
      <thead><tr><th>Tipo</th><th>Data</th><th>Stato</th></tr></thead>
      <tbody>
        ${richiesteFiltered.map(r => `
          <tr>
            <td>${tipiLabel[r.tipo] ?? r.tipo}</td>
            <td>${fmtData(r.data)}${r.dataFine && r.dataFine !== r.data ? ' → ' + fmtData(r.dataFine) : ''}${r.oraInizio ? ' · ' + r.oraInizio + '–' + r.oraFine : ''}</td>
            <td>${statusLabel[r.status] ?? r.status}</td>
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
  h2 { font-size: 15px; font-weight: 700; margin: 28px 0 10px; }
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
${assenzaHtml}
${ritardiHtml}
${richiesteHtml}
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
  data: string
  turni: { inizio: string; fine: string }[]
  timbri: { inizio: string; fine: string }[]
  ritardoMin: number
  straordinarioMin: number
  hasTimbro: boolean
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
type TabAnalytics = 'servizi' | 'tavoli' | 'ordini' | 'menu' | 'personale'
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

  // ── nuove analytics avanzate ──
  type PeriodoAdv = 'settimana' | 'mese' | 'anno'
  const [periodoAdv, setPeriodoAdv] = useState<PeriodoAdv>('settimana')

  interface BucketAdv { data: string; incasso: number; ordini: number; coperti: number; asporto: number; delivery: number }
  interface DatiTavoliAdv {
    totaleIncasso: number; totaleOrdini: number; copertiConfermati: number
    spesaMediaPersona: number; tassoNoShow: number; durataMediaMinuti: number
    andamento: BucketAdv[]
  }
  interface DatiOrdiniAdv {
    totaleIncasso: number; totaleOrdini: number; asportoCount: number; deliveryCount: number
    spesaMedia: number; tassoNonConsegnati: number
    andamento: BucketAdv[]; fasceOrarie: { ora: string; count: number }[]
  }
  interface PiattoAdv { id: string; nome: string; quantita: number; incasso: number }
  interface DatiMenuAdv { top10: PiattoAdv[]; bottom10: PiattoAdv[]; totale: number }

  const [datiTavoliAdv, setDatiTavoliAdv] = useState<DatiTavoliAdv | null>(null)
  const [loadingTavoliAdv, setLoadingTavoliAdv] = useState(false)
  const [datiOrdiniAdv, setDatiOrdiniAdv] = useState<DatiOrdiniAdv | null>(null)
  const [loadingOrdiniAdv, setLoadingOrdiniAdv] = useState(false)
  const [datiMenuAdv, setDatiMenuAdv] = useState<DatiMenuAdv | null>(null)
  const [loadingMenuAdv, setLoadingMenuAdv] = useState(false)

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
  const [modalKpi, setModalKpi] = useState<'ritardi' | 'straordinari' | null>(null)

  // Modal PDF
  const [pdfModal, setPdfModal] = useState(false)
  const [pdfAnno, setPdfAnno] = useState(new Date().getFullYear())
  const [pdfMese, setPdfMese] = useState(new Date().getMonth()) // 0-indexed
  const [pdfFonte, setPdfFonte] = useState<'turni' | 'cartellino'>('turni')
  const [pdfIncludiRitardi, setPdfIncludiRitardi] = useState(true)
  const [pdfIncludiRichieste, setPdfIncludiRichieste] = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)

  async function scaricaPdfConScelta() {
    if (!dettaglioDipId || !dettaglio) return
    setPdfLoading(true)
    const rifStr = `${pdfAnno}-${String(pdfMese + 1).padStart(2, '0')}-01`
    try {
      const res = await fetch(`/api/analytics/staff?dipendenteId=${dettaglioDipId}&periodo=mese&riferimento=${rifStr}`, { credentials: 'include' })
      const d: DettaglioDip = await res.json()
      const pg = pdfFonte === 'cartellino' ? d.timbraturePerGiorno : d.turniPerGiorno
      scaricaPdf(dettaglio.dip.nome, dettaglio.dip.ruolo, d.rangeLabel, 'mese', pg, d.inizioPeriodo, d.ritardi, d.richieste, { includiRitardi: pdfIncludiRitardi, includiRichieste: pdfIncludiRichieste })
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
    if (tabAnalytics !== 'personale' || !meseSel) return
    setLoadingStaff(true)
    fetch(`/api/analytics/staff?mese=${meseSel}&fonte=${fonteStaff}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setStaff(d.staff ?? []); setLoadingStaff(false) })
  }, [tabAnalytics]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tabAnalytics !== 'ordini' || preventivi.length > 0) return
    setLoadingOrdini(true)
    fetch('/api/preventivi', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setPreventivi(d.preventivi ?? []); setLoadingOrdini(false) })
  }, [tabAnalytics])

  useEffect(() => {
    if (tabAnalytics !== 'tavoli') return
    setLoadingTavoliAdv(true)
    fetch(`/api/analytics/tavoli?periodo=${periodoAdv}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDatiTavoliAdv(d); setLoadingTavoliAdv(false) })
  }, [tabAnalytics, periodoAdv])

  useEffect(() => {
    if (tabAnalytics !== 'ordini') return
    setLoadingOrdiniAdv(true)
    fetch(`/api/analytics/ordini?periodo=${periodoAdv}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDatiOrdiniAdv(d); setLoadingOrdiniAdv(false) })
  }, [tabAnalytics, periodoAdv])

  useEffect(() => {
    if (tabAnalytics !== 'menu') return
    setLoadingMenuAdv(true)
    fetch(`/api/analytics/menu?periodo=${periodoAdv}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDatiMenuAdv(d); setLoadingMenuAdv(false) })
  }, [tabAnalytics, periodoAdv])

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
    { key: 'menu', label: 'Menu' },
    { key: 'personale', label: 'Personale' },
  ]

  function fmtEur(n: number) {
    return '€' + n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  function fmtDataAdv(s: string) {
    if (periodoAdv === 'anno') return new Date(s + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short' })
    return new Date(s + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  }
  const periodoAdvLabel = periodoAdv === 'settimana' ? 'questa settimana' : periodoAdv === 'mese' ? 'questo mese' : 'ultimi 12 mesi'

  function SelectorPeriodoAdv() {
    return (
      <div className="flex rounded-xl border border-ink-navy/10 bg-white overflow-hidden shadow-sm text-sm font-medium w-fit">
        {(['settimana', 'mese', 'anno'] as const).map(p => (
          <button key={p} onClick={() => setPeriodoAdv(p)}
            className={`px-4 py-2 capitalize transition-colors ${periodoAdv === p ? 'bg-electric-blue text-white' : 'text-ink-navy/50 hover:bg-mist'}`}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>
    )
  }

  // ── Dettaglio calcolato client-side ──────────────────────────────────────
  const perGiornoDettaglio = dettaglio
    ? (fonteDettaglio === 'cartellino' ? dettaglio.timbraturePerGiorno : dettaglio.turniPerGiorno)
    : {}

  const oreLavorateDettaglio = Math.round(
    Object.values(perGiornoDettaglio).flat().reduce((s, t) => s + t.ore, 0) * 10
  ) / 10

  const giorniLavoratiDettaglio = Object.keys(perGiornoDettaglio).length

  const ritardiConTimbro = dettaglio ? dettaglio.ritardi.filter(r => r.hasTimbro) : []
  const assenzeIngiustificate = dettaglio ? dettaglio.ritardi.filter(r => !r.hasTimbro) : []
  const ritardiMin = ritardiConTimbro.reduce((s, r) => s + (r.ritardoMin > 5 ? r.ritardoMin : 0), 0)
  const straordMin = ritardiConTimbro.reduce((s, r) => s + (r.straordinarioMin > 5 ? r.straordinarioMin : 0), 0)
  const ritardiCount = ritardiConTimbro.filter(r => r.ritardoMin > 5).length
  const straordCount = ritardiConTimbro.filter(r => r.straordinarioMin > 5).length
  // aggregazione per mese (per vista anno nel modal)
  const ritardiPerMese: Record<string, { ritardoMin: number; straordinarioMin: number }> = {}
  ritardiConTimbro.forEach(r => {
    const mm = r.data.substring(0, 7)
    if (!ritardiPerMese[mm]) ritardiPerMese[mm] = { ritardoMin: 0, straordinarioMin: 0 }
    ritardiPerMese[mm].ritardoMin += r.ritardoMin
    ritardiPerMese[mm].straordinarioMin += r.straordinarioMin
  })

  const richiesteDettaglio = dettaglio?.richieste ?? []
  const filtraPerPeriodo = (tipo: string) => richiesteDettaglio.filter(r => {
    if (r.tipo !== tipo) return false
    if (dettaglio?.periodo === 'settimana' && r.data) {
      return r.data >= (dettaglio.inizioPeriodo ?? '') && r.data < (dettaglio.finePeriodo ?? '')
    }
    return true
  })
  const ferieR = filtraPerPeriodo('ferie')
  const malattieR = filtraPerPeriodo('malattia')
  const permessiR = filtraPerPeriodo('permesso')
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
          <SelectorPeriodoAdv />
          {loadingTavoliAdv && !datiTavoliAdv && <div className="flex items-center justify-center h-64 text-ink-navy/35">Caricamento...</div>}
          {datiTavoliAdv && (() => {
            const d = datiTavoliAdv
            const maxInc = Math.max(...d.andamento.map(b => b.incasso), 1)
            const maxCop = Math.max(...d.andamento.map(b => b.coperti), 1)
            return (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {[
                    { label: 'Incasso totale', val: fmtEur(d.totaleIncasso), sub: periodoAdvLabel, color: 'text-emerald-600' },
                    { label: 'Tavoli serviti', val: String(d.totaleOrdini), sub: 'conti chiusi', color: 'text-ink-navy' },
                    { label: 'Coperti', val: String(d.copertiConfermati), sub: 'da prenotazioni', color: 'text-ink-navy' },
                    { label: 'Spesa media/persona', val: fmtEur(d.spesaMediaPersona), sub: 'incasso ÷ coperti', color: 'text-electric-blue' },
                    { label: 'Tasso no-show', val: d.tassoNoShow.toFixed(1) + '%', sub: 'prenotazioni non arrivate', color: d.tassoNoShow > 15 ? 'text-red-500' : d.tassoNoShow > 8 ? 'text-amber-500' : 'text-green-500' },
                    { label: 'Durata media tavolo', val: d.durataMediaMinuti > 0 ? d.durataMediaMinuti + ' min' : '—', sub: "dall'ordine alla chiusura", color: 'text-electric-blue' },
                  ].map(k => (
                    <div key={k.label} className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
                      <p className="text-xs text-ink-navy/50 uppercase tracking-wide">{k.label}</p>
                      <p className={`text-3xl font-bold mt-1 ${k.color}`}>{k.val}</p>
                      <p className="text-xs text-ink-navy/35 mt-1">{k.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
                  <h2 className="text-base font-semibold text-ink-navy mb-4">Andamento incasso</h2>
                  {d.andamento.length === 0 ? <p className="text-ink-navy/35 text-sm py-8 text-center">Nessun dato</p> : (
                    <div className="flex items-end gap-1.5" style={{ height: 140 }}>
                      {d.andamento.map(b => {
                        const h = Math.round((b.incasso / maxInc) * 120)
                        return (
                          <div key={b.data} className="flex-1 flex flex-col items-center gap-1">
                            {b.incasso > 0 && <span className="text-[10px] text-ink-navy/50 font-medium leading-none">{fmtEur(b.incasso)}</span>}
                            <div className="w-full flex flex-col justify-end" style={{ height: '120px' }}>
                              <div className="w-full bg-emerald-500 rounded-t-lg" style={{ height: `${Math.max(h, b.incasso > 0 ? 4 : 0)}px` }} />
                            </div>
                            <span className="text-[10px] text-ink-navy/35 leading-none">{fmtDataAdv(b.data)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
                  <h2 className="text-base font-semibold text-ink-navy mb-4">Andamento coperti</h2>
                  {d.andamento.length === 0 ? <p className="text-ink-navy/35 text-sm py-8 text-center">Nessun dato</p> : (
                    <div className="flex items-end gap-1.5" style={{ height: 140 }}>
                      {d.andamento.map(b => {
                        const h = Math.round((b.coperti / maxCop) * 120)
                        return (
                          <div key={b.data} className="flex-1 flex flex-col items-center gap-1">
                            {b.coperti > 0 && <span className="text-[10px] text-ink-navy/50 font-medium leading-none">{b.coperti}</span>}
                            <div className="w-full flex flex-col justify-end" style={{ height: '120px' }}>
                              <div className="w-full bg-electric-blue rounded-t-lg" style={{ height: `${Math.max(h, b.coperti > 0 ? 4 : 0)}px` }} />
                            </div>
                            <span className="text-[10px] text-ink-navy/35 leading-none">{fmtDataAdv(b.data)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-ink-navy/8"><h2 className="text-base font-semibold text-ink-navy">Dettaglio giornaliero</h2></div>
                  {d.andamento.length === 0 ? <p className="text-ink-navy/35 text-sm px-6 py-8 text-center">Nessun dato</p> : (
                    <table className="w-full text-sm">
                      <thead className="bg-mist text-ink-navy/50 text-xs uppercase tracking-wide">
                        <tr>
                          <th className="text-left px-6 py-3">Data</th>
                          <th className="text-right px-4 py-3">Conti chiusi</th>
                          <th className="text-right px-4 py-3">Coperti</th>
                          <th className="text-right px-6 py-3">Incasso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {[...d.andamento].reverse().map(b => (
                          <tr key={b.data} className="hover:bg-mist">
                            <td className="px-6 py-3 font-medium text-ink-navy">{new Date(b.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })}</td>
                            <td className="text-right px-4 py-3 text-ink-navy/70">{b.ordini || '—'}</td>
                            <td className="text-right px-4 py-3 text-ink-navy/70">{b.coperti || '—'}</td>
                            <td className="text-right px-6 py-3 text-emerald-600 font-medium">{b.incasso > 0 ? fmtEur(b.incasso) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ── ORDINI ── */}
      {tabAnalytics === 'ordini' && (
        <div className="space-y-6">
          <SelectorPeriodoAdv />
          {loadingOrdiniAdv && !datiOrdiniAdv && <div className="flex items-center justify-center h-64 text-ink-navy/35">Caricamento...</div>}
          {datiOrdiniAdv && (() => {
            const d = datiOrdiniAdv
            const maxInc = Math.max(...d.andamento.map(b => b.incasso), 1)
            const maxOrd = Math.max(...d.andamento.map(b => b.ordini), 1)
            const maxFascia = Math.max(...d.fasceOrarie.map(f => f.count), 1)
            return (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {[
                    { label: 'Incasso totale', val: fmtEur(d.totaleIncasso), sub: periodoAdvLabel, color: 'text-emerald-600' },
                    { label: 'Totale ordini', val: String(d.totaleOrdini), sub: 'asporto + delivery', color: 'text-ink-navy' },
                    { label: 'Asporto', val: String(d.asportoCount), sub: 'ordini da ritirare', color: 'text-electric-blue' },
                    { label: 'Delivery', val: String(d.deliveryCount), sub: 'ordini a domicilio', color: 'text-electric-blue' },
                    { label: 'Spesa media/ordine', val: fmtEur(d.spesaMedia), sub: 'incasso ÷ ordini', color: 'text-electric-blue' },
                    { label: 'Non consegnati', val: d.tassoNonConsegnati.toFixed(1) + '%', sub: 'annullati o non ritirati', color: d.tassoNonConsegnati > 10 ? 'text-red-500' : d.tassoNonConsegnati > 5 ? 'text-amber-500' : 'text-green-500' },
                  ].map(k => (
                    <div key={k.label} className="bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
                      <p className="text-xs text-ink-navy/50 uppercase tracking-wide">{k.label}</p>
                      <p className={`text-3xl font-bold mt-1 ${k.color}`}>{k.val}</p>
                      <p className="text-xs text-ink-navy/35 mt-1">{k.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
                  <h2 className="text-base font-semibold text-ink-navy mb-4">Andamento incasso</h2>
                  {d.andamento.length === 0 ? <p className="text-ink-navy/35 text-sm py-8 text-center">Nessun dato</p> : (
                    <div className="flex items-end gap-1.5" style={{ height: 140 }}>
                      {d.andamento.map(b => {
                        const h = Math.round((b.incasso / maxInc) * 120)
                        return (
                          <div key={b.data} className="flex-1 flex flex-col items-center gap-1">
                            {b.incasso > 0 && <span className="text-[10px] text-ink-navy/50 font-medium leading-none">{fmtEur(b.incasso)}</span>}
                            <div className="w-full flex flex-col justify-end" style={{ height: '120px' }}>
                              <div className="w-full bg-emerald-500 rounded-t-lg" style={{ height: `${Math.max(h, b.incasso > 0 ? 4 : 0)}px` }} />
                            </div>
                            <span className="text-[10px] text-ink-navy/35 leading-none">{fmtDataAdv(b.data)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-ink-navy mb-4">Asporto vs Delivery</h2>
                    {d.andamento.length === 0 ? <p className="text-ink-navy/35 text-sm py-8 text-center">Nessun dato</p> : (
                      <>
                        <div className="flex items-end gap-1.5" style={{ height: 120 }}>
                          {d.andamento.map(b => {
                            const hA = Math.round((b.asporto / maxOrd) * 100)
                            const hD = Math.round((b.delivery / maxOrd) * 100)
                            return (
                              <div key={b.data} className="flex-1 flex flex-col items-center gap-1">
                                <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: '100px' }}>
                                  <div className="w-full bg-purple-400 rounded-t-sm" style={{ height: `${Math.max(hD, b.delivery > 0 ? 3 : 0)}px` }} />
                                  <div className="w-full bg-electric-blue" style={{ height: `${Math.max(hA, b.asporto > 0 ? 3 : 0)}px` }} />
                                </div>
                                <span className="text-[10px] text-ink-navy/35 leading-none">{fmtDataAdv(b.data)}</span>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex gap-4 mt-3 text-xs text-ink-navy/50">
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-electric-blue inline-block" /> Asporto</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-purple-400 inline-block" /> Delivery</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-ink-navy mb-4">Fasce orarie più richieste</h2>
                    {d.fasceOrarie.length === 0 ? <p className="text-ink-navy/35 text-sm py-8 text-center">Nessun dato</p> : (
                      <div className="flex items-end gap-1" style={{ height: 120 }}>
                        {d.fasceOrarie.map(f => {
                          const h = Math.round((f.count / maxFascia) * 100)
                          return (
                            <div key={f.ora} className="flex-1 flex flex-col items-center gap-1">
                              {f.count > 0 && <span className="text-[10px] text-ink-navy/50 leading-none">{f.count}</span>}
                              <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                                <div className="w-full bg-amber-400 rounded-t-sm" style={{ height: `${Math.max(h, f.count > 0 ? 3 : 0)}px` }} />
                              </div>
                              <span className="text-[10px] text-ink-navy/35 leading-none">{f.ora.slice(0, 5)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-ink-navy/8"><h2 className="text-base font-semibold text-ink-navy">Dettaglio giornaliero</h2></div>
                  {d.andamento.length === 0 ? <p className="text-ink-navy/35 text-sm px-6 py-8 text-center">Nessun dato</p> : (
                    <table className="w-full text-sm">
                      <thead className="bg-mist text-ink-navy/50 text-xs uppercase tracking-wide">
                        <tr>
                          <th className="text-left px-6 py-3">Data</th>
                          <th className="text-right px-4 py-3">Asporto</th>
                          <th className="text-right px-4 py-3">Delivery</th>
                          <th className="text-right px-4 py-3">Totale</th>
                          <th className="text-right px-6 py-3">Incasso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {[...d.andamento].reverse().map(b => (
                          <tr key={b.data} className="hover:bg-mist">
                            <td className="px-6 py-3 font-medium text-ink-navy">{new Date(b.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })}</td>
                            <td className="text-right px-4 py-3 text-ink-navy/70">{b.asporto || '—'}</td>
                            <td className="text-right px-4 py-3 text-ink-navy/70">{b.delivery || '—'}</td>
                            <td className="text-right px-4 py-3 text-ink-navy/70">{b.ordini || '—'}</td>
                            <td className="text-right px-6 py-3 text-emerald-600 font-medium">{b.incasso > 0 ? fmtEur(b.incasso) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ── MENU ── */}
      {tabAnalytics === 'menu' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <SelectorPeriodoAdv />
            {datiMenuAdv && <p className="text-xs text-ink-navy/40">{datiMenuAdv.totale} piatti ordinati nel periodo</p>}
          </div>
          {loadingMenuAdv && !datiMenuAdv && <div className="flex items-center justify-center h-64 text-ink-navy/35">Caricamento...</div>}
          {datiMenuAdv && datiMenuAdv.top10.length === 0 && (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-12 text-center shadow-sm">
              <p className="text-ink-navy/35 text-sm">Nessun ordine nel periodo selezionato</p>
            </div>
          )}
          {datiMenuAdv && datiMenuAdv.top10.length > 0 && (() => {
            const d = datiMenuAdv
            const maxTop = Math.max(...d.top10.map(p => p.quantita), 1)
            const maxBot = Math.max(...d.bottom10.map(p => p.quantita), 1)
            return (
              <>
                <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
                  <h2 className="text-base font-semibold text-ink-navy mb-5">Piatti più richiesti</h2>
                  <div className="space-y-3">
                    {d.top10.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-ink-navy/30 w-5 text-right shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-ink-navy truncate">{p.nome}</span>
                            <span className="text-xs text-ink-navy/50 ml-2 shrink-0">{p.quantita} pz · {fmtEur(p.incasso)}</span>
                          </div>
                          <div className="h-2 bg-mist rounded-full overflow-hidden">
                            <div className="h-full bg-electric-blue rounded-full" style={{ width: `${Math.round((p.quantita / maxTop) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {d.bottom10.length > 0 && d.totale > 1 && (
                  <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-ink-navy mb-5">Piatti meno richiesti</h2>
                    <div className="space-y-3">
                      {d.bottom10.map((p, i) => (
                        <div key={p.id} className="flex items-center gap-3">
                          <span className="text-xs font-bold text-ink-navy/30 w-5 text-right shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-ink-navy truncate">{p.nome}</span>
                              <span className="text-xs text-ink-navy/50 ml-2 shrink-0">{p.quantita} pz · {fmtEur(p.incasso)}</span>
                            </div>
                            <div className="h-2 bg-mist rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.max(Math.round((p.quantita / maxBot) * 100), 4)}%` }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-ink-navy/8"><h2 className="text-base font-semibold text-ink-navy">Classifica completa</h2></div>
                  <table className="w-full text-sm">
                    <thead className="bg-mist text-ink-navy/50 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-6 py-3">#</th>
                        <th className="text-left px-4 py-3">Piatto</th>
                        <th className="text-right px-4 py-3">Pezzi</th>
                        <th className="text-right px-6 py-3">Incasso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {d.top10.map((p, i) => (
                        <tr key={p.id} className="hover:bg-mist">
                          <td className="px-6 py-3 text-ink-navy/40 font-semibold">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-ink-navy">{p.nome}</td>
                          <td className="text-right px-4 py-3 text-ink-navy/70">{p.quantita}</td>
                          <td className="text-right px-6 py-3 text-emerald-600 font-medium">{fmtEur(p.incasso)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
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
            <p className="text-[11px] text-ink-navy/35 mt-1.5">
              <b className="text-ink-navy/50">Turni</b>: ore da programma &nbsp;·&nbsp; <b className="text-ink-navy/50">Cartellino</b>: ore effettive da timbro QR
            </p>
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

              // (ritardiConTimbro e maxRitMin calcolati fuori dal render)

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
                    <div className="bg-mist rounded-2xl p-4">
                      <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wide">Giorni lavorati</p>
                      <p className="text-3xl font-bold mt-1 text-ink-navy">{giorniLavoratiDettaglio}</p>
                      <p className="text-xs text-ink-navy/35 mt-0.5">giorni</p>
                    </div>
                    <div className="bg-electric-blue/8 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wide">Ore totali</p>
                      <p className="text-3xl font-bold mt-1 text-electric-blue">{oreLavorateDettaglio}</p>
                      <p className="text-xs text-ink-navy/35 mt-0.5">ore</p>
                    </div>
                    <button onClick={() => dettaglio.usaTimbri && ritardiMin > 0 && setModalKpi('ritardi')}
                      className={`rounded-2xl p-4 text-left transition-colors ${ritardiMin > 0 ? 'bg-red-50 hover:bg-red-100 cursor-pointer' : 'bg-green-50 cursor-default'}`}>
                      <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wide">Ritardi</p>
                      <p className={`text-3xl font-bold mt-1 ${ritardiMin > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {ritardiMin > 0 ? minToLabel(ritardiMin) : '0'}
                      </p>
                      <p className="text-xs text-ink-navy/35 mt-0.5">{ritardiCount > 0 ? `${ritardiCount} giorni · tocca per dettaglio` : 'nessun ritardo'}</p>
                    </button>
                    <button onClick={() => dettaglio.usaTimbri && straordMin > 0 && setModalKpi('straordinari')}
                      className={`rounded-2xl p-4 text-left transition-colors ${straordMin > 0 ? 'bg-electric-blue/8 hover:bg-electric-blue/15 cursor-pointer' : 'bg-mist cursor-default'}`}>
                      <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wide">Straordinari</p>
                      <p className={`text-3xl font-bold mt-1 ${straordMin > 0 ? 'text-electric-blue' : 'text-ink-navy/25'}`}>
                        {straordMin > 0 ? minToLabel(straordMin) : '0'}
                      </p>
                      <p className="text-xs text-ink-navy/35 mt-0.5">{straordCount > 0 ? `${straordCount} giorni · tocca per dettaglio` : 'nessuno straordinario'}</p>
                    </button>
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
                    <div className="mt-4 flex gap-1.5" style={{ height: 120 }}>
                      {barre.map((b, i) => {
                        const h = Math.round((b.ore / maxOre) * 90)
                        const barH = Math.max(h, b.presente ? 4 : 2)
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center">
                            {/* area barre: altezza fissa uguale per tutte le colonne */}
                            <div className="w-full flex flex-col items-center justify-end" style={{ height: 96 }}>
                              {b.ore > 0 && (
                                <span className="text-[9px] font-bold text-electric-blue leading-none mb-0.5">{b.ore}h</span>
                              )}
                              <div
                                className={`w-full rounded-t-md ${b.presente ? 'bg-electric-blue' : 'bg-ink-navy/8'}`}
                                style={{ height: `${barH}px` }}
                              />
                            </div>
                            {/* area label: altezza fissa uguale per tutte le colonne */}
                            <div className="flex flex-col items-center justify-start mt-1" style={{ height: 22 }}>
                              <span className="text-[10px] font-medium text-ink-navy/40 leading-none">{b.label}</span>
                              {b.sublabel && <span className="text-[9px] text-ink-navy/25 leading-none mt-0.5">{b.sublabel}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── Layout 2 colonne: ritardi | assenze ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                    {/* Ritardi & Straordinari — mini preview, dettaglio nei KPI cliccabili */}
                    <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5">
                      <p className="text-sm font-semibold text-ink-navy">Ritardi & Straordinari</p>
                      <p className="text-xs text-ink-navy/40 mt-0.5">Orario turno vs timbro effettivo · il ritardo include sia entrate tardive che uscite anticipate</p>
                      {!dettaglio.usaTimbri ? (
                        <div className="mt-4 flex items-center gap-2 bg-mist rounded-xl p-3">
                          <svg className="w-4 h-4 text-ink-navy/30 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          <p className="text-xs text-ink-navy/50">Attiva il QR timbratura per calcolare ritardi e straordinari.</p>
                        </div>
                      ) : ritardiConTimbro.length === 0 ? (
                        <p className="mt-4 text-center py-6 text-ink-navy/25 text-sm">Nessun timbro nel periodo</p>
                      ) : (
                        <div className="mt-4 space-y-2">
                          {ritardiConTimbro.slice(0, 7).map((r, i) => {
                            const isRit = r.ritardoMin > 5
                            const isStr = r.straordinarioMin > 5
                            const maxMin = Math.max(...ritardiConTimbro.map(x => Math.max(x.ritardoMin, x.straordinarioMin)), 1)
                            const ritPct = Math.round((r.ritardoMin / maxMin) * 100)
                            const strPct = Math.round((r.straordinarioMin / maxMin) * 100)
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className="w-12 text-right text-ink-navy/40 flex-shrink-0 text-[10px]">{fmtData(r.data)}</span>
                                <div className="flex-1 flex justify-end">
                                  <div className={`h-4 rounded-l flex items-center justify-end px-1 ${isRit ? 'bg-red-100' : 'bg-ink-navy/5'}`} style={{ width: `${Math.max(ritPct, 4)}%` }}>
                                    {isRit && <span className="text-[9px] font-bold text-red-500">{minToLabel(r.ritardoMin)}</span>}
                                  </div>
                                </div>
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRit ? 'bg-red-400' : isStr ? 'bg-electric-blue' : 'bg-green-400'}`} />
                                <div className="flex-1 flex justify-start">
                                  <div className={`h-4 rounded-r flex items-center px-1 ${isStr ? 'bg-electric-blue/20' : 'bg-ink-navy/5'}`} style={{ width: `${Math.max(strPct, 4)}%` }}>
                                    {isStr && <span className="text-[9px] font-bold text-electric-blue">{minToLabel(r.straordinarioMin)}</span>}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                          {ritardiConTimbro.length > 7 && <p className="text-[10px] text-center text-ink-navy/30">+{ritardiConTimbro.length - 7} altri giorni</p>}
                          <div className="flex justify-between pt-1 text-[10px] text-ink-navy/35 font-medium">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-200 inline-block"/>Ritardo</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-electric-blue/30 inline-block"/>Straordinario</span>
                          </div>
                          <p className="text-[10px] text-ink-navy/30 text-center pt-1">Tocca i box ritardi/straordinari in alto per il dettaglio</p>
                          {assenzeIngiustificate.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-red-100">
                              <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1.5">Assenze ingiustificate ({assenzeIngiustificate.length})</p>
                              <div className="space-y-1">
                                {assenzeIngiustificate.map((r, i) => (
                                  <div key={i} className="flex items-center justify-between text-[10px] bg-red-50 rounded px-2 py-1">
                                    <span className="text-red-600 font-semibold">{fmtData(r.data)}</span>
                                    <span className="text-red-400">{r.turni.map(t => t.inizio + '–' + t.fine).join(', ')}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Assenze */}
                    <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5">
                      <p className="text-sm font-semibold text-ink-navy">Permessi & Richieste</p>
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
                      <div className="bg-white w-full sm:max-w-4xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col"
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

                  {/* ── Modal KPI ritardi / straordinari ── */}
                  {modalKpi && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-navy/40 p-0 sm:p-4"
                      onClick={() => setModalKpi(null)}>
                      <div className="bg-white w-full sm:max-w-4xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-navy/8 flex-shrink-0">
                          <div>
                            <p className="text-base font-bold text-ink-navy">
                              {modalKpi === 'ritardi' ? 'Dettaglio Ritardi' : 'Dettaglio Straordinari'}
                            </p>
                            <p className="text-xs text-ink-navy/40 mt-0.5">
                              {modalKpi === 'ritardi'
                                ? 'Tempo di turno non coperto da timbro'
                                : 'Tempo timbrato fuori dall\'orario del turno'}
                              {' · '}{dettaglio.rangeLabel}
                            </p>
                          </div>
                          <button onClick={() => setModalKpi(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-mist text-ink-navy/50 hover:text-ink-navy text-lg leading-none">✕</button>
                        </div>
                        <div className="overflow-y-auto">
                          {/* Settimana: lista per giorno */}
                          {dettaglio.periodo === 'settimana' && (
                            <div className="divide-y divide-ink-navy/6">
                              {ritardiConTimbro.map((r, i) => {
                                const val = modalKpi === 'ritardi' ? r.ritardoMin : r.straordinarioMin
                                const hasVal = val > (modalKpi === 'ritardi' ? 2 : 5)
                                return (
                                  <div key={i} className="px-5 py-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-semibold text-ink-navy">{fmtData(r.data)}</span>
                                      <span className={`text-sm font-bold ${hasVal ? (modalKpi === 'ritardi' ? 'text-red-500' : 'text-electric-blue') : 'text-green-500'}`}>
                                        {hasVal ? minToLabel(val) : '—'}
                                      </span>
                                    </div>
                                    <div className="flex gap-4 text-xs text-ink-navy/50">
                                      <span>Turni: {r.turni.map(t => `${t.inizio}–${t.fine}`).join(', ') || '—'}</span>
                                      <span>Timbri: {r.timbri.map(t => `${t.inizio}–${t.fine}`).join(', ') || '—'}</span>
                                    </div>
                                  </div>
                                )
                              })}
                              {ritardiConTimbro.length === 0 && <p className="px-5 py-8 text-sm text-ink-navy/30 text-center">Nessun dato</p>}
                            </div>
                          )}
                          {/* Mese: barre giornaliere */}
                          {dettaglio.periodo === 'mese' && (() => {
                            const anno = dettaglioRif.getFullYear()
                            const meseIdx = dettaglioRif.getMonth()
                            const giorni = new Date(anno, meseIdx + 1, 0).getDate()
                            const byDay: Record<string, number> = {}
                            ritardiConTimbro.forEach(r => { byDay[r.data] = modalKpi === 'ritardi' ? r.ritardoMin : r.straordinarioMin })
                            const maxVal = Math.max(...Object.values(byDay), 1)
                            return (
                              <div className="px-5 py-4">
                                <div className="flex items-end gap-1" style={{ height: 140 }}>
                                  {Array.from({ length: giorni }, (_, i) => {
                                    const key = `${anno}-${String(meseIdx + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
                                    const val = byDay[key] ?? 0
                                    const h = Math.round((val / maxVal) * 110)
                                    const hasVal = val > (modalKpi === 'ritardi' ? 2 : 5)
                                    return (
                                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5" style={{ height: 130 }}>
                                        <div className="w-full flex flex-col items-center justify-end" style={{ height: 120 }}>
                                          {hasVal && <span className="text-[8px] font-bold leading-none mb-0.5" style={{ color: modalKpi === 'ritardi' ? '#ef4444' : '#2563eb' }}>{minToLabel(val)}</span>}
                                          <div className="w-full rounded-t" style={{ height: `${Math.max(h, hasVal ? 4 : 2)}px`, background: hasVal ? (modalKpi === 'ritardi' ? '#fecaca' : '#bfdbfe') : '#f1f5f9' }} />
                                        </div>
                                        <span className="text-[9px] text-ink-navy/40">{i + 1}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                                <div className="mt-3 divide-y divide-ink-navy/6">
                                  {ritardiConTimbro.filter(r => (modalKpi === 'ritardi' ? r.ritardoMin > 5 : r.straordinarioMin > 5)).map((r, i) => (
                                    <div key={i} className="py-3 flex items-start justify-between text-sm">
                                      <div>
                                        <p className="font-medium text-ink-navy">{fmtData(r.data)}</p>
                                        <p className="text-xs text-ink-navy/40 mt-0.5">Turni: {r.turni.map(t => `${t.inizio}–${t.fine}`).join(', ')} · Timbri: {r.timbri.map(t => `${t.inizio}–${t.fine}`).join(', ') || '—'}</p>
                                      </div>
                                      <span className={`font-bold flex-shrink-0 ml-4 ${modalKpi === 'ritardi' ? 'text-red-500' : 'text-electric-blue'}`}>
                                        {minToLabel(modalKpi === 'ritardi' ? r.ritardoMin : r.straordinarioMin)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })()}
                          {/* Anno: barre mensili */}
                          {dettaglio.periodo === 'anno' && (() => {
                            const anno = dettaglioRif.getFullYear()
                            const mesiLabels = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
                            const barreAnno = Array.from({ length: 12 }, (_, i) => {
                              const mm = String(i + 1).padStart(2, '0')
                              const key = `${anno}-${mm}`
                              const v = ritardiPerMese[key]
                              return { label: mesiLabels[i], val: v ? (modalKpi === 'ritardi' ? v.ritardoMin : v.straordinarioMin) : 0 }
                            })
                            const maxVal = Math.max(...barreAnno.map(b => b.val), 1)
                            return (
                              <div className="px-5 py-4">
                                <div className="flex items-end gap-2" style={{ height: 140 }}>
                                  {barreAnno.map((b, i) => {
                                    const h = Math.round((b.val / maxVal) * 110)
                                    const hasVal = b.val > (modalKpi === 'ritardi' ? 2 : 5)
                                    return (
                                      <div key={i} className="flex-1 flex flex-col items-center gap-1" style={{ height: 130 }}>
                                        <div className="w-full flex flex-col items-center justify-end" style={{ height: 115 }}>
                                          {hasVal && <span className="text-[9px] font-bold leading-none mb-0.5" style={{ color: modalKpi === 'ritardi' ? '#ef4444' : '#2563eb' }}>{minToLabel(b.val).replace('+','')}</span>}
                                          <div className="w-full rounded-t" style={{ height: `${Math.max(h, hasVal ? 4 : 2)}px`, background: hasVal ? (modalKpi === 'ritardi' ? '#fecaca' : '#bfdbfe') : '#f1f5f9' }} />
                                        </div>
                                        <span className="text-[9px] text-ink-navy/40">{b.label}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                                <div className="mt-3 divide-y divide-ink-navy/6">
                                  {barreAnno.filter(b => b.val > 0).map((b, i) => (
                                    <div key={i} className="py-2.5 flex items-center justify-between text-sm">
                                      <span className="text-ink-navy/70">{b.label} {anno}</span>
                                      <span className={`font-bold ${modalKpi === 'ritardi' ? 'text-red-500' : 'text-electric-blue'}`}>{minToLabel(b.val)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })()}
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

                        {/* Sezioni da includere */}
                        <div>
                          <p className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide mb-2">Includi nel PDF</p>
                          <div className="space-y-2">
                            {[
                              { label: 'Ritardi & Straordinari', val: pdfIncludiRitardi, set: setPdfIncludiRitardi },
                              { label: 'Assenze & Richieste (ferie, permessi, malattia)', val: pdfIncludiRichieste, set: setPdfIncludiRichieste },
                            ].map(opt => (
                              <button key={opt.label} onClick={() => opt.set(!opt.val)}
                                className="flex items-center gap-3 w-full text-left">
                                <span className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${opt.val ? 'bg-electric-blue border-electric-blue' : 'border-ink-navy/20 bg-white'}`}>
                                  {opt.val && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 13 4 4L19 7"/></svg>}
                                </span>
                                <span className="text-sm text-ink-navy/70">{opt.label}</span>
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

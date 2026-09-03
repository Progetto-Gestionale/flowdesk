// Report contabile MENSILE per il commercialista (XLSX via exceljs).
// 7 fogli: Frontespizio · Corrispettivi giornalieri · Registro IVA vendite · Registro IVA
// acquisti · Liquidazione IVA · Conto economico · Dettaglio costi.
//
// Principio: NESSUN numero lo inventa questo file. I dati arrivano da buildDatiReport,
// che riusa lo stesso motore della pagina Contabilità (riepilogoContabile) e gli stessi
// helper IVA (scorpora / risolviAliquotaVendita) → i totali combaciano con l'app.
// Non sostituisce i registri fiscali ufficiali (registratore telematico / SdI): è un
// documento di supporto pulito da consegnare al commercialista.

import ExcelJS from 'exceljs'
import { prisma } from '@/lib/prisma'
import { calcolaPeriodo } from './periodo'
import { riepilogoContabile } from './chiusuraGiorno'
import { scorpora, risolviAliquotaVendita } from './iva'
import { WHERE_CONTO_CHIUSO } from '@/lib/ordini/contoChiuso'
import type { ContoEconomico } from './spendibile'

const EUR = '#,##0.00 "€"'
const NAVY = 'FF0B1F3A', BLUE = 'FF1D4ED8', LIME = 'FFCDE85A', GREY = 'FF6B7280', LIGHT = 'FFF3F4F6', WARN = 'FFB45309'
const DAY = 86_400_000
const round2 = (n: number) => Math.round(n * 100) / 100
const aliqLabel = (a: number) => (a === 0 ? 'Esente' : `${Math.round(a * 100)}%`)

// ─────────────────────────────────────────────────────────────────────────────
// STRATO DATI — tutto deterministico, dallo schema Prisma.
// ─────────────────────────────────────────────────────────────────────────────

interface RigaGiorno {
  data: Date
  perAliquota: Map<number, { imponibile: number; iva: number }>
  lordo: number
  scontrini: number
  coperti: number
  tavolo: number
  asporto: number
  delivery: number
}
interface RigaFattura {
  data: Date; fornitore: string; partitaIva: string; numero: string; categoria: string
  imponibile: number; iva: number; totale: number
}
interface RigaCosto {
  voce: string; categoria: string; imponibile: number; aliquota: number; iva: number
  periodicita: string; quotaPeriodo: number
}
export interface DatiReport {
  intestazione: {
    ragioneSociale: string; partitaIva: string; codiceFiscale: string
    indirizzo: string; nomeLocale: string; periodoLabel: string; regime: string; generatoIl: string
  }
  sintesi: {
    corrispettiviLordi: number; imponibileVendite: number; ivaDebito: number
    ivaCredito: number; saldoIva: number; utileStimato: number
  }
  aliquoteVendita: number[] // aliquote presenti nel mese (per le colonne dei corrispettivi)
  corrispettivi: RigaGiorno[]
  registroVendite: { aliquota: number; imponibile: number; iva: number }[]
  registroAcquisti: RigaFattura[]
  liquidazione: { ivaDebito: number; ivaCreditoAcquisti: number; ivaCreditoCosti: number; saldo: number }
  conto: ContoEconomico
  costi: RigaCosto[]
}

const giornoRoma = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })

// Giorni "trascorsi" del periodo (stessa logica di chiusuraGiorno: min(fine, adesso)).
function giorniTrascorsi(inizio: Date, fine: Date): number {
  const now = new Date()
  const limite = fine < now ? fine : now
  return Math.max(1, Math.ceil((limite.getTime() - inizio.getTime()) / DAY))
}
// Quota di un costo una tantum che cade nel periodo (stessa logica di chiusuraGiorno).
function quotaUnaTantum(c: { importoNetto: number; dataInizio: Date; dataFine: Date }, inizio: Date, fine: Date): number {
  const covStart = c.dataInizio.getTime()
  const covEnd = c.dataFine.getTime() + DAY
  const giorniCoperti = Math.max(1, Math.round((covEnd - covStart) / DAY))
  const overlapStart = Math.max(covStart, inizio.getTime())
  const overlapEnd = Math.min(covEnd, fine.getTime())
  const giorniOverlap = Math.max(0, (overlapEnd - overlapStart) / DAY)
  return c.importoNetto * (giorniOverlap / giorniCoperti)
}

// Costruisce i dati del report per il MESE che contiene `riferimento` (default: mese corrente).
export async function buildDatiReport(userId: string, riferimento?: string | null): Promise<DatiReport & { periodoFile: string }> {
  const p = calcolaPeriodo('mese', riferimento)

  const [r, config, ordini, fatture, costiFissi, costiUnaTantum, user] = await Promise.all([
    riepilogoContabile(userId, p.inizio, p.fine),
    prisma.contabilitaConfig.findUnique({ where: { userId } }),
    prisma.ordine.findMany({
      where: { userId, createdAt: { gte: p.inizio, lt: p.fine }, ...WHERE_CONTO_CHIUSO },
      select: {
        createdAt: true, tipo: true, coperti: true,
        righe: {
          select: {
            prezzo: true, quantita: true, aliquotaVendita: true,
            piatto: { select: { aliquotaVendita: true, categoria: { select: { aliquotaVendita: true } } } },
          },
        },
      },
    }),
    prisma.fattura.findMany({
      where: { userId, data: { gte: p.inizio, lt: p.fine } },
      orderBy: { data: 'asc' },
      select: { data: true, fornitore: true, partitaIvaFornitore: true, numero: true, categoria: true, righe: { select: { imponibile: true, aliquota: true } } },
    }),
    prisma.costoFisso.findMany({ where: { userId, attivo: true } }),
    prisma.costoUnaTantum.findMany({ where: { userId, dataInizio: { lt: p.fine }, dataFine: { gte: p.inizio } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { nomeLocale: true, indirizzo: true, name: true } }),
  ])

  const forfettario = config?.regimeFiscale === 'forfettario'
  const defaultLocale = config?.aliquotaVenditaDefault ?? 0.1

  // ── Corrispettivi giornalieri: aggrego gli ordini per giorno (fuso Roma) ──
  const perGiornoMap = new Map<string, RigaGiorno>()
  const aliquoteSet = new Set<number>()
  for (const o of ordini) {
    const key = giornoRoma(o.createdAt)
    const g = perGiornoMap.get(key) ?? { data: new Date(key), perAliquota: new Map(), lordo: 0, scontrini: 0, coperti: 0, tavolo: 0, asporto: 0, delivery: 0 }
    g.scontrini += 1
    g.coperti += o.coperti ?? 0
    const canale = o.tipo || 'tavolo'
    for (const riga of o.righe) {
      const lordoRiga = riga.prezzo * riga.quantita
      const aliquota = risolviAliquotaVendita({
        rigaAliquota: riga.aliquotaVendita,
        piattoAliquota: riga.piatto?.aliquotaVendita,
        categoriaAliquota: riga.piatto?.categoria?.aliquotaVendita,
        defaultLocale,
      })
      const { imponibile, iva } = forfettario ? { imponibile: lordoRiga, iva: 0 } : scorpora(lordoRiga, aliquota)
      g.lordo += lordoRiga
      if (canale === 'asporto') g.asporto += lordoRiga
      else if (canale === 'delivery') g.delivery += lordoRiga
      else g.tavolo += lordoRiga
      const b = g.perAliquota.get(aliquota) ?? { imponibile: 0, iva: 0 }
      b.imponibile += imponibile; b.iva += iva
      g.perAliquota.set(aliquota, b)
      aliquoteSet.add(aliquota)
    }
    perGiornoMap.set(key, g)
  }
  // Una riga per OGNI giorno di calendario del mese (anche i giorni senza incasso).
  const corrispettivi: RigaGiorno[] = []
  for (let t = p.inizio.getTime(); t < p.fine.getTime(); t += DAY) {
    const d = new Date(t)
    const key = giornoRoma(d)
    corrispettivi.push(perGiornoMap.get(key) ?? { data: d, perAliquota: new Map(), lordo: 0, scontrini: 0, coperti: 0, tavolo: 0, asporto: 0, delivery: 0 })
  }
  const aliquoteVendita = [...aliquoteSet].sort((a, b) => a - b)
  if (aliquoteVendita.length === 0) aliquoteVendita.push(defaultLocale)

  // ── Registro acquisti: una riga per fattura ──
  const registroAcquisti: RigaFattura[] = fatture.map((f) => {
    const imponibile = f.righe.reduce((s, x) => s + x.imponibile, 0)
    const iva = forfettario ? 0 : f.righe.reduce((s, x) => s + x.imponibile * x.aliquota, 0)
    return {
      data: f.data,
      fornitore: f.fornitore || '—',
      partitaIva: f.partitaIvaFornitore || '',
      numero: f.numero || '—',
      categoria: f.categoria,
      imponibile: round2(imponibile), iva: round2(iva), totale: round2(imponibile + iva),
    }
  })

  // ── Dettaglio costi (riga per riga) ──
  const giorni = giorniTrascorsi(p.inizio, p.fine)
  const costi: RigaCosto[] = []
  for (const c of costiFissi) {
    const mensile = c.periodicita === 'annuale' ? c.importoNetto / 12 : c.periodicita === 'trimestrale' ? c.importoNetto / 3 : c.importoNetto
    costi.push({
      voce: c.voce, categoria: c.categoria, imponibile: round2(c.importoNetto), aliquota: c.aliquota,
      iva: forfettario ? 0 : round2(c.importoNetto * c.aliquota), periodicita: c.periodicita,
      quotaPeriodo: round2((mensile / 30) * giorni),
    })
  }
  for (const c of costiUnaTantum) {
    const q = quotaUnaTantum(c, p.inizio, p.fine)
    if (q <= 0) continue
    costi.push({
      voce: c.voce, categoria: c.categoria, imponibile: round2(c.importoNetto), aliquota: c.aliquota,
      iva: forfettario ? 0 : round2(c.importoNetto * c.aliquota), periodicita: 'una tantum',
      quotaPeriodo: round2(q),
    })
  }
  costi.sort((a, b) => b.quotaPeriodo - a.quotaPeriodo)

  const c = r.conto
  const generatoIl = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return {
    periodoFile: p.label,
    intestazione: {
      ragioneSociale: config?.ragioneSociale || user?.nomeLocale || user?.name || 'Locale',
      partitaIva: config?.partitaIva || '—',
      codiceFiscale: config?.codiceFiscale || '—',
      indirizzo: user?.indirizzo || '—',
      nomeLocale: user?.nomeLocale || '',
      periodoLabel: p.label,
      regime: forfettario ? 'Forfettario' : 'Ordinario',
      generatoIl,
    },
    sintesi: {
      corrispettiviLordi: round2(c.fatturatoLordo),
      imponibileVendite: round2(c.fatturatoNetto),
      ivaDebito: round2(c.ivaDebito),
      ivaCredito: round2(c.ivaCredito),
      saldoIva: round2(c.ivaNetta),
      utileStimato: round2(c.utileStimato),
    },
    aliquoteVendita,
    corrispettivi,
    registroVendite: r.ivaVenditePerAliquota.map((v) => ({ aliquota: v.aliquota, imponibile: round2(v.imponibile), iva: round2(v.iva) })),
    registroAcquisti,
    liquidazione: {
      ivaDebito: round2(c.ivaDebito),
      ivaCreditoAcquisti: round2(r.acquisti.ivaCredito),
      ivaCreditoCosti: round2(c.ivaCredito - r.acquisti.ivaCredito),
      saldo: round2(c.ivaNetta),
    },
    conto: c,
    costi,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATORE XLSX
// ─────────────────────────────────────────────────────────────────────────────

function headerRow(ws: ExcelJS.Worksheet, values: (string | number)[]) {
  const row = ws.addRow(values)
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  row.height = 26
  return row
}
function titolo(ws: ExcelJS.Worksheet, testo: string, sub?: string) {
  ws.addRow([testo]).font = { bold: true, size: 15, color: { argb: NAVY } }
  if (sub) ws.addRow([sub]).font = { italic: true, size: 10, color: { argb: GREY } }
  ws.addRow([])
}
function totaleRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
    cell.border = { top: { style: 'medium', color: { argb: NAVY } } }
  })
}

export async function generaReportContabile(dati: DatiReport): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Flowest'
  wb.created = new Date()
  const it = dati.intestazione

  // ── Frontespizio ──
  const fr = wb.addWorksheet('Frontespizio', { properties: { tabColor: { argb: NAVY } } })
  fr.columns = [{ width: 32 }, { width: 40 }]
  const band = fr.addRow(['FLOWEST', '']); band.height = 34
  band.getCell(1).font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } }
  band.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  band.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  fr.addRow(['Report contabile per il commercialista']).font = { size: 12, color: { argb: GREY } }
  fr.addRow([])
  for (const [k, v] of [
    ['Ragione sociale', it.ragioneSociale], ['Partita IVA', it.partitaIva], ['Codice Fiscale', it.codiceFiscale],
    ['Indirizzo', it.indirizzo], ['Regime fiscale', it.regime], ['Periodo di riferimento', it.periodoLabel],
    ['Liquidazione IVA', 'Mensile'], ['Generato il', it.generatoIl],
  ] as [string, string][]) {
    const row = fr.addRow([k, v])
    row.getCell(1).font = { bold: true, color: { argb: NAVY } }
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
  }
  fr.addRow([])
  fr.addRow(['SINTESI DEL PERIODO']).font = { bold: true, size: 12, color: { argb: BLUE } }
  for (const [k, v] of [
    ['Corrispettivi lordi', dati.sintesi.corrispettiviLordi],
    ['Imponibile vendite', dati.sintesi.imponibileVendite],
    ['IVA a debito (vendite)', dati.sintesi.ivaDebito],
    ['IVA a credito (acquisti + costi)', dati.sintesi.ivaCredito],
    [dati.sintesi.saldoIva < 0 ? 'Credito IVA (a tuo favore)' : 'Saldo IVA da versare (F24)', Math.abs(dati.sintesi.saldoIva)],
    ['Utile netto stimato', dati.sintesi.utileStimato],
  ] as [string, number][]) {
    const row = fr.addRow([k, v]); row.getCell(2).numFmt = EUR
  }
  fr.addRow([])
  fr.addRow(['Documento di supporto generato da FlowDesk. Non sostituisce i registri fiscali']).font = { italic: true, size: 9, color: { argb: GREY } }
  fr.addRow(['ufficiali (registratore telematico / SdI). Verificare sempre col commercialista.']).font = { italic: true, size: 9, color: { argb: GREY } }

  // ── Corrispettivi giornalieri (colonne per aliquota, dinamiche) ──
  const co = wb.addWorksheet('Corrispettivi giornalieri', { properties: { tabColor: { argb: BLUE } } })
  const aliq = dati.aliquoteVendita
  const cols = [{ width: 12 }, { width: 8 }]
  for (const _ of aliq) { cols.push({ width: 14 }, { width: 11 }) }
  cols.push({ width: 14 }, { width: 10 }, { width: 9 }, { width: 12 }, { width: 12 }, { width: 12 })
  co.columns = cols
  titolo(co, `Registro dei corrispettivi · ${it.periodoLabel}`, 'Incassi giornalieri, imponibile e IVA per aliquota. Valori in euro.')
  const head: string[] = ['Data', 'Giorno']
  for (const a of aliq) { head.push(`Impon. ${aliqLabel(a)}`, `IVA ${aliqLabel(a)}`) }
  head.push('Totale lordo', 'Scontrini', 'Coperti', 'Tavolo', 'Asporto', 'Delivery')
  headerRow(co, head)
  const gg = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
  const totCol = { lordo: 0, sc: 0, cop: 0, tav: 0, asp: 0, del: 0, perAliq: new Map<number, { imp: number; iva: number }>() }
  const eurCells = (row: ExcelJS.Row, count: number) => { for (let i = 3; i <= count; i++) row.getCell(i).numFmt = EUR }
  for (const g of dati.corrispettivi) {
    const vals: (string | number)[] = [g.data.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }), gg[g.data.getDay()]]
    for (const a of aliq) {
      const b = g.perAliquota.get(a)
      vals.push(b ? round2(b.imponibile) : 0, b ? round2(b.iva) : 0)
      const t = totCol.perAliq.get(a) ?? { imp: 0, iva: 0 }
      if (b) { t.imp += b.imponibile; t.iva += b.iva }
      totCol.perAliq.set(a, t)
    }
    vals.push(round2(g.lordo), g.scontrini, g.coperti, round2(g.tavolo), round2(g.asporto), round2(g.delivery))
    const row = co.addRow(vals)
    // formati €: colonne imponibile/iva + Totale lordo + Tavolo/Asporto/Delivery (salta Scontrini/Coperti)
    for (let i = 3; i < 3 + aliq.length * 2; i++) row.getCell(i).numFmt = EUR
    const lordoIdx = 3 + aliq.length * 2
    row.getCell(lordoIdx).numFmt = EUR
    row.getCell(lordoIdx + 3).numFmt = EUR; row.getCell(lordoIdx + 4).numFmt = EUR; row.getCell(lordoIdx + 5).numFmt = EUR
    if (g.lordo === 0) row.font = { color: { argb: GREY }, italic: true }
    totCol.lordo += g.lordo; totCol.sc += g.scontrini; totCol.cop += g.coperti
    totCol.tav += g.tavolo; totCol.asp += g.asporto; totCol.del += g.delivery
  }
  const totVals: (string | number)[] = ['TOTALE', '']
  for (const a of aliq) { const t = totCol.perAliq.get(a)!; totVals.push(round2(t.imp), round2(t.iva)) }
  totVals.push(round2(totCol.lordo), totCol.sc, totCol.cop, round2(totCol.tav), round2(totCol.asp), round2(totCol.del))
  const trow = co.addRow(totVals)
  for (let i = 3; i < 3 + aliq.length * 2; i++) trow.getCell(i).numFmt = EUR
  const lIdx = 3 + aliq.length * 2
  trow.getCell(lIdx).numFmt = EUR; trow.getCell(lIdx + 3).numFmt = EUR; trow.getCell(lIdx + 4).numFmt = EUR; trow.getCell(lIdx + 5).numFmt = EUR
  totaleRow(trow)
  void eurCells
  co.views = [{ state: 'frozen', ySplit: 4 }]
  co.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: head.length } }

  // ── Registro IVA vendite ──
  const rv = wb.addWorksheet('Registro IVA vendite', { properties: { tabColor: { argb: BLUE } } })
  rv.columns = [{ width: 22 }, { width: 18 }, { width: 16 }, { width: 16 }]
  titolo(rv, 'Riepilogo IVA sulle vendite (corrispettivi)', it.periodoLabel)
  headerRow(rv, ['Aliquota', 'Imponibile', 'IVA', 'Totale'])
  let vImp = 0, vIva = 0
  for (const v of dati.registroVendite) {
    const row = rv.addRow([aliqLabel(v.aliquota), v.imponibile, v.iva, round2(v.imponibile + v.iva)]);[2, 3, 4].forEach((c) => (row.getCell(c).numFmt = EUR))
    vImp += v.imponibile; vIva += v.iva
  }
  const rvt = rv.addRow(['TOTALE', round2(vImp), round2(vIva), round2(vImp + vIva)]);[2, 3, 4].forEach((c) => (rvt.getCell(c).numFmt = EUR)); totaleRow(rvt)

  // ── Registro IVA acquisti ──
  const ra = wb.addWorksheet('Registro IVA acquisti', { properties: { tabColor: { argb: BLUE } } })
  ra.columns = [{ width: 12 }, { width: 26 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 }]
  titolo(ra, 'Registro IVA acquisti · fatture fornitori', it.periodoLabel)
  headerRow(ra, ['Data', 'Fornitore', 'P.IVA', 'N° doc.', 'Categoria', 'Imponibile', 'IVA', 'Totale'])
  if (dati.registroAcquisti.length === 0) {
    ra.addRow(['—', 'Nessuna fattura registrata nel periodo', '', '', '', '', '', '']).font = { italic: true, color: { argb: GREY } }
  }
  let aImp = 0, aIva = 0
  for (const f of dati.registroAcquisti) {
    const row = ra.addRow([
      f.data.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      f.fornitore, f.partitaIva || '— (mancante)', f.numero, f.categoria, f.imponibile, f.iva, f.totale,
    ]);[6, 7, 8].forEach((c) => (row.getCell(c).numFmt = EUR))
    if (!f.partitaIva) row.getCell(3).font = { color: { argb: WARN }, italic: true }
    aImp += f.imponibile; aIva += f.iva
  }
  if (dati.registroAcquisti.length > 0) {
    const rat = ra.addRow(['', 'TOTALE', '', '', '', round2(aImp), round2(aIva), round2(aImp + aIva)]);[6, 7, 8].forEach((c) => (rat.getCell(c).numFmt = EUR)); totaleRow(rat)
  }
  ra.views = [{ state: 'frozen', ySplit: 4 }]
  ra.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 8 } }

  // ── Liquidazione IVA ──
  const li = wb.addWorksheet('Liquidazione IVA', { properties: { tabColor: { argb: LIME } } })
  li.columns = [{ width: 44 }, { width: 18 }]
  titolo(li, `Liquidazione IVA · ${it.periodoLabel}`, 'Mensile')
  const L = dati.liquidazione
  const creditoNetto = L.saldo < 0
  for (const [k, v, b] of [
    ['IVA a debito (vendite)', round2(L.ivaDebito), false],
    ['− IVA a credito (fatture acquisti)', -round2(L.ivaCreditoAcquisti), false],
    ['− IVA a credito (costi fissi/servizi)', -round2(L.ivaCreditoCosti), false],
    [creditoNetto ? '= Credito IVA (a tuo favore)' : '= Saldo IVA da versare', round2(Math.abs(L.saldo)), true],
  ] as [string, number, boolean][]) {
    const row = li.addRow([k, v]); row.getCell(2).numFmt = EUR; if (b) totaleRow(row)
  }
  li.addRow([])
  li.addRow([creditoNetto ? 'Il credito si porta a compensazione dei periodi successivi.' : 'Da versare con modello F24 entro la scadenza di legge.']).font = { italic: true, color: { argb: GREY } }

  // ── Conto economico ──
  const ce = wb.addWorksheet('Conto economico', { properties: { tabColor: { argb: NAVY } } })
  ce.columns = [{ width: 38 }, { width: 18 }]
  titolo(ce, `Conto economico gestionale · ${it.periodoLabel}`, 'Valori netti IVA salvo Fatturato lordo.')
  const c = dati.conto
  for (const [k, v, b] of [
    ['Fatturato lordo', round2(c.fatturatoLordo), false], ['− IVA a debito', -round2(c.ivaDebito), false],
    ['= Fatturato netto', round2(c.fatturatoNetto), true],
    ['− Food & beverage cost', -round2(c.foodCostVenduto), false], ['= Primo margine', round2(c.primoMargine), true],
    ['− Costo del personale', -round2(c.laborCost), false], ['= Margine dopo personale', round2(c.margineDopoPersonale), true],
    ['− Quota costi fissi', -round2(c.quotaCostiFissi), false], ['= EBITDA gestionale', round2(c.ebitda), true],
    ['− Accantonamento imposte', -round2(c.accantonamentoImposte), false], ['= Utile netto stimato', round2(c.utileStimato), true],
  ] as [string, number, boolean][]) {
    const row = ce.addRow([k, v]); row.getCell(2).numFmt = EUR; if (b) totaleRow(row)
  }
  ce.addRow([])
  const mp = ce.addRow(['Margine netto %', c.marginePct]); mp.getCell(2).numFmt = '0.0%'; mp.font = { bold: true }

  // ── Dettaglio costi ──
  const dc = wb.addWorksheet('Dettaglio costi', { properties: { tabColor: { argb: NAVY } } })
  dc.columns = [{ width: 30 }, { width: 16 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 16 }]
  titolo(dc, 'Dettaglio costi del periodo', 'Costi fissi (quota del periodo) e costi una tantum.')
  headerRow(dc, ['Voce', 'Categoria', 'Imponibile', 'Aliquota', 'IVA', 'Periodicità', 'Quota periodo'])
  if (dati.costi.length === 0) {
    dc.addRow(['Nessun costo registrato nel periodo', '', '', '', '', '', '']).font = { italic: true, color: { argb: GREY } }
  }
  let tQuota = 0
  for (const k of dati.costi) {
    const row = dc.addRow([k.voce, k.categoria, k.imponibile, k.aliquota ? aliqLabel(k.aliquota) : 'esente', k.iva, k.periodicita, k.quotaPeriodo]);[3, 5, 7].forEach((c2) => (row.getCell(c2).numFmt = EUR))
    tQuota += k.quotaPeriodo
  }
  if (dati.costi.length > 0) {
    const dct = dc.addRow(['TOTALE quota del periodo', '', '', '', '', '', round2(tQuota)]); dct.getCell(7).numFmt = EUR; totaleRow(dct)
  }
  dc.views = [{ state: 'frozen', ySplit: 4 }]

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

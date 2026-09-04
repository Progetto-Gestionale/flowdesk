// Report contabile MENSILE per il commercialista (XLSX via exceljs).
// 4 fogli: Frontespizio · Corrispettivi giornalieri · Cassa del periodo · Dettaglio costi.
//
// Filosofia (allineata alla pagina Contabilità): niente registri IVA né liquidazione —
// su dati approssimativi davano una falsa precisione. Il report mostra ciò che è REALE e
// utile: i corrispettivi giornalieri (dagli ordini chiusi) e una vista di cassa semplice
// (incassi − costi principali = cassa che resta). Non è un bilancio: il commercialista
// resta il riferimento ufficiale, questo è un documento di supporto pulito.
//
// Principio: NESSUN numero lo inventa questo file. I dati arrivano da buildDatiReport,
// che riusa lo stesso motore della pagina (riepilogoContabile + vistaCassa) → i totali
// combaciano con l'app.

import ExcelJS from 'exceljs'
import { prisma } from '@/lib/prisma'
import { calcolaPeriodo } from './periodo'
import { riepilogoContabile } from './chiusuraGiorno'
import { vistaCassa, type VistaCassa } from './cassa'
import { importoMensile, lordoCosto } from './costiFissi'
import { WHERE_CONTO_CHIUSO } from '@/lib/ordini/contoChiuso'

const EUR = '#,##0.00 "€"'
const NAVY = 'FF0B1F3A', BLUE = 'FF1D4ED8', LIME = 'FFCDE85A', GREY = 'FF6B7280', LIGHT = 'FFF3F4F6'
const DAY = 86_400_000
const round2 = (n: number) => Math.round(n * 100) / 100

// ─────────────────────────────────────────────────────────────────────────────
// STRATO DATI — tutto deterministico, dallo schema Prisma.
// ─────────────────────────────────────────────────────────────────────────────

interface RigaGiorno {
  data: Date
  lordo: number
  scontrini: number
  coperti: number
  tavolo: number
  asporto: number
  delivery: number
}
interface RigaCosto {
  voce: string; categoria: string; periodicita: string; importoMensile: number; quotaPeriodo: number
}
export interface DatiReport {
  intestazione: {
    ragioneSociale: string; partitaIva: string; codiceFiscale: string
    indirizzo: string; nomeLocale: string; periodoLabel: string; generatoIl: string
  }
  cassa: VistaCassa
  acquisti: { numero: number; nettoMerci: number; nettoTotale: number }
  corrispettivi: RigaGiorno[]
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

  const [r, config, ordini, costiFissi, costiUnaTantum, user] = await Promise.all([
    riepilogoContabile(userId, p.inizio, p.fine),
    prisma.contabilitaConfig.findUnique({ where: { userId } }),
    prisma.ordine.findMany({
      where: { userId, createdAt: { gte: p.inizio, lt: p.fine }, ...WHERE_CONTO_CHIUSO },
      select: {
        createdAt: true, tipo: true, coperti: true,
        righe: { select: { prezzo: true, quantita: true } },
      },
    }),
    prisma.costoFisso.findMany({ where: { userId, attivo: true } }),
    prisma.costoUnaTantum.findMany({ where: { userId, dataInizio: { lt: p.fine }, dataFine: { gte: p.inizio } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { nomeLocale: true, indirizzo: true, name: true } }),
  ])

  // ── Corrispettivi giornalieri: aggrego gli ordini per giorno (fuso Roma), solo lordo ──
  const perGiornoMap = new Map<string, RigaGiorno>()
  for (const o of ordini) {
    const key = giornoRoma(o.createdAt)
    const g = perGiornoMap.get(key) ?? { data: new Date(key), lordo: 0, scontrini: 0, coperti: 0, tavolo: 0, asporto: 0, delivery: 0 }
    g.scontrini += 1
    g.coperti += o.coperti ?? 0
    const canale = o.tipo || 'tavolo'
    let lordoOrdine = 0
    for (const riga of o.righe) lordoOrdine += riga.prezzo * riga.quantita
    g.lordo += lordoOrdine
    if (canale === 'asporto') g.asporto += lordoOrdine
    else if (canale === 'delivery') g.delivery += lordoOrdine
    else g.tavolo += lordoOrdine
    perGiornoMap.set(key, g)
  }
  // Una riga per OGNI giorno di calendario del mese (anche i giorni senza incasso).
  const corrispettivi: RigaGiorno[] = []
  for (let t = p.inizio.getTime(); t < p.fine.getTime(); t += DAY) {
    const d = new Date(t)
    const key = giornoRoma(d)
    corrispettivi.push(perGiornoMap.get(key) ?? { data: d, lordo: 0, scontrini: 0, coperti: 0, tavolo: 0, asporto: 0, delivery: 0 })
  }

  // ── Dettaglio costi (riga per riga) ──
  const giorni = giorniTrascorsi(p.inizio, p.fine)
  const costi: RigaCosto[] = []
  for (const c of costiFissi) {
    const mensile = importoMensile(c) // LORDO normalizzato al mese
    costi.push({
      voce: c.voce, categoria: c.categoria, periodicita: c.periodicita,
      importoMensile: round2(mensile), quotaPeriodo: round2((mensile / 30) * giorni),
    })
  }
  for (const c of costiUnaTantum) {
    const q = lordoCosto(quotaUnaTantum(c, p.inizio, p.fine), c.aliquota)
    if (q <= 0) continue
    costi.push({ voce: c.voce, categoria: c.categoria, periodicita: 'una tantum', importoMensile: round2(lordoCosto(c.importoNetto, c.aliquota)), quotaPeriodo: round2(q) })
  }
  costi.sort((a, b) => b.quotaPeriodo - a.quotaPeriodo)

  const cassa = vistaCassa(r.conto)
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
      generatoIl,
    },
    cassa,
    acquisti: { numero: r.acquisti.numero, nettoMerci: round2(r.acquisti.nettoMerci), nettoTotale: round2(r.acquisti.nettoTotale) },
    corrispettivi,
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
  const k = dati.cassa

  // ── Frontespizio ──
  const fr = wb.addWorksheet('Frontespizio', { properties: { tabColor: { argb: NAVY } } })
  fr.columns = [{ width: 34 }, { width: 40 }]
  const band = fr.addRow(['FLOWEST', '']); band.height = 34
  band.getCell(1).font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } }
  band.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  band.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  fr.addRow(['Report di cassa per il commercialista']).font = { size: 12, color: { argb: GREY } }
  fr.addRow([])
  for (const [key, v] of [
    ['Ragione sociale', it.ragioneSociale], ['Partita IVA', it.partitaIva], ['Codice Fiscale', it.codiceFiscale],
    ['Indirizzo', it.indirizzo], ['Periodo di riferimento', it.periodoLabel], ['Generato il', it.generatoIl],
  ] as [string, string][]) {
    const row = fr.addRow([key, v])
    row.getCell(1).font = { bold: true, color: { argb: NAVY } }
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
  }
  fr.addRow([])
  fr.addRow(['CASSA DEL PERIODO']).font = { bold: true, size: 12, color: { argb: BLUE } }
  for (const [key, v, b] of [
    ['Incassi del periodo', round2(k.incassi), false],
    ['− Personale', -round2(k.personale), false],
    ['− Materie prime (food cost)', -round2(k.materiePrime), false],
    ['− Costi fissi', -round2(k.costiFissi), false],
    ['= Cassa che resta (stima)', round2(k.cassaResta), true],
  ] as [string, number, boolean][]) {
    const row = fr.addRow([key, v]); row.getCell(2).numFmt = EUR; if (b) totaleRow(row)
  }
  const pctRow = fr.addRow(['Cassa che resta sugli incassi', k.cassaPct]); pctRow.getCell(2).numFmt = '0.0%'; pctRow.font = { bold: true }
  fr.addRow([])
  fr.addRow(['⚠️ Cosa NON include la «cassa che resta»']).font = { bold: true, size: 11, color: { argb: NAVY } }
  for (const nota of [
    'Le tasse sul reddito (IRPEF/IRES/IRAP o imposta sostitutiva).',
    'Il saldo IVA da versare allo Stato (IVA su vendite e acquisti si compensano in grosso modo).',
    'Costi straordinari/occasionali non registrati ed eventuali prelievi del titolare.',
    'Il costo del personale include una stima dei contributi (moltiplicatore sulla paga netta).',
  ]) {
    fr.addRow([`• ${nota}`]).font = { size: 10, color: { argb: GREY } }
  }
  fr.addRow([])
  fr.addRow(['Documento di supporto generato da Flowest. Non è un bilancio e non sostituisce i registri']).font = { italic: true, size: 9, color: { argb: GREY } }
  fr.addRow(['fiscali ufficiali (registratore telematico / SdI). Verificare sempre col commercialista.']).font = { italic: true, size: 9, color: { argb: GREY } }

  // ── Corrispettivi giornalieri ──
  const co = wb.addWorksheet('Corrispettivi giornalieri', { properties: { tabColor: { argb: BLUE } } })
  co.columns = [{ width: 12 }, { width: 8 }, { width: 14 }, { width: 10 }, { width: 9 }, { width: 12 }, { width: 12 }, { width: 12 }]
  titolo(co, `Registro dei corrispettivi · ${it.periodoLabel}`, 'Incassi giornalieri (lordi) dagli ordini chiusi. Valori in euro.')
  headerRow(co, ['Data', 'Giorno', 'Incassi', 'Scontrini', 'Coperti', 'Tavolo', 'Asporto', 'Delivery'])
  const gg = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
  const tot = { lordo: 0, sc: 0, cop: 0, tav: 0, asp: 0, del: 0 }
  for (const g of dati.corrispettivi) {
    const row = co.addRow([
      g.data.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }), gg[g.data.getDay()],
      round2(g.lordo), g.scontrini, g.coperti, round2(g.tavolo), round2(g.asporto), round2(g.delivery),
    ]);[3, 6, 7, 8].forEach((c) => (row.getCell(c).numFmt = EUR))
    if (g.lordo === 0) row.font = { color: { argb: GREY }, italic: true }
    tot.lordo += g.lordo; tot.sc += g.scontrini; tot.cop += g.coperti; tot.tav += g.tavolo; tot.asp += g.asporto; tot.del += g.delivery
  }
  const trow = co.addRow(['TOTALE', '', round2(tot.lordo), tot.sc, tot.cop, round2(tot.tav), round2(tot.asp), round2(tot.del)]);
  [3, 6, 7, 8].forEach((c) => (trow.getCell(c).numFmt = EUR)); totaleRow(trow)
  co.views = [{ state: 'frozen', ySplit: 4 }]
  co.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 8 } }

  // ── Cassa del periodo ──
  const ca = wb.addWorksheet('Cassa del periodo', { properties: { tabColor: { argb: LIME } } })
  ca.columns = [{ width: 40 }, { width: 18 }]
  titolo(ca, `Cassa del periodo · ${it.periodoLabel}`, 'Incassi meno i costi principali. Al lordo di tasse e saldo IVA.')
  for (const [key, v, b] of [
    ['Incassi del periodo', round2(k.incassi), true],
    ['− Personale (costo azienda)', -round2(k.personale), false],
    ['− Materie prime (food cost)', -round2(k.materiePrime), false],
    ['− Costi fissi (affitto, utenze, servizi…)', -round2(k.costiFissi), false],
    ['= Cassa che resta (stima)', round2(k.cassaResta), true],
  ] as [string, number, boolean][]) {
    const row = ca.addRow([key, v]); row.getCell(2).numFmt = EUR; if (b) totaleRow(row)
  }
  ca.addRow([])
  const mp = ca.addRow(['Cassa che resta sugli incassi', k.cassaPct]); mp.getCell(2).numFmt = '0.0%'; mp.font = { bold: true }
  if (dati.acquisti.numero > 0) {
    ca.addRow([])
    ca.addRow(['MERCI: COMPRATO vs CONSUMATO']).font = { bold: true, size: 11, color: { argb: BLUE } }
    for (const [key, v, b] of [
      ['Acquisti dai fornitori (bolle)', round2(dati.acquisti.nettoMerci), false],
      ['− Materie prime consumate (nei piatti)', -round2(k.materiePrime), false],
      ['= Differenza (magazzino, scarti, omaggi)', round2(dati.acquisti.nettoMerci - k.materiePrime), true],
    ] as [string, number, boolean][]) {
      const row = ca.addRow([key, v]); row.getCell(2).numFmt = EUR; if (b) totaleRow(row)
    }
  }

  // ── Dettaglio costi ──
  const dc = wb.addWorksheet('Dettaglio costi', { properties: { tabColor: { argb: NAVY } } })
  dc.columns = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 16 }]
  titolo(dc, 'Dettaglio costi del periodo', 'Costi fissi (importo mensile e quota del periodo) e costi una tantum.')
  headerRow(dc, ['Voce', 'Categoria', 'Periodicità', 'Importo mensile', 'Quota periodo'])
  if (dati.costi.length === 0) {
    dc.addRow(['Nessun costo registrato nel periodo', '', '', '', '']).font = { italic: true, color: { argb: GREY } }
  }
  let tQuota = 0
  for (const c of dati.costi) {
    const row = dc.addRow([c.voce, c.categoria, c.periodicita, c.importoMensile, c.quotaPeriodo]);[4, 5].forEach((i) => (row.getCell(i).numFmt = EUR))
    tQuota += c.quotaPeriodo
  }
  if (dati.costi.length > 0) {
    const dct = dc.addRow(['TOTALE quota del periodo', '', '', '', round2(tQuota)]); dct.getCell(5).numFmt = EUR; totaleRow(dct)
  }
  dc.views = [{ state: 'frozen', ySplit: 4 }]

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

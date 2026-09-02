// Export contabile per il commercialista (XLSX via exceljs, già dipendenza del progetto).
// Un workbook con 3 fogli: Conto Economico, Ricavi (per reparto/canale), Costi fissi.
// I dati sono netti IVA e con l'IVA evidenziata: pronti da consegnare, non sostituiscono
// il commercialista ma gli danno numeri puliti.

import ExcelJS from 'exceljs'
import type { RiepilogoContabile } from './chiusuraGiorno'

const EUR = '#,##0.00 "€"'

export async function generaReportContabile(
  r: RiepilogoContabile,
  meta: { nomeLocale: string; periodoLabel: string },
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Flowest'
  wb.created = new Date()

  const c = r.conto

  // ── Foglio 1 · Conto Economico ──────────────────────────────────────────────
  const ce = wb.addWorksheet('Conto Economico')
  ce.columns = [{ width: 34 }, { width: 16 }]
  ce.addRow([meta.nomeLocale]).font = { bold: true, size: 14 }
  ce.addRow([`Conto economico gestionale · ${meta.periodoLabel}`]).font = { italic: true, color: { argb: 'FF666666' } }
  ce.addRow([])

  const voci: [string, number, boolean?][] = [
    ['Fatturato Lordo', c.fatturatoLordo],
    ['− IVA a debito (vendite)', -c.ivaDebito],
    ['= Fatturato Netto (imponibile)', c.fatturatoNetto, true],
    ['− Food & Beverage cost', -c.foodCostVenduto],
    ['= Primo margine', c.primoMargine, true],
    ['− Labor cost', -c.laborCost],
    ['= Margine dopo personale', c.margineDopoPersonale, true],
    ['− Quota costi fissi', -c.quotaCostiFissi],
    ['= EBITDA gestionale', c.ebitda, true],
    ['− Accantonamento imposte', -c.accantonamentoImposte],
    ['= Utile netto stimato', c.utileStimato, true],
  ]
  for (const [label, val, bold] of voci) {
    const row = ce.addRow([label, val])
    row.getCell(2).numFmt = EUR
    if (bold) row.font = { bold: true }
  }
  ce.addRow([])
  const mrow = ce.addRow(['Margine netto %', c.marginePct])
  mrow.getCell(2).numFmt = '0.0%'
  mrow.font = { bold: true }

  ce.addRow([])
  ce.addRow(['Cassetto fiscale IVA', '']).font = { bold: true }
  const ivaRows: [string, number][] = [
    ['IVA a debito (vendite)', c.ivaDebito],
    ['IVA a credito (acquisti/fissi)', c.ivaCredito],
    ['IVA netta da versare', c.ivaNetta],
  ]
  for (const [label, val] of ivaRows) {
    const row = ce.addRow([label, val])
    row.getCell(2).numFmt = EUR
  }

  // ── Foglio 2 · Ricavi ───────────────────────────────────────────────────────
  const ric = wb.addWorksheet('Ricavi')
  ric.columns = [{ width: 24 }, { width: 16 }]
  ric.addRow(['Ricavi netti per reparto']).font = { bold: true }
  for (const x of r.perReparto) ric.addRow([x.reparto, x.netto]).getCell(2).numFmt = EUR
  ric.addRow([])
  ric.addRow(['Ricavi netti per canale']).font = { bold: true }
  for (const x of r.perCanale) ric.addRow([x.canale, x.netto]).getCell(2).numFmt = EUR

  // ── Foglio 3 · Costi fissi ──────────────────────────────────────────────────
  const cf = wb.addWorksheet('Costi fissi')
  cf.columns = [{ width: 24 }, { width: 16 }]
  cf.addRow(['Categoria costo', `Quota ${meta.periodoLabel}`]).font = { bold: true }
  for (const x of r.perCategoriaCosto) cf.addRow([x.categoria, x.importo]).getCell(2).numFmt = EUR

  // ── Foglio 4 · Registro IVA (castelletto per aliquota) ──────────────────────
  const reg = wb.addWorksheet('Registro IVA')
  reg.columns = [{ width: 14 }, { width: 16 }, { width: 16 }]
  const aliqLabel = (a: number) => (a === 0 ? 'Esente' : `${Math.round(a * 100)}%`)

  reg.addRow(['IVA sulle vendite (a debito)']).font = { bold: true }
  reg.addRow(['Aliquota', 'Imponibile', 'IVA']).font = { italic: true, color: { argb: 'FF666666' } }
  for (const v of r.ivaVenditePerAliquota) {
    const row = reg.addRow([aliqLabel(v.aliquota), v.imponibile, v.iva])
    row.getCell(2).numFmt = EUR; row.getCell(3).numFmt = EUR
  }
  reg.addRow([])
  reg.addRow(['IVA sugli acquisti (a credito)']).font = { bold: true }
  reg.addRow(['Aliquota', 'Imponibile', 'IVA']).font = { italic: true, color: { argb: 'FF666666' } }
  if (r.ivaAcquistiPerAliquota.length === 0) {
    reg.addRow(['—', 'Nessuna bolla registrata', ''])
  } else {
    for (const a of r.ivaAcquistiPerAliquota) {
      const row = reg.addRow([aliqLabel(a.aliquota), a.imponibile, a.iva])
      row.getCell(2).numFmt = EUR; row.getCell(3).numFmt = EUR
    }
  }
  reg.addRow([])
  const saldo = reg.addRow(['Saldo IVA del periodo', '', c.ivaNetta])
  saldo.getCell(3).numFmt = EUR; saldo.font = { bold: true }
  reg.addRow([c.ivaNetta < 0 ? 'Credito a tuo favore (si porta avanti)' : 'Da versare allo Stato (F24)'])
    .getCell(1).font = { italic: true, color: { argb: 'FF666666' } }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

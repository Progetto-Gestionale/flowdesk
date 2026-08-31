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

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'

// ─────────────────────────────────────────────────────────────────────────────
// F3c — Import di una Fattura Elettronica SdI (XML FatturaPA). Deterministico, ZERO
// AI: legge il castelletto IVA (DatiRiepilogo: imponibile per aliquota) + fornitore e
// data, e precompila il form in /contabilita/acquisti. Come l'OCR, NON salva: il
// titolare conferma e la POST /api/contabilita/fatture crea la bolla. Stesso formato di
// risposta dell'OCR ({ estratto }) così il client riusa lo stesso prefill.
// ─────────────────────────────────────────────────────────────────────────────

// Match di un tag ignorando l'eventuale prefisso di namespace (es. <p:Data>).
function tag(xml: string, nome: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${nome}>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(m[1].trim())
  return out
}
const first = (xml: string, nome: string): string | null => tag(xml, nome)[0] ?? null

// Blocco di un elemento (col contenuto), per limitare la ricerca (es. dentro CedentePrestatore).
function blocco(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}>([\\s\\S]*?)</(?:\\w+:)?${nome}>`))
  return m ? m[1] : null
}

const ALIQUOTE = [0, 0.04, 0.1, 0.22]
// Porta l'aliquota XML (es. "10.00") alla frazione ammessa più vicina.
function normAliquota(s: string): number | null {
  const perc = Number(s)
  if (!Number.isFinite(perc)) return null
  const fr = perc / 100
  const vicina = ALIQUOTE.reduce((best, a) => (Math.abs(a - fr) < Math.abs(best - fr) ? a : best), ALIQUOTE[0])
  return Math.abs(vicina - fr) <= 0.01 ? vicina : null
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { xml } = (await req.json().catch(() => ({}))) as { xml?: string }
  if (!xml || typeof xml !== 'string' || !/FatturaElettronica/i.test(xml)) {
    return NextResponse.json({ error: 'File XML non valido (atteso una Fattura Elettronica).' }, { status: 400 })
  }

  // Fornitore = cedente/prestatore: Denominazione, oppure Nome + Cognome.
  const cedente = blocco(xml, 'CedentePrestatore') ?? xml
  const fornitore = first(cedente, 'Denominazione')
    ?? ([first(cedente, 'Nome'), first(cedente, 'Cognome')].filter(Boolean).join(' ') || null)

  // Numero e data dai dati generali del documento.
  const generali = blocco(xml, 'DatiGeneraliDocumento') ?? xml
  const numero = first(generali, 'Numero')
  const dataRaw = first(generali, 'Data') // formato ISO "YYYY-MM-DD" nella FatturaPA
  const data = dataRaw && /^\d{4}-\d{2}-\d{2}/.test(dataRaw) ? dataRaw.slice(0, 10) : null

  // Castelletto: un DatiRiepilogo per aliquota (AliquotaIVA + ImponibileImporto).
  const righe: { imponibile: number; aliquota: number }[] = []
  for (const r of tag(xml, 'DatiRiepilogo')) {
    const al = first(r, 'AliquotaIVA')
    const imp = first(r, 'ImponibileImporto')
    if (al == null || imp == null) continue
    const aliquota = normAliquota(al)
    const imponibile = Number(imp)
    if (aliquota == null || !Number.isFinite(imponibile) || imponibile <= 0) continue
    righe.push({ imponibile: Math.round(imponibile * 100) / 100, aliquota })
  }

  if (righe.length === 0) {
    return NextResponse.json({ error: 'Non ho trovato il riepilogo IVA nell’XML. Inseriscila a mano.' }, { status: 422 })
  }

  return NextResponse.json({
    estratto: { fornitore, numero, data, categoria: 'merci', righe },
  })
}

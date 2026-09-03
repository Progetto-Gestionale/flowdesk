import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { registraSpesaBrief } from '@/lib/copilot/spesa'

// ─────────────────────────────────────────────────────────────────────────────
// F3b — OCR di una foto/PDF di bolla fornitore con Claude vision. NON salva niente:
// estrae i campi (fornitore, data, imponibile per aliquota dal "Riepilogo IVA") e li
// restituisce per PRECOMPILARE il form in /contabilita/acquisti. Il titolare rivede e
// conferma → il salvataggio resta la POST /api/contabilita/fatture (owner-in-the-loop).
// Nessun dato inventato: se un campo non è leggibile, torna null e lo mette l'utente.
// ─────────────────────────────────────────────────────────────────────────────

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = process.env.COPILOT_OCR_MODEL ?? 'claude-haiku-4-5'
const MEDIA_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const PROMPT = `Sei un estrattore di dati da fatture/bolle di fornitori italiani per la ristorazione.
Guarda l'immagine della fattura e restituisci SOLO un JSON con questa forma esatta:
{
  "fornitore": string | null,        // ragione sociale del FORNITORE (cedente), non del ristorante
  "numero": string | null,           // numero documento
  "data": string | null,             // data documento in formato "YYYY-MM-DD"
  "categoria": "merci" | "bevande" | "servizi" | "altro",
  "righe": [ { "imponibile": number, "aliquota": number } ]  // dal riepilogo IVA: imponibile NETTO per aliquota (aliquota come frazione: 0.04, 0.1, 0.22, 0 esente)
}
Regole ferree:
- Usa il riquadro "Riepilogo IVA"/"Castelletto" se presente: una riga per ogni aliquota.
- imponibile = importo SENZA IVA. aliquota come frazione (10% → 0.1).
- Non inventare: se un valore non è leggibile con certezza, mettilo a null (o ometti la riga).
- "categoria": "bevande" se è un fornitore di vini/bibite, "merci" per cibo, "servizi" per utenze/servizi, altrimenti "altro".
Rispondi con IL SOLO JSON, senza testo attorno.`

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try { return JSON.parse(t) } catch {}
  const m = t.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}

const ALIQUOTE = [0, 0.04, 0.1, 0.22]

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { image, mediaType } = (await req.json().catch(() => ({}))) as { image?: string; mediaType?: string }
  if (!image || typeof image !== 'string') return NextResponse.json({ error: 'Immagine mancante' }, { status: 400 })
  const media = MEDIA_OK.includes(mediaType ?? '') ? (mediaType as string) : 'image/jpeg'
  // Accetta sia dataURL ("data:...;base64,XXX") sia base64 puro.
  const base64 = image.includes(',') ? image.split(',')[1] : image
  if (base64.length > 8_000_000) return NextResponse.json({ error: 'Immagine troppo grande (max ~6MB)' }, { status: 400 })

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media as 'image/jpeg', data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    })
    await registraSpesaBrief(user.id, {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cachedInputTokens: res.usage.cache_read_input_tokens ?? undefined,
    }).catch(() => null)

    const testo = res.content.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('')
    const raw = parseJson(testo) as null | {
      fornitore?: unknown; numero?: unknown; data?: unknown; categoria?: unknown; righe?: unknown
    }
    if (!raw) return NextResponse.json({ error: 'Non sono riuscito a leggere la fattura. Riprova con una foto più nitida.' }, { status: 422 })

    // Sanifichiamo l'output del modello: teniamo solo righe valide, mai numeri inventati.
    const righe = Array.isArray(raw.righe)
      ? raw.righe
          .map((r: { imponibile?: unknown; aliquota?: unknown }) => ({ imponibile: Number(r.imponibile), aliquota: Number(r.aliquota) }))
          .filter((r) => Number.isFinite(r.imponibile) && r.imponibile > 0 && ALIQUOTE.includes(r.aliquota))
      : []
    const cat = ['merci', 'bevande', 'servizi', 'altro'].includes(String(raw.categoria)) ? String(raw.categoria) : 'merci'
    const data = typeof raw.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.data) ? raw.data : null

    return NextResponse.json({
      estratto: {
        fornitore: typeof raw.fornitore === 'string' ? raw.fornitore : null,
        numero: typeof raw.numero === 'string' ? raw.numero : null,
        data,
        categoria: cat,
        righe,
      },
    })
  } catch (e: unknown) {
    console.error('[COPILOT] OCR bolla errore:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'Errore nella lettura della fattura.' }, { status: 500 })
  }
}

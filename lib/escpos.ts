import type { Comanda } from '@/lib/comanda'

// Generazione ESC/POS "a mano" per la comanda su carta 80mm (48 colonne a font A).
// Niente libreria (node-thermal-printer): il payload dev'essere puro e trasportabile (base64) verso
// un transport qualsiasi (Mock/PrintNode/agente), e ci serve controllo pieno su layout e ACCENTI.
// Codepage: PC858 (ESC t 19) — CP850 + simbolo €. Gli accenti italiani si mappano ai byte CP858
// qui sotto; i caratteri fuori mappa vengono traslitterati (à→a) o resi '?'.

const LARGHEZZA = 48 // colonne font A su 80mm

// --- Comandi ESC/POS ---
const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a
const INIT = Buffer.from([ESC, 0x40]) // ESC @  (reset)
const CODEPAGE_858 = Buffer.from([ESC, 0x74, 19]) // ESC t 19  (PC858)
const ALIGN_L = Buffer.from([ESC, 0x61, 0])
const ALIGN_C = Buffer.from([ESC, 0x61, 1])
const BOLD_ON = Buffer.from([ESC, 0x45, 1])
const BOLD_OFF = Buffer.from([ESC, 0x45, 0])
// GS ! n → dimensione carattere: n = (moltWidth-1)<<4 | (moltHeight-1)
const size = (w: number, h: number) => Buffer.from([GS, 0x21, ((w - 1) << 4) | (h - 1)])
const SIZE_1 = size(1, 1)
const SIZE_2 = size(2, 2)
const FEED = (n: number) => Buffer.from([ESC, 0x64, n]) // ESC d n  (avanza n righe)
const CUT = Buffer.from([GS, 0x56, 66, 0]) // GS V 66 0  (taglio parziale con avanzamento)

// Accenti/simboli italiani → byte CP858 (= CP850 tranne € a 0xD5).
const CP858: Record<string, number> = {
  à: 0x85, è: 0x8a, é: 0x82, ì: 0x8d, í: 0xa1, ò: 0x95, ó: 0xa2, ù: 0x97, ú: 0xa3,
  À: 0xb7, È: 0xd4, É: 0x90, Ì: 0xde, Í: 0xd6, Ò: 0xe3, Ó: 0xe0, Ù: 0xeb, Ú: 0xe9,
  ç: 0x87, Ç: 0x80, ñ: 0xa4, Ñ: 0xa5, '€': 0xd5, '°': 0xf8, '£': 0x9c, '§': 0x15,
  '«': 0xae, '»': 0xaf, '“': 0x22, '”': 0x22, '‘': 0x27, '’': 0x27, '–': 0x2d, '—': 0x2d,
}
// Fallback ASCII per accenti non voluti/ignoti (evita '?' quando possibile).
const TRANSLIT: Record<string, string> = {
  à: 'a', è: 'e', é: 'e', ì: 'i', í: 'i', ò: 'o', ó: 'o', ù: 'u', ú: 'u',
  À: 'A', È: 'E', É: 'E', Ì: 'I', Í: 'I', Ò: 'O', Ó: 'O', Ù: 'U', Ú: 'U', ç: 'c', Ç: 'C',
}

// Codifica una stringa nei byte CP858 (una riga di testo già formattata).
function enc(s: string): Buffer {
  const out: number[] = []
  for (const ch of s) {
    if (ch in CP858) out.push(CP858[ch])
    else {
      const code = ch.charCodeAt(0)
      if (code >= 0x20 && code < 0x7f) out.push(code)
      else if (ch in TRANSLIT) out.push(TRANSLIT[ch].charCodeAt(0))
      else out.push(0x3f) // '?'
    }
  }
  return Buffer.from(out)
}

// Testo + LF, codificato.
function riga(s = ''): Buffer {
  return Buffer.concat([enc(s), Buffer.from([LF])])
}

// Riga di separazione a tutta larghezza.
function separatore(ch = '-'): Buffer {
  return riga(ch.repeat(LARGHEZZA))
}

// Etichetta della portata (coursing), solo se l'ordine ha più di una mandata.
function labelMandata(n: number): string {
  return n === 1 ? '1ª portata' : n === 2 ? '2ª portata' : n === 3 ? '3ª portata' : `${n}ª portata`
}

// Genera i byte ESC/POS della comanda. Layout pensato per essere letto al volo in cucina:
// reparto e tavolo GRANDI in cima, righe a doppia altezza, note e allergeni evidenti, taglio finale.
export function escposComanda(c: Comanda): Buffer {
  const parti: Buffer[] = [INIT, CODEPAGE_858]

  // Intestazione: reparto (grande, centrato) + etichetta ordine + ora.
  parti.push(ALIGN_C, SIZE_2, BOLD_ON, riga(c.reparto.toUpperCase()), BOLD_OFF, SIZE_1)
  parti.push(SIZE_2, riga(c.etichetta), SIZE_1)
  parti.push(riga(`Ore ${c.ora}`))
  parti.push(ALIGN_L, separatore('='))

  // Righe, raggruppate per mandata (mostra l'header portata solo se ce n'è più d'una).
  const mandate = [...new Set(c.righe.map((r) => r.mandata))].sort((a, b) => a - b)
  const multiMandata = mandate.length > 1
  for (const m of mandate) {
    if (multiMandata) {
      parti.push(ALIGN_C, BOLD_ON, riga(`— ${labelMandata(m)} —`), BOLD_OFF, ALIGN_L)
    }
    for (const r of c.righe.filter((x) => x.mandata === m)) {
      parti.push(SIZE_2, BOLD_ON, riga(`${r.quantita}x ${r.nome}`), BOLD_OFF, SIZE_1)
      if (r.note && r.note.trim()) parti.push(riga(`   >> ${r.note.trim()}`))
    }
  }

  parti.push(separatore('-'))
  if (c.allergeni && c.allergeni.length) {
    parti.push(BOLD_ON, riga(`ALLERGENI: ${c.allergeni.join(', ')}`), BOLD_OFF)
  }
  if (c.noteOrdine) parti.push(riga(`Note: ${c.noteOrdine}`))

  parti.push(FEED(4), CUT)
  return Buffer.concat(parti)
}

// --- Anteprima testo (stessa struttura, senza byte di controllo) ---
// Serve a verificare il layout SENZA stampante: è ciò che salviamo in PrintJob.anteprima e mostriamo
// nell'UI. Usa la stessa larghezza (48) e lo stesso ordine di elementi del ticket reale.

function centra(s: string, w = LARGHEZZA): string {
  if (s.length >= w) return s.slice(0, w)
  const pad = Math.floor((w - s.length) / 2)
  return ' '.repeat(pad) + s
}

export function testoComanda(c: Comanda): string {
  const L: string[] = []
  L.push(centra('*** ' + c.reparto.toUpperCase() + ' ***'))
  L.push(centra(c.etichetta))
  L.push(centra(`Ore ${c.ora}`))
  L.push('='.repeat(LARGHEZZA))

  const mandate = [...new Set(c.righe.map((r) => r.mandata))].sort((a, b) => a - b)
  const multiMandata = mandate.length > 1
  for (const m of mandate) {
    if (multiMandata) L.push(centra(`— ${labelMandata(m)} —`))
    for (const r of c.righe.filter((x) => x.mandata === m)) {
      L.push(`${r.quantita}x ${r.nome}`)
      if (r.note && r.note.trim()) L.push(`   >> ${r.note.trim()}`)
    }
  }

  L.push('-'.repeat(LARGHEZZA))
  if (c.allergeni && c.allergeni.length) L.push(`ALLERGENI: ${c.allergeni.join(', ')}`)
  if (c.noteOrdine) L.push(`Note: ${c.noteOrdine}`)
  return L.join('\n')
}

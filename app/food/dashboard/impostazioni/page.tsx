'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  IconHome, IconClock, IconRefresh, IconUsers, IconSettings, IconCalendar,
  IconFork, IconCard, IconInfo, IconHelp, IconUser, IconCheck,
  IconChat, IconCamera, IconPin,
} from '@/app/components/icons'
import { preparaFoto } from '@/lib/uploadFoto'

const SETTORI = [
  'Ristorazione', 'Biomedica', 'Consulenza', 'E-commerce',
  'Immobiliare', 'Fitness & Wellness', 'Avvocati & Studi legali',
  'Artigianato', 'Moda & Beauty', 'Educazione & Formazione', 'Altro',
]

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const GIORNI_LABEL: Record<string, string> = {
  lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì',
  ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica',
}

const GIORNI_LUNGHI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

const SEZIONI = [
  { id: 'generale', label: 'Locale', Icon: IconHome },
  { id: 'orari', label: 'Orari', Icon: IconClock },
  { id: 'turni', label: 'Turni', Icon: IconRefresh },
  { id: 'prenotazioni', label: 'Prenotazioni', Icon: IconCalendar },
  { id: 'menu', label: 'Menu & Offerta', Icon: IconFork },
  { id: 'camerieri', label: 'Camerieri', Icon: IconUsers },
  { id: 'pagamenti', label: 'Pagamenti', Icon: IconCard },
  { id: 'bot', label: 'ID pubblico', Icon: IconInfo },
  { id: 'account', label: 'Account', Icon: IconUser },
]

interface TurnoServizio { id: string; nome: string; oraInizio: string; oraFine: string }
interface FabbisognoFascia { giorno: number; oraInizio: string; oraFine: string; persone: number; ruolo: string; fascia: string }

const SERVIZI_LISTA = [
  { id: 'tavolo', label: 'Prenotazione tavolo' },
  { id: 'asporto', label: 'Asporto' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'eventi', label: 'Eventi privati' },
  { id: 'catering', label: 'Catering' },
  { id: 'aperitivo', label: 'Aperitivo / Cocktail' },
  { id: 'brunch', label: 'Brunch' },
  { id: 'degustazione', label: 'Menu degustazione' },
]

const PAGAMENTI_LISTA = [
  { id: 'contanti', label: 'Contanti' },
  { id: 'carta', label: 'Carta di credito/debito' },
  { id: 'satispay', label: 'Satispay' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'bonifico', label: 'Bonifico bancario' },
  { id: 'buoni', label: 'Buoni pasto' },
]

type Orari = Record<string, string>
type Servizi = Record<string, boolean>
type Pagamenti = string[]
interface Regole {
  preavvisoMinMinuti: string
  preavvisoOrdiniMinMinuti: string
  anticipoMaxGiorni: string
  copertiMin: string
  copertiMax: string
  durataMedia: string
  fasceOrdini: string
  noteAggiuntive: string
  bloccoAutoTavoli: boolean
  modalitaOrario: 'libero' | 'turni'
  tempoMinimoArrivoMinuti: string // minuti prima della fine turno entro cui il cliente deve presentarsi
}
interface Menu { tipoCucina: string; specialita: string; nonDisponibile: string; allergeniGestiti: string }
interface InfoPratiche { parcheggio: string; accessibile: boolean; animali: boolean; dresscode: string; altro: string }
interface Faq { domanda: string; risposta: string }

function jp<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

const cls = 'w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue'

// Stato per-sezione
type SezioneStatus = { saving: boolean; saved: boolean; dirty: boolean; error?: string }
const initStatus = (): SezioneStatus => ({ saving: false, saved: false, dirty: false })

// ── Strumenti menù asporto ────────────────────────────────────────────────────
function MenuStrumenti({ publicId }: { publicId: string }) {
  const [copiato, setCopiato] = useState<string | null>(null)

  function copia(key: string, value: string) {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopiato(key)
    setTimeout(() => setCopiato(null), 2000)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const menuUrl = publicId ? `${origin}/menu/${publicId}` : null
  const prenotaUrl = publicId ? `${origin}/prenota/${publicId}` : null
  const qrUrl = menuUrl ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(menuUrl)}&size=300x300` : null
  const qrPrenotaUrl = prenotaUrl ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(prenotaUrl)}&size=300x300` : null
  const embedCode = menuUrl ? `<iframe src="${menuUrl}" width="100%" height="700" frameborder="0" style="border-radius:12px"></iframe>` : null

  if (!publicId) return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mt-4">
      <p className="text-sm font-semibold text-amber-800 mb-1">ID pubblico non configurato</p>
      <p className="text-sm text-amber-700">Vai in <strong>Impostazioni → Locale</strong> e imposta un ID pubblico. Sarà parte del link del menù asporto.</p>
    </div>
  )

  return (
    <div className="space-y-4 mt-4">
      <h3 className="font-semibold text-ink-navy text-sm">Strumenti menù Asporto & Delivery</h3>

      {/* Link */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-3">
        <p className="font-medium text-ink-navy text-sm">Link diretto menù</p>
        <p className="text-xs text-ink-navy/50">Condividilo su WhatsApp, Instagram bio, Google My Business, ecc.</p>
        <div className="flex gap-2">
          <input readOnly value={menuUrl!}
            className="flex-1 bg-mist border border-ink-navy/10 rounded-xl px-3 py-2 text-xs text-ink-navy/70 font-mono" />
          <button onClick={() => copia('link', menuUrl!)}
            className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90 shrink-0">
            {copiato === 'link' ? '✓' : 'Copia'}
          </button>
        </div>
        <a href={menuUrl!} target="_blank" rel="noopener noreferrer"
          className="inline-block text-xs text-electric-blue hover:underline">Apri anteprima →</a>
      </div>

      {/* Link prenotazioni */}
      <div className="bg-white rounded-2xl border border-electric-blue/25 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🔗</span>
          <p className="font-medium text-ink-navy text-sm">Link prenotazioni & ordini</p>
          <span className="text-[10px] font-bold uppercase tracking-wide bg-electric-blue/10 text-electric-blue px-2 py-0.5 rounded-full">Nuovo</span>
        </div>
        <p className="text-xs text-ink-navy/50">Pagina unica con prenotazione tavolo + menu asporto/delivery. Mandala su WhatsApp, mettila in bio o nel sito.</p>
        <div className="flex gap-2">
          <input readOnly value={prenotaUrl!}
            className="flex-1 bg-mist border border-ink-navy/10 rounded-xl px-3 py-2 text-xs text-ink-navy/70 font-mono" />
          <button onClick={() => copia('prenota', prenotaUrl!)}
            className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90 shrink-0">
            {copiato === 'prenota' ? '✓' : 'Copia'}
          </button>
        </div>
        <div className="flex items-center gap-4">
          <a href={prenotaUrl!} target="_blank" rel="noopener noreferrer"
            className="text-xs text-electric-blue hover:underline">Apri anteprima →</a>
          <div className="flex items-center gap-2">
            <img src={qrPrenotaUrl!} alt="QR prenotazioni" className="w-12 h-12 rounded-lg border border-ink-navy/10" />
            <a href={qrPrenotaUrl!} download="prenota-qr.png" target="_blank" rel="noopener noreferrer"
              className="text-xs text-ink-navy/50 hover:text-electric-blue underline">Scarica QR</a>
          </div>
        </div>
      </div>

      {/* QR */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-3">
        <p className="font-medium text-ink-navy text-sm">QR Code</p>
        <p className="text-xs text-ink-navy/50">Da condividere sui social, in vetrina o sul packaging.</p>
        <div className="flex gap-5 items-start">
          <img src={qrUrl!} alt="QR menù asporto" className="w-28 h-28 rounded-xl border border-ink-navy/10" />
          <div className="space-y-2 flex-1">
            <a href={qrUrl!} download={`menu-asporto-qr.png`} target="_blank" rel="noopener noreferrer"
              className="block w-full text-center px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90">
              Scarica PNG
            </a>
            <button onClick={() => copia('qr', qrUrl!)}
              className="block w-full text-center px-4 py-2 rounded-xl border border-ink-navy/15 text-ink-navy/70 text-sm font-medium hover:bg-mist">
              {copiato === 'qr' ? '✓ Copiato' : 'Copia URL'}
            </button>
          </div>
        </div>
      </div>

      {/* Embed */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-3">
        <p className="font-medium text-ink-navy text-sm">Incorpora sul sito web</p>
        <p className="text-xs text-ink-navy/50">Incolla questo codice HTML nel tuo sito.</p>
        <div className="bg-mist rounded-xl p-3 font-mono text-xs text-ink-navy/70 break-all">{embedCode}</div>
        <button onClick={() => copia('embed', embedCode!)}
          className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90">
          {copiato === 'embed' ? '✓ Copiato' : 'Copia codice'}
        </button>
      </div>
    </div>
  )
}

// ── Strumenti camerieri ───────────────────────────────────────────────────────
function CamerieriStrumenti({ publicId }: { publicId: string }) {
  const [copiato, setCopiato] = useState<string | null>(null)
  const [pinAttivo, setPinAttivo] = useState<boolean | null>(null)
  const [nuovoPin, setNuovoPin] = useState('')
  const [salvandoPin, setSalvandoPin] = useState(false)
  const [msgPin, setMsgPin] = useState('')

  useEffect(() => {
    fetch('/api/cameriere/pin', { credentials: 'include' })
      .then(r => r.json()).then(d => setPinAttivo(!!d.pinAttivo)).catch(() => setPinAttivo(false))
  }, [])

  function copia(key: string, value: string) {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopiato(key)
    setTimeout(() => setCopiato(null), 2000)
  }

  async function salvaPin(pin: string) {
    setSalvandoPin(true); setMsgPin('')
    try {
      const res = await fetch('/api/cameriere/pin', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsgPin(d.error ?? 'Errore'); return }
      setPinAttivo(!!d.pinAttivo); setNuovoPin('')
      setMsgPin(d.pinAttivo ? '✓ PIN aggiornato' : '✓ PIN rimosso')
      setTimeout(() => setMsgPin(''), 2500)
    } finally { setSalvandoPin(false) }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const camUrl = publicId ? `${origin}/cameriere/${publicId}` : null
  const qrUrl = camUrl ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(camUrl)}&size=300x300` : null

  if (!publicId) return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mt-4">
      <p className="text-sm font-semibold text-amber-800 mb-1">ID pubblico non configurato</p>
      <p className="text-sm text-amber-700">Vai in <strong>Impostazioni → Locale</strong> e imposta un ID pubblico. Sarà parte del link della pagina camerieri.</p>
    </div>
  )

  return (
    <div className="space-y-4 mt-4">
      <h3 className="font-semibold text-ink-navy text-sm">Pagina camerieri</h3>
      <p className="text-xs text-ink-navy/50 -mt-2">Da questa pagina i camerieri scelgono uno o più tavoli (i conti si uniscono in automatico) e prendono gli ordini con lo stesso menu del cliente. Aprila sul tablet/telefono del locale.</p>

      {/* Link */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-3">
        <p className="font-medium text-ink-navy text-sm">Link pagina camerieri</p>
        <div className="flex gap-2">
          <input readOnly value={camUrl!}
            className="flex-1 bg-mist border border-ink-navy/10 rounded-xl px-3 py-2 text-xs text-ink-navy/70 font-mono" />
          <button onClick={() => copia('link', camUrl!)}
            className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90 shrink-0">
            {copiato === 'link' ? '✓' : 'Copia'}
          </button>
        </div>
        <a href={camUrl!} target="_blank" rel="noopener noreferrer"
          className="inline-block text-xs text-electric-blue hover:underline">Apri anteprima →</a>
      </div>

      {/* QR */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-3">
        <p className="font-medium text-ink-navy text-sm">QR Code</p>
        <p className="text-xs text-ink-navy/50">Stampalo e tienilo in cassa: i camerieri lo scansionano per accedere.</p>
        <div className="flex gap-5 items-start">
          <img src={qrUrl!} alt="QR camerieri" className="w-28 h-28 rounded-xl border border-ink-navy/10" />
          <div className="space-y-2 flex-1">
            <a href={qrUrl!} download="camerieri-qr.png" target="_blank" rel="noopener noreferrer"
              className="block w-full text-center px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90">
              Scarica PNG
            </a>
            <button onClick={() => copia('qr', qrUrl!)}
              className="block w-full text-center px-4 py-2 rounded-xl border border-ink-navy/15 text-ink-navy/70 text-sm font-medium hover:bg-mist">
              {copiato === 'qr' ? '✓ Copiato' : 'Copia URL'}
            </button>
          </div>
        </div>
      </div>

      {/* PIN */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <p className="font-medium text-ink-navy text-sm">PIN di accesso</p>
          {pinAttivo !== null && (
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${pinAttivo ? 'bg-green-100 text-green-700' : 'bg-ink-navy/10 text-ink-navy/50'}`}>
              {pinAttivo ? 'Attivo' : 'Nessun PIN'}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-navy/50">Chi apre la pagina inserisce il PIN una sola volta: resta memorizzato sul dispositivo anche dopo il blocco schermo. Lascia vuoto e rimuovi per accesso libero.</p>
        <div className="flex gap-2">
          <input type="text" inputMode="numeric" value={nuovoPin}
            onChange={e => setNuovoPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder={pinAttivo ? 'Nuovo PIN (4–8 cifre)' : 'Imposta un PIN (4–8 cifre)'}
            className="flex-1 bg-mist border border-ink-navy/10 rounded-xl px-3 py-2 text-sm text-ink-navy tracking-widest" />
          <button onClick={() => salvaPin(nuovoPin)} disabled={salvandoPin || nuovoPin.length < 4}
            className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90 shrink-0 disabled:opacity-40">
            {salvandoPin ? '...' : 'Salva'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          {pinAttivo && (
            <button onClick={() => salvaPin('')} disabled={salvandoPin}
              className="text-xs text-red-500 hover:underline">Rimuovi PIN (accesso libero)</button>
          )}
          {msgPin && <span className="text-xs text-green-600 font-medium">{msgPin}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Strumenti prenotazioni ────────────────────────────────────────────────────
function PrenotazioniStrumenti({ publicId }: { publicId: string }) {
  const [copiato, setCopiato] = useState<string | null>(null)

  function copia(key: string, value: string) {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopiato(key)
    setTimeout(() => setCopiato(null), 2000)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const prenotaUrl = `${origin}/prenota/${publicId}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(prenotaUrl)}&size=400x400`
  const buttonCode = `<a href="${prenotaUrl}" target="_blank" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-family:sans-serif;font-weight:600">Prenota ora</a>`
  const iframeCode = `<iframe src="${prenotaUrl}" width="100%" height="700" frameborder="0" style="border-radius:12px"></iframe>`

  return (
    <div className="space-y-4 mb-4">
      <h3 className="font-semibold text-ink-navy text-sm">Strumenti prenotazioni & ordini</h3>

      {/* Link */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-3">
        <p className="font-medium text-ink-navy text-sm">Link prenotazioni</p>
        <p className="text-xs text-ink-navy/50">Pagina pubblica con form prenotazione tavolo + menu asporto/delivery. Condividilo su WhatsApp, Instagram bio, Google My Business.</p>
        <div className="flex gap-2">
          <input readOnly value={prenotaUrl}
            className="flex-1 bg-mist border border-ink-navy/10 rounded-xl px-3 py-2 text-xs text-ink-navy/70 font-mono" />
          <button onClick={() => copia('link', prenotaUrl)}
            className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90 shrink-0">
            {copiato === 'link' ? '✓' : 'Copia'}
          </button>
        </div>
        <a href={prenotaUrl} target="_blank" rel="noopener noreferrer"
          className="inline-block text-xs text-electric-blue hover:underline">Apri anteprima →</a>
      </div>

      {/* QR */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-3">
        <p className="font-medium text-ink-navy text-sm">QR Code prenotazioni</p>
        <p className="text-xs text-ink-navy/50">Stampalo e posizionalo all&apos;entrata, sul menu cartaceo o in vetrina.</p>
        <div className="flex gap-6 items-start">
          <img src={qrUrl} alt="QR prenotazioni" className="w-36 h-36 rounded-xl border border-ink-navy/10 shrink-0" />
          <div className="space-y-2 flex-1">
            <a href={qrUrl} download="prenota-qr.png" target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90">
              ↓ Scarica PNG
            </a>
            <button onClick={() => copia('qr', qrUrl)}
              className="w-full px-4 py-2 rounded-xl border border-ink-navy/15 text-ink-navy/70 text-sm font-medium hover:bg-mist">
              {copiato === 'qr' ? '✓ Copiato URL' : 'Copia URL QR'}
            </button>
          </div>
        </div>
      </div>

      {/* Pulsante per sito */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-3">
        <p className="font-medium text-ink-navy text-sm">Pulsante &ldquo;Prenota ora&rdquo; per il sito</p>
        <p className="text-xs text-ink-navy/50">Incolla questo codice HTML nel tuo sito web per aggiungere un pulsante di prenotazione.</p>
        <div className="bg-mist rounded-xl p-3 font-mono text-xs text-ink-navy/70 break-all">{buttonCode}</div>
        <div className="flex gap-2">
          <button onClick={() => copia('btn', buttonCode)}
            className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90">
            {copiato === 'btn' ? '✓ Copiato' : 'Copia codice'}
          </button>
          <a href={prenotaUrl} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl border border-ink-navy/15 text-ink-navy/70 text-sm font-medium hover:bg-mist">
            Anteprima →
          </a>
        </div>
      </div>

      {/* iframe embed */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-3">
        <p className="font-medium text-ink-navy text-sm">Incorpora pagina intera nel sito</p>
        <p className="text-xs text-ink-navy/50">La pagina di prenotazione comparirà direttamente all&apos;interno del tuo sito.</p>
        <div className="bg-mist rounded-xl p-3 font-mono text-xs text-ink-navy/70 break-all">{iframeCode}</div>
        <button onClick={() => copia('iframe', iframeCode)}
          className="px-4 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90">
          {copiato === 'iframe' ? '✓ Copiato' : 'Copia codice'}
        </button>
      </div>
    </div>
  )
}

// ── PDF menu strumenti ────────────────────────────────────────────────────────
function MenuPdfStrumenti() {
  const [generando, setGenerando] = useState<string | null>(null)

  async function scaricaPdf(tipo: 'locale' | 'asporto') {
    setGenerando(tipo)
    try {
      const res = await fetch(`/api/menu/categorie?tipo=${tipo}`, { credentials: 'include' })
      const data = await res.json()
      const categorie: { nome: string; piatti: { nome: string; descrizione: string | null; prezzo: number; disponibile: boolean }[] }[] = data.categorie ?? []
      const tipoLabel = tipo === 'locale' ? 'Menu Tavoli' : 'Menu Asporto & Delivery'

      const righe = categorie.map(cat => `
        <div class="categoria">
          <div class="cat-header">${cat.nome}</div>
          ${cat.piatti.filter(p => p.disponibile).map(p => `
            <div class="piatto">
              <div class="piatto-info">
                <span class="piatto-nome">${p.nome}</span>
                ${p.descrizione ? `<span class="piatto-desc">${p.descrizione}</span>` : ''}
              </div>
              <span class="piatto-prezzo">€${p.prezzo.toFixed(2)}</span>
            </div>
          `).join('')}
        </div>
      `).join('')

      const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
        <title>${tipoLabel}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0 }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1f36; background: #fff; padding: 40px; max-width: 700px; margin: 0 auto }
          h1 { font-size: 26px; font-weight: 800; color: #1a1f36; margin-bottom: 4px }
          .subtitle { font-size: 12px; color: #888; margin-bottom: 32px }
          .categoria { margin-bottom: 28px }
          .cat-header { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 6px; margin-bottom: 12px }
          .piatto { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f0f0f0 }
          .piatto-info { flex: 1 }
          .piatto-nome { font-size: 14px; font-weight: 600; display: block }
          .piatto-desc { font-size: 12px; color: #777; display: block; margin-top: 2px }
          .piatto-prezzo { font-size: 14px; font-weight: 700; color: #4f46e5; white-space: nowrap }
          @media print { body { padding: 20px } }
        </style>
      </head><body>
        <h1>${tipoLabel}</h1>
        <p class="subtitle">Generato il ${new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        ${righe || '<p style="color:#999;font-size:14px">Nessun piatto disponibile</p>'}
        <script>window.onload = () => { window.print() }<\/script>
      </body></html>`

      const w = window.open('', '_blank')
      if (w) { w.document.write(html); w.document.close() }
    } finally {
      setGenerando(null)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 space-y-4 mb-4">
      <div>
        <p className="font-semibold text-ink-navy text-sm">Scarica PDF menu</p>
        <p className="text-xs text-ink-navy/50 mt-1">Genera un PDF stampabile con tutti i piatti disponibili.</p>
      </div>
      <div className="flex gap-3 flex-wrap">
        <button onClick={() => scaricaPdf('locale')} disabled={generando === 'locale'}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ink-navy text-white text-sm font-semibold hover:bg-ink-navy/80 disabled:opacity-50 transition-colors">
          {generando === 'locale' ? 'Generazione...' : '↓ PDF Menu Tavoli'}
        </button>
        <button onClick={() => scaricaPdf('asporto')} disabled={generando === 'asporto'}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90 disabled:opacity-50 transition-colors">
          {generando === 'asporto' ? 'Generazione...' : '↓ PDF Menu Asporto & Delivery'}
        </button>
      </div>
    </div>
  )
}

export default function Impostazioni() {
  const searchParams = useSearchParams()
  const [sezioneAttiva, setSezioneAttiva] = useState(() => searchParams.get('sezione') ?? 'generale')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Record<string, SezioneStatus>>(() =>
    Object.fromEntries(SEZIONI.map(s => [s.id, initStatus()]))
  )

  // Dati per sezione
  const [name, setName] = useState('')
  const [niche, setNiche] = useState('')
  const [nomeLocale, setNomeLocale] = useState('')
  const [indirizzo, setIndirizzo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [sitoWeb, setSitoWeb] = useState('')
  const [orari, setOrari] = useState<Orari>({})
  const [servizi, setServizi] = useState<Servizi>({})
  const [regole, setRegole] = useState<Regole>({ preavvisoMinMinuti: '', preavvisoOrdiniMinMinuti: '', anticipoMaxGiorni: '', copertiMin: '', copertiMax: '', durataMedia: '', fasceOrdini: '', noteAggiuntive: '', bloccoAutoTavoli: false, modalitaOrario: 'libero', tempoMinimoArrivoMinuti: '' })
  const [menu, setMenu] = useState<Menu>({ tipoCucina: '', specialita: '', nonDisponibile: '', allergeniGestiti: '' })
  const [pagamenti, setPagamenti] = useState<Pagamenti>([])
  const [info, setInfo] = useState<InfoPratiche>({ parcheggio: '', accessibile: false, animali: false, dresscode: '', altro: '' })
  const [faq, setFaq] = useState<Faq[]>([])
  const [publicId, setPublicId] = useState('')
  const [turniServizio, setTurniServizio] = useState<TurnoServizio[]>([])
  const [fabbisogno, setFabbisogno] = useState<FabbisognoFascia[]>([])
  const [grafica, setGrafica] = useState({ menuLogoUrl: '', menuColoreP: '#4f46e5', menuColoreS: '#ffffff' })
  const [graficaStatus, setGraficaStatus] = useState<SezioneStatus>(initStatus())
  const [caricandoLogo, setCaricandoLogo] = useState(false)

  // Carica il logo dal dispositivo: compressione lato client → data URL in menuLogoUrl
  async function onSelezionaLogo(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Seleziona un file immagine (JPG, PNG…).'); return }
    setCaricandoLogo(true)
    try {
      const url = await preparaFoto(file, 400, 0.8) // logo piccolo: lato max 400px
      setGrafica(g => ({ ...g, menuLogoUrl: url }))
      setGraficaStatus(s => ({ ...s, dirty: true, saved: false }))
    } catch {
      alert('Non è stato possibile elaborare l\'immagine. Riprova con un\'altra foto.')
    } finally {
      setCaricandoLogo(false)
    }
  }

  // Marca la sezione come dirty quando l'utente modifica qualcosa
  const dirty = useCallback((id: string) => {
    setStatus(prev => ({ ...prev, [id]: { ...prev[id], dirty: true, saved: false, error: undefined } }))
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/profile', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/settings', { credentials: 'include' }).then(r => r.json()),
    ]).then(([profile, s]) => {
      if (profile.user) { setName(profile.user.name ?? ''); setNiche(profile.user.niche ?? '') }
      setNomeLocale(s.nomeLocale ?? '')
      setIndirizzo(s.indirizzo ?? '')
      setTelefono(s.telefono ?? '')
      setSitoWeb(s.sitoWeb ?? '')
      setOrari(jp(s.orariApertura, {}))
      setServizi(jp(s.serviziOfferti, {}))
      const defaults: Regole = { preavvisoMinMinuti: '', preavvisoOrdiniMinMinuti: '', anticipoMaxGiorni: '', copertiMin: '', copertiMax: '', durataMedia: '', fasceOrdini: '', noteAggiuntive: '', bloccoAutoTavoli: false, modalitaOrario: 'libero', tempoMinimoArrivoMinuti: '' }
      setRegole({ ...defaults, ...jp(s.regolePrenotazione, {}) })
      setMenu(jp(s.menuOfferta, { tipoCucina: '', specialita: '', nonDisponibile: '', allergeniGestiti: '' }))
      setPagamenti(jp(s.pagamenti, []))
      setInfo(jp(s.infoPratiche, { parcheggio: '', accessibile: false, animali: false, dresscode: '', altro: '' }))
      setFaq(jp(s.faq, []))
      setPublicId(s.publicId ?? '')
      setGrafica({ menuLogoUrl: s.menuLogoUrl ?? '', menuColoreP: s.menuColoreP ?? '#4f46e5', menuColoreS: s.menuColoreS ?? '#ffffff' })
      const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
      const ts: TurnoServizio[] = jp(s.turniServizio, [])
      ts.sort((a, b) => toMin(a.oraInizio) - toMin(b.oraInizio))
      setTurniServizio(ts)
      setFabbisogno(jp(s.fabbisognoStaff, []))
      // Marca come salvato solo le sezioni che hanno dati nel DB
      setStatus(prev => ({
        ...prev,
        generale: { saving: false, saved: !!(s.nomeLocale), dirty: false },
        orari: { saving: false, saved: !!s.orariApertura, dirty: false },
        servizi: { saving: false, saved: !!s.serviziOfferti, dirty: false },
        prenotazioni: { saving: false, saved: !!s.regolePrenotazione, dirty: false },
        menu: { saving: false, saved: !!s.menuOfferta, dirty: false },
        pagamenti: { saving: false, saved: !!s.pagamenti, dirty: false },
        info: { saving: false, saved: !!s.infoPratiche, dirty: false },
        faq: { saving: false, saved: !!s.faq, dirty: false },
        turni: { saving: false, saved: !!s.turniServizio, dirty: false },
        staff: { saving: false, saved: !!s.fabbisognoStaff, dirty: false },
        bot: { saving: false, saved: !!s.publicId, dirty: false },
        account: { saving: false, saved: !!(profile.user?.name), dirty: false },
      }))
    }).finally(() => setLoading(false))
  }, [])

  async function saveSezione(id: string, payload: Record<string, unknown>) {
    setStatus(prev => ({ ...prev, [id]: { ...prev[id], saving: true } }))
    try {
      const res = await fetch(id === 'account' ? '/api/profile' : '/api/settings', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id === 'account' ? { name, niche } : payload),
      })
      const json = await res.json()
      if (!res.ok) { console.error('[saveSezione]', res.status, json); throw new Error(json.error || `Errore ${res.status}`) }
      // Il server conferma il publicId salvato: rifletti il valore
      if (typeof json.publicId === 'string' && json.publicId !== publicId) setPublicId(json.publicId)
      setStatus(prev => ({ ...prev, [id]: { saving: false, saved: true, dirty: false, error: undefined } }))
    } catch (e) {
      console.error('[saveSezione] catch:', e)
      setStatus(prev => ({ ...prev, [id]: { saving: false, saved: false, dirty: true, error: e instanceof Error ? e.message : 'Errore nel salvataggio' } }))
    }
  }

  async function salvaGrafica() {
    setGraficaStatus(s => ({ ...s, saving: true }))
    try {
      await fetch('/api/settings', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(grafica),
      })
      setGraficaStatus({ saving: false, saved: true, dirty: false })
    } catch {
      setGraficaStatus(s => ({ ...s, saving: false }))
    }
  }


  if (loading) return <div className="text-ink-navy/35 text-sm p-6">Caricamento...</div>

  const st = (id: string) => status[id] ?? initStatus()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-navy">Impostazioni</h1>
        <p className="text-ink-navy/50 mt-0.5">Più informazioni inserisci, più le pagine pubbliche del tuo locale saranno complete.</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 shrink-0">
          <nav className="space-y-0.5 sticky top-4">
            {SEZIONI.map(s => {
              const sst = st(s.id)
              return (
                <button key={s.id} onClick={() => setSezioneAttiva(s.id)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors font-medium flex items-center gap-2.5 ${sezioneAttiva === s.id ? 'bg-electric-blue text-white' : 'text-ink-navy/60 hover:bg-mist'}`}>
                  <span className="w-4 h-4 shrink-0"><s.Icon /></span>
                  <span className="flex-1">{s.label}</span>
                  {sst.saved && !sst.dirty && <span className={`w-3 h-3 shrink-0 ${sezioneAttiva === s.id ? 'text-electric-blue/50' : 'text-green-500'}`}><IconCheck /></span>}
                  {sst.dirty && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sezioneAttiva === s.id ? 'bg-white/60' : 'bg-amber-400'}`} />}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Contenuto */}
        <div className="flex-1 min-w-0">

          {sezioneAttiva === 'generale' && (
            <Section title="Il locale" subtitle="Informazioni di base del tuo locale, mostrate ai clienti sulle pagine pubbliche."
              onSave={() => saveSezione('generale', { nomeLocale, indirizzo, telefono, sitoWeb })}
              status={st('generale')}>
              <Field label="Nome del locale *">
                <input type="text" value={nomeLocale} onChange={e => { setNomeLocale(e.target.value); dirty('generale') }}
                  placeholder="Ristorante Da Mario" className={cls} />
              </Field>
              <Field label="Indirizzo">
                <input type="text" value={indirizzo} onChange={e => { setIndirizzo(e.target.value); dirty('generale') }}
                  placeholder="Via Roma 12, 00100 Roma" className={cls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefono">
                  <input type="tel" value={telefono} onChange={e => { setTelefono(e.target.value); dirty('generale') }}
                    placeholder="+39 06 1234567" className={cls} />
                </Field>
                <Field label="Sito web">
                  <input type="url" value={sitoWeb} onChange={e => { setSitoWeb(e.target.value); dirty('generale') }}
                    placeholder="https://ristorante.it" className={cls} />
                </Field>
              </div>
            </Section>
          )}

          {sezioneAttiva === 'orari' && (
            <Section title="Orari di apertura" subtitle="Indica gli orari per ogni giorno. Puoi specificare pranzo e cena separati da virgola."
              onSave={() => saveSezione('orari', { orariApertura: JSON.stringify(orari) })}
              status={st('orari')}>
              <div className="space-y-2">
                {GIORNI.map(g => (
                  <div key={g} className="flex items-center gap-3">
                    <span className="text-sm text-ink-navy/60 w-24 shrink-0">{GIORNI_LABEL[g]}</span>
                    <input type="text" value={orari[g] ?? ''} onChange={e => { setOrari(prev => ({ ...prev, [g]: e.target.value })); dirty('orari') }}
                      placeholder='12:00-15:00, 19:00-23:00' className={cls} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-navy/35 mt-2">Lascia vuoto se chiuso quel giorno</p>
            </Section>
          )}

          {sezioneAttiva === 'turni' && (
            <Section title="Turni di servizio" subtitle="Definisci i turni della giornata. Vengono usati nella mappa tavoli e come orari consentiti nella pagina pubblica di prenotazione tavoli (hanno priorità sugli orari di apertura)."
              onSave={() => saveSezione('turni', { turniServizio: JSON.stringify(turniServizio) })}
              status={st('turni')}>
              <div className="space-y-3">
                {turniServizio.length === 0 && (
                  <p className="text-sm text-ink-navy/35 text-center py-3">Nessun turno configurato. Aggiungine uno.</p>
                )}
                {turniServizio.map((t, i) => (
                  <div key={t.id} className="bg-mist border border-ink-navy/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider">Turno {i + 1}</span>
                      <button onClick={() => { setTurniServizio(prev => prev.filter((_, j) => j !== i)); dirty('turni') }}
                        className="text-xs text-red-400 hover:text-red-600 font-medium">Rimuovi</button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-ink-navy/60 mb-1">Nome turno</label>
                        <input type="text" value={t.nome}
                          onChange={e => { setTurniServizio(prev => prev.map((x, j) => j === i ? { ...x, nome: e.target.value } : x)); dirty('turni') }}
                          placeholder="es. Pranzo" className={cls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-navy/60 mb-1">Inizio</label>
                        <input type="time" step={900} value={t.oraInizio}
                          onChange={e => { setTurniServizio(prev => prev.map((x, j) => j === i ? { ...x, oraInizio: e.target.value } : x)); dirty('turni') }}
                          className={cls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-navy/60 mb-1">Fine</label>
                        <input type="time" step={900} value={t.oraFine}
                          onChange={e => { setTurniServizio(prev => prev.map((x, j) => j === i ? { ...x, oraFine: e.target.value } : x)); dirty('turni') }}
                          className={cls} />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => {
                  setTurniServizio(prev => [...prev, { id: crypto.randomUUID(), nome: '', oraInizio: '12:00', oraFine: '15:00' }])
                  dirty('turni')
                }} className="w-full text-sm text-electric-blue font-semibold border-2 border-dashed border-electric-blue/25 rounded-xl py-3 hover:bg-electric-blue/10 transition-colors">
                  + Aggiungi turno
                </button>
                {turniServizio.length > 0 && (
                  <div className="bg-electric-blue/10 border border-electric-blue/15 rounded-lg px-4 py-3 text-xs text-electric-blue space-y-1">
                    <p className="font-semibold">Turni configurati:</p>
                    {turniServizio.map(t => (
                      <p key={t.id}>{t.nome || '(senza nome)'} — {t.oraInizio}–{t.oraFine}</p>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}


          {sezioneAttiva === 'prenotazioni' && (
            <>
            {publicId && <PrenotazioniStrumenti publicId={publicId} />}
            <Section title="Prenotazione tavoli" subtitle="Regole per la pagina pubblica di prenotazione."
              onSave={() => saveSezione('prenotazioni', { regolePrenotazione: JSON.stringify(regole) })}
              status={st('prenotazioni')}>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                Per gli orari consentiti vengono usati i <strong>Turni di servizio</strong> (se impostati), altrimenti gli <strong>Orari di apertura</strong>. Configurali nella rispettiva sezione.
              </div>

              {/* Modalità scelta orario */}
              <div>
                <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wider mb-2">Modalità scelta orario</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { val: 'libero', label: 'Orario libero', desc: 'Il cliente sceglie qualsiasi orario nella fascia di servizio' },
                    { val: 'turni', label: 'Solo turni', desc: 'Il cliente sceglie il turno (es. 1° turno cena 19:30–21:30), non l\'orario esatto' },
                  ] as const).map(o => (
                    <button key={o.val} type="button"
                      onClick={() => { setRegole(r => ({ ...r, modalitaOrario: o.val })); dirty('prenotazioni') }}
                      className={`p-3 rounded-xl border-2 text-left transition-colors ${regole.modalitaOrario === o.val ? 'border-electric-blue bg-electric-blue/10' : 'border-ink-navy/10 bg-white hover:border-ink-navy/20'}`}>
                      <p className={`text-sm font-semibold ${regole.modalitaOrario === o.val ? 'text-electric-blue' : 'text-ink-navy/70'}`}>{o.label}</p>
                      <p className={`text-xs mt-0.5 leading-tight ${regole.modalitaOrario === o.val ? 'text-electric-blue/70' : 'text-ink-navy/35'}`}>{o.desc}</p>
                    </button>
                  ))}
                </div>
                {regole.modalitaOrario === 'turni' && turniServizio.length === 0 && (
                  <p className="text-xs text-amber-600 mt-2">Nessun turno configurato — vai alla sezione <strong>Turni</strong> per aggiungerne.</p>
                )}
                {regole.modalitaOrario === 'turni' && (
                  <Field label="Tempo minimo arrivo (min)" hint="Il cliente deve presentarsi almeno N minuti prima della fine del turno. Es. 60 = se il turno finisce alle 21:30, il cliente non può prenotare dopo le 20:30.">
                    <input type="number" min={0} value={regole.tempoMinimoArrivoMinuti} onChange={e => { setRegole(r => ({ ...r, tempoMinimoArrivoMinuti: e.target.value })); dirty('prenotazioni') }}
                      placeholder="es. 60" className={cls} />
                  </Field>
                )}
              </div>

              {/* Blocco automatico */}
              <Toggle
                label="Blocca slot quando i tavoli sono esauriti"
                checked={regole.bloccoAutoTavoli}
                onChange={v => { setRegole(r => ({ ...r, bloccoAutoTavoli: v })); dirty('prenotazioni') }}
              />
              {regole.bloccoAutoTavoli && (
                <p className="text-xs text-ink-navy/40 -mt-1">Quando tutti i tavoli risultano occupati per un certo orario, quel turno/orario non viene più offerto ai clienti.</p>
              )}

              {/* Limiti */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Preavviso minimo (min)" hint="Es. 120 = non si può prenotare a meno di 2 ore dall'orario scelto">
                  <input type="number" min={0} value={regole.preavvisoMinMinuti} onChange={e => { setRegole(r => ({ ...r, preavvisoMinMinuti: e.target.value })); dirty('prenotazioni') }}
                    placeholder="es. 60" className={cls} />
                </Field>
                <Field label="Anticipo massimo (giorni)" hint="Es. 30 = si può prenotare al massimo 30 giorni in anticipo">
                  <input type="number" min={0} value={regole.anticipoMaxGiorni} onChange={e => { setRegole(r => ({ ...r, anticipoMaxGiorni: e.target.value })); dirty('prenotazioni') }}
                    placeholder="es. 30" className={cls} />
                </Field>
                <Field label="Coperti minimi">
                  <input type="number" min={1} value={regole.copertiMin} onChange={e => { setRegole(r => ({ ...r, copertiMin: e.target.value })); dirty('prenotazioni') }}
                    placeholder="1" className={cls} />
                </Field>
                <Field label="Coperti massimi">
                  <input type="number" min={1} value={regole.copertiMax} onChange={e => { setRegole(r => ({ ...r, copertiMax: e.target.value })); dirty('prenotazioni') }}
                    placeholder="es. 10" className={cls} />
                </Field>
                <Field label="Durata media tavola (min)">
                  <input type="number" min={0} value={regole.durataMedia} onChange={e => { setRegole(r => ({ ...r, durataMedia: e.target.value })); dirty('prenotazioni') }}
                    placeholder="90" className={cls} />
                </Field>
              </div>

              <Field label="Note aggiuntive">
                <textarea value={regole.noteAggiuntive} onChange={e => { setRegole(r => ({ ...r, noteAggiuntive: e.target.value })); dirty('prenotazioni') }}
                  rows={3} placeholder="es. Per gruppi superiori a 8 persone è richiesto un menu fisso." className={`${cls} resize-none`} />
              </Field>
            </Section>

            <Section title="Ordini asporto & delivery" subtitle="Regole per gli ordini da asporto e delivery."
              onSave={() => saveSezione('prenotazioni', { regolePrenotazione: JSON.stringify(regole) })}
              status={st('prenotazioni')}>
              <Field label="Preavviso minimo ordini (min)" hint="Es. 30 = il cliente non può ordinare con meno di 30 minuti di anticipo">
                <input type="number" min={0} value={regole.preavvisoOrdiniMinMinuti} onChange={e => { setRegole(r => ({ ...r, preavvisoOrdiniMinMinuti: e.target.value })); dirty('prenotazioni') }}
                  placeholder="es. 30" className={cls} />
              </Field>
              <Field label="Fasce orarie ordini" hint="Sovrascrivono gli orari di apertura per ordini asporto/delivery. Es: 12:00-14:30, 19:00-23:00">
                <input type="text" value={regole.fasceOrdini} onChange={e => { setRegole(r => ({ ...r, fasceOrdini: e.target.value })); dirty('prenotazioni') }}
                  placeholder="es. 12:00-14:30, 19:00-23:00" className={cls} />
              </Field>
            </Section>
            </>
          )}

          {sezioneAttiva === 'menu' && (
            <>
              <MenuPdfStrumenti />

              {/* Aspetto menu */}
              <div className="bg-white border border-ink-navy/10 rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-ink-navy">Aspetto del menu digitale</h2>
                    <p className="text-sm text-ink-navy/50 mt-0.5">Logo e colori mostrati sul menu digitale e sulla pagina asporto.</p>
                  </div>
                  <button onClick={salvaGrafica} disabled={graficaStatus.saving}
                    className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors ${graficaStatus.saved && !graficaStatus.dirty ? 'bg-emerald-100 text-emerald-700' : 'bg-electric-blue text-white hover:bg-electric-blue/90'} disabled:opacity-50`}>
                    {graficaStatus.saving ? 'Salvataggio...' : graficaStatus.saved && !graficaStatus.dirty ? '✓ Salvato' : 'Salva'}
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-ink-navy/70 mb-1">Logo</label>
                    {grafica.menuLogoUrl ? (
                      <div className="flex items-center gap-3">
                        <img src={grafica.menuLogoUrl} alt="preview logo" className="h-14 w-14 rounded-xl object-cover border border-ink-navy/10" />
                        <button type="button" onClick={() => { setGrafica(g => ({ ...g, menuLogoUrl: '' })); setGraficaStatus(s => ({ ...s, dirty: true, saved: false })) }}
                          className="text-xs font-semibold text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">Rimuovi</button>
                      </div>
                    ) : (
                      <label className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed border-ink-navy/15 rounded-xl py-5 transition-colors ${caricandoLogo ? 'opacity-60' : 'cursor-pointer hover:bg-mist hover:border-electric-blue/40'}`}>
                        <span className="text-sm font-semibold text-electric-blue">{caricandoLogo ? 'Caricamento…' : '📷 Carica logo'}</span>
                        <span className="text-xs text-ink-navy/35">JPG o PNG dal tuo dispositivo</span>
                        <input type="file" accept="image/*" className="hidden" disabled={caricandoLogo}
                          onChange={e => { onSelezionaLogo(e.target.files?.[0] ?? null); e.target.value = '' }} />
                      </label>
                    )}
                    <details className="mt-2">
                      <summary className="text-xs text-ink-navy/40 cursor-pointer select-none">oppure incolla un URL</summary>
                      <input value={grafica.menuLogoUrl.startsWith('data:') ? '' : grafica.menuLogoUrl}
                        onChange={e => { setGrafica(g => ({ ...g, menuLogoUrl: e.target.value })); setGraficaStatus(s => ({ ...s, dirty: true, saved: false })) }}
                        placeholder="https://esempio.com/logo.png" className={`mt-1.5 ${cls}`} />
                    </details>
                  </div>
                  <div className="flex gap-6 flex-wrap">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-ink-navy/70">Colore principale</label>
                      <p className="text-xs text-ink-navy/35">Bottoni, prezzi, tab categorie</p>
                      <div className="flex items-center gap-3 mt-1">
                        <input type="color" value={grafica.menuColoreP}
                          onChange={e => { setGrafica(g => ({ ...g, menuColoreP: e.target.value })); setGraficaStatus(s => ({ ...s, dirty: true, saved: false })) }}
                          className="w-12 h-10 rounded-lg border border-ink-navy/15 cursor-pointer p-0.5" />
                        <span className="text-sm font-mono text-ink-navy/60">{grafica.menuColoreP}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-ink-navy/70">Colore secondario</label>
                      <p className="text-xs text-ink-navy/35">Testo sui bottoni colorati</p>
                      <div className="flex items-center gap-3 mt-1">
                        <input type="color" value={grafica.menuColoreS}
                          onChange={e => { setGrafica(g => ({ ...g, menuColoreS: e.target.value })); setGraficaStatus(s => ({ ...s, dirty: true, saved: false })) }}
                          className="w-12 h-10 rounded-lg border border-ink-navy/15 cursor-pointer p-0.5" />
                        <span className="text-sm font-mono text-ink-navy/60">{grafica.menuColoreS}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-ink-navy/8 bg-mist space-y-2">
                    <p className="text-xs text-ink-navy/35 mb-3">Anteprima</p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm" style={{ color: grafica.menuColoreP }}>€12.00</span>
                      <button className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
                        style={{ backgroundColor: grafica.menuColoreP, color: grafica.menuColoreS }}>+</button>
                    </div>
                    <button className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ backgroundColor: grafica.menuColoreP, color: grafica.menuColoreS }}>
                      Vedi ordine · €24.00
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {sezioneAttiva === 'camerieri' && (
            <div>
              <h2 className="font-semibold text-ink-navy text-lg">Camerieri</h2>
              <p className="text-xs text-ink-navy/40 mt-0.5">Pagina pubblica per prendere gli ordini al tavolo dal telefono/tablet del locale.</p>
              <CamerieriStrumenti publicId={publicId} />
            </div>
          )}

          {sezioneAttiva === 'pagamenti' && (
            <Section title="Metodi di pagamento" subtitle="Il bot informerà i clienti su come possono pagare."
              onSave={() => saveSezione('pagamenti', { pagamenti: JSON.stringify(pagamenti) })}
              status={st('pagamenti')}>
              <div className="grid grid-cols-2 gap-3">
                {PAGAMENTI_LISTA.map(p => (
                  <button key={p.id} onClick={() => { setPagamenti(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]); dirty('pagamenti') }}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${pagamenti.includes(p.id) ? 'border-electric-blue bg-electric-blue/10' : 'border-ink-navy/10 bg-white hover:border-ink-navy/15'}`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${pagamenti.includes(p.id) ? 'bg-electric-blue border-electric-blue' : 'border-ink-navy/15'}`}>
                      {pagamenti.includes(p.id) && <span className="w-2.5 h-2.5 text-white"><IconCheck /></span>}
                    </div>
                    <span className={`text-sm font-medium ${pagamenti.includes(p.id) ? 'text-electric-blue' : 'text-ink-navy/70'}`}>{p.label}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}


          {sezioneAttiva === 'bot' && (() => {
            const origin = typeof window !== 'undefined' ? window.location.origin : ''
            const loginDip = publicId ? `${origin}/dipendente/login/${publicId}` : ''
            return (
            <Section title="ID pubblico del locale" subtitle="Identificativo unico del tuo locale, usato per l'area dipendenti e per i link pubblici (menu e prenotazioni)."
              onSave={() => saveSezione('bot', { publicId: publicId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || null })}
              status={st('bot')}>
              {publicId && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                  <span className="text-lg leading-none">⚠️</span>
                  <div className="text-sm text-amber-800 space-y-1">
                    <p className="font-semibold">Cambiare l'ID rompe i link già condivisi</p>
                    <p className="text-amber-700">Se modifichi l'ID pubblico, tutti i link e QR <strong>già stampati o condivisi</strong> (area dipendenti, camerieri, menu, prenotazioni, QR sui tavoli) smetteranno di funzionare.</p>
                    <p className="text-amber-700">I link e i QR mostrati qui nel gestionale si aggiornano automaticamente col nuovo ID: dovrai solo <strong>riscaricarli, ristamparli e ricondividerli</strong>. Nessun dato viene perso e i dipendenti restano collegati.</p>
                  </div>
                </div>
              )}
              <Field label="ID pubblico" hint="Solo lettere minuscole, numeri e trattini. Deve essere unico tra tutti i locali Flowest: se è già in uso da un altro locale, il salvataggio viene bloccato e dovrai sceglierne un altro. Cambiandolo cambia anche il link dell'area dipendenti, quindi modificalo solo se necessario.">
                <input type="text" value={publicId} onChange={e => { setPublicId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); dirty('bot') }}
                  placeholder="ristorante-mario" className={cls} />
              </Field>
              {publicId ? (
                <div className="bg-mist border border-ink-navy/10 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide mb-1.5">Area dipendenti — link di accesso</p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-ink-navy bg-white border border-ink-navy/10 rounded-lg px-3 py-1.5 flex-1 truncate">{loginDip}</code>
                      <button onClick={() => navigator.clipboard.writeText(loginDip)}
                        className="text-xs bg-white border border-ink-navy/15 text-ink-navy/70 font-semibold px-3 py-1.5 rounded-lg hover:bg-mist shrink-0">Copia</button>
                    </div>
                  </div>
                  <p className="text-xs text-ink-navy/40">Lo stesso ID è usato anche nei link pubblici <code className="text-ink-navy/60">/menu/{publicId}</code>, <code className="text-ink-navy/60">/prenota/{publicId}</code> e <code className="text-ink-navy/60">/cameriere/{publicId}</code>.</p>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm text-amber-700">Imposta un ID pubblico per generare il link di accesso dell'area dipendenti.</p>
                </div>
              )}
            </Section>
            )
          })()}

          {sezioneAttiva === 'account' && (
            <Section title="Profilo account" subtitle="Il tuo nome e settore di appartenenza."
              onSave={() => saveSezione('account', {})}
              status={st('account')}>
              <Field label="Il tuo nome">
                <input type="text" value={name} onChange={e => { setName(e.target.value); dirty('account') }}
                  placeholder="Mario Rossi" className={cls} />
              </Field>
              <Field label="Settore">
                <select value={niche} onChange={e => { setNiche(e.target.value); dirty('account') }} className={cls}>
                  <option value="">Seleziona settore</option>
                  {SETTORI.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>

              <div className="border-t border-ink-navy/8 pt-4 mt-2">
                <h3 className="text-sm font-semibold text-ink-navy/70 mb-3">Integrazioni</h3>
                <div className="space-y-3">
                  {[
                    { name: 'WhatsApp Business', Icon: IconChat, desc: 'Ricevi prenotazioni dai messaggi WhatsApp' },
                    { name: 'Instagram DM', Icon: IconCamera, desc: 'Bot attivo sui DM del profilo Instagram' },
                    { name: 'Google Calendar', Icon: IconCalendar, desc: 'Sync automatico delle prenotazioni' },
                    { name: 'Google Business', Icon: IconPin, desc: 'Pulsante "Prenota" su Google Maps' },
                    { name: 'Stripe', Icon: IconCard, desc: 'Acconti online per eventi e catering' },
                  ].map(i => (
                    <div key={i.name} className="flex items-center justify-between py-2 border-b border-ink-navy/8 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 text-ink-navy/40 shrink-0"><i.Icon /></span>
                        <div>
                          <span className="text-sm font-medium text-ink-navy/70">{i.name}</span>
                          <p className="text-xs text-ink-navy/35">{i.desc}</p>
                        </div>
                      </div>
                      <button className="text-xs text-ink-navy/35 font-semibold cursor-not-allowed bg-mist px-3 py-1 rounded-full">Prossimamente</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-ink-navy/8 pt-4 mt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-navy/70">Piano attivo: Trial gratuito</p>
                    <p className="text-sm text-ink-navy/50">Accesso completo durante il periodo di prova</p>
                  </div>
                  <button className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90">Passa a Pro</button>
                </div>
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Componenti helper ──

function Section({ title, subtitle, children, onSave, status }: {
  title: string; subtitle?: string; children: React.ReactNode
  onSave: () => void; status: { saving: boolean; saved: boolean; dirty: boolean; error?: string }
}) {
  return (
    <div className="bg-white border border-ink-navy/10 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-ink-navy">{title}</h2>
          {subtitle && <p className="text-xs text-ink-navy/35 mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={onSave} disabled={status.saving || (status.saved && !status.dirty)}
          className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors shrink-0 ml-4 ${
            status.saved && !status.dirty
              ? 'bg-green-100 text-green-700 cursor-default'
              : 'bg-electric-blue text-white hover:bg-electric-blue/90 disabled:opacity-50'
          }`}>
          {status.saving ? 'Salvataggio...' : status.saved && !status.dirty ? 'Salvato' : 'Salva'}
        </button>
      </div>
      {children}
      {status.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{status.error}</p>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-navy/70 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-ink-navy/35 mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-ink-navy/70">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative inline-flex shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-electric-blue' : 'bg-ink-navy/20'}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

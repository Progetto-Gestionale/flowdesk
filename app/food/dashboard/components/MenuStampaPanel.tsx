'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ── Menu da stampare (PDF) ────────────────────────────────────────────────────
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

type LogoPos = 'nessuno' | 'sx' | 'centro' | 'dx'

interface PdfCat { nome: string; piatti: { nome: string; descrizione: string | null; prezzo: number; disponibile: boolean }[] }
interface PdfOpts {
  tipoLabel: string
  nomeLocale: string
  categorie: PdfCat[]
  header: string
  footer: string
  accent: string          // colore generale: cornice, titolo, filetto
  coloreCategorie: string  // testo delle intestazioni di categoria
  coloreDettagli: string   // testo dei piatti (nome + prezzo)
  textScale: number
  logoUrl: string | null
  logoPos: LogoPos
  mostraData: boolean
  dataLabel: string        // data già formattata da mostrare (se mostraData)
}

// Documento HTML del menu: usato sia per l'anteprima (iframe) sia per la stampa/PDF (nuova finestra).
function buildMenuDoc(o: PdfOpts, forPrint: boolean): string {
  const base = 15 * o.textScale
  const righe = o.categorie.map(cat => {
    const piatti = cat.piatti.filter(p => p.disponibile)
    if (piatti.length === 0) return ''
    return `<div class="cat">
      <div class="cat-h"><span>${escapeHtml(cat.nome)}</span><i></i></div>
      ${piatti.map(p => `<div class="piatto">
        <div class="pi">
          <div class="pn">${escapeHtml(p.nome)}</div>
          ${p.descrizione ? `<div class="pd">${escapeHtml(p.descrizione)}</div>` : ''}
        </div>
        <div class="pp">€${p.prezzo.toFixed(2)}</div>
      </div>`).join('')}
    </div>`
  }).join('')

  const logoImg = o.logoPos !== 'nessuno' && o.logoUrl
    ? `<img class="logo logo-${o.logoPos}" src="${o.logoUrl}" alt="logo" crossorigin="anonymous">`
    : ''

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(o.tipoLabel)}${o.nomeLocale ? ' — ' + escapeHtml(o.nomeLocale) : ''}</title>
  <style>
    @page { size: A4 portrait; margin: 0 }
    * { box-sizing: border-box; margin: 0; padding: 0 }
    html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1f36; font-size: ${base}px }
    .frame { border: 10px solid ${o.accent}; min-height: 100vh; padding: 40px 44px; display: flex; flex-direction: column }
    .top { position: relative; text-align: center; margin-bottom: 26px; min-height: 84px }
    .logo { width: 82px; height: 82px; object-fit: contain }
    .logo-centro { display: block; margin: 0 auto 14px }
    .logo-sx { position: absolute; left: 0; top: 0 }
    .logo-dx { position: absolute; right: 0; top: 0 }
    h1 { font-size: ${(base * 2.1).toFixed(1)}px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${o.accent}; line-height: 1.05 }
    .sub { font-size: ${(base * 0.85).toFixed(1)}px; color: #6b7280; margin-top: 6px; text-transform: capitalize }
    .cat { margin-bottom: 22px; break-inside: avoid }
    .cat-h { display: flex; align-items: center; gap: 12px; margin-bottom: 10px }
    .cat-h span { font-size: ${base.toFixed(1)}px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: ${o.coloreCategorie}; white-space: nowrap }
    .cat-h i { flex: 1; height: 2px; background: ${o.accent}; opacity: .45; display: block }
    .piatto { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding: 6px 0 }
    .pi { flex: 1 }
    .pn { font-size: ${(base * 1.02).toFixed(1)}px; font-weight: 700; color: ${o.coloreDettagli} }
    .pd { font-size: ${(base * 0.82).toFixed(1)}px; color: #6b7280; margin-top: 2px }
    .pp { font-size: ${base.toFixed(1)}px; font-weight: 800; color: ${o.coloreDettagli}; white-space: nowrap }
    .foot { margin-top: auto; padding-top: 24px; text-align: center; font-size: ${(base * 0.85).toFixed(1)}px; color: #6b7280; white-space: pre-line }
    .empty { color: #9ca3af; font-size: ${base.toFixed(1)}px; text-align: center; padding: 40px 0 }
  </style></head><body>
    <div class="frame">
      <div class="top">
        ${logoImg}
        <h1>${escapeHtml(o.header || o.nomeLocale || 'Menù')}</h1>
        ${o.mostraData && o.dataLabel ? `<div class="sub">${escapeHtml(o.dataLabel)}</div>` : ''}
      </div>
      ${righe || '<p class="empty">Nessun piatto disponibile in questo menu</p>'}
      ${o.footer.trim() ? `<div class="foot">${escapeHtml(o.footer)}</div>` : ''}
    </div>
    ${forPrint ? '<script>window.onload=()=>{setTimeout(()=>{window.focus();window.print()},350)}<\/script>' : ''}
  </body></html>`
}

// Editor "contenuto": piatti selezionabili e riordinabili (solo i selezionati finiscono nel PDF).
interface FetchedCat { id: string; nome: string; piatti: { id: string; nome: string; descrizione: string | null; prezzo: number; disponibile: boolean }[] }
interface PanelPiatto { id: string; nome: string; descrizione: string | null; prezzo: number; on: boolean }
interface PanelCat { id: string; nome: string; piatti: PanelPiatto[] }

// Dimensioni testo disponibili
const SIZES: [string, number][] = [['XS', 0.8], ['S', 0.9], ['M', 1], ['L', 1.15], ['XL', 1.3]]
const LOGO_POS: [LogoPos, string][] = [['nessuno', 'Nessuno'], ['sx', 'Alto sx'], ['centro', 'Centro'], ['dx', 'Alto dx']]
// Palette di colori per il menu (accenti + neutri scuri per i dettagli).
const PALETTE = ['#dc2626', '#ea580c', '#d97706', '#ca8a04', '#16a34a', '#0d9488', '#0284c7', '#2563eb', '#4f46e5', '#7c3aed', '#db2777', '#111827', '#6b7280', '#000000']

// ── Conversioni colore (per il picker HSV custom) ─────────────────────────────
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [0, 0, 0]
  const int = parseInt(m[1], 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}
const rgbToHex = (r: number, g: number, b: number) => {
  const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60; if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}
const hexToHsv = (hex: string) => { const [r, g, b] = hexToRgb(hex); return rgbToHsv(r, g, b) }
const hsvToHex = (h: number, s: number, v: number) => { const [r, g, b] = hsvToRgb(h, s, v); return rgbToHex(r, g, b) }

// Picker HSV custom (quadrato saturazione/luminosità + barra tonalità + hex), ottimizzato per
// mouse e touch: usa i Pointer Events con pointer capture, così il trascinamento continua anche
// fuori dai riquadri (valori sempre clampati) e non fa scrollare la pagina su tablet.
function CustomColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // HSV tenuto in stato locale: muovere S/V a v=0 o s=0 non perde la tonalità scelta.
  const [hsv, setHsv] = useState(() => hexToHsv(/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'))
  const [hex, setHex] = useState(value)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<'sv' | 'hue' | null>(null)

  const emit = (h: number, s: number, v: number) => { const x = hsvToHex(h, s, v); setHex(x); onChange(x) }

  const applySV = (e: { clientX: number; clientY: number }) => {
    const r = svRef.current?.getBoundingClientRect(); if (!r) return
    const s = clamp01((e.clientX - r.left) / r.width)
    const v = 1 - clamp01((e.clientY - r.top) / r.height)
    setHsv(prev => { emit(prev.h, s, v); return { ...prev, s, v } })
  }
  const applyHue = (e: { clientX: number }) => {
    const r = hueRef.current?.getBoundingClientRect(); if (!r) return
    const h = clamp01((e.clientX - r.left) / r.width) * 360
    setHsv(prev => { emit(h, prev.s, prev.v); return { ...prev, h } })
  }

  const svBg = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(hsv.h, 1, 1)})`

  return (
    <div className="w-56 select-none" onClick={e => e.stopPropagation()}>
      {/* Quadrato saturazione (x) / luminosità (y) */}
      <div ref={svRef} className="relative w-full h-36 rounded-lg overflow-hidden cursor-crosshair"
        style={{ background: svBg, touchAction: 'none' }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); dragRef.current = 'sv'; applySV(e) }}
        onPointerMove={e => { if (dragRef.current === 'sv') applySV(e) }}
        onPointerUp={e => { dragRef.current = null; e.currentTarget.releasePointerCapture(e.pointerId) }}>
        <span className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hex }} />
      </div>
      {/* Barra tonalità */}
      <div ref={hueRef} className="relative w-full h-4 rounded-full mt-3 cursor-pointer"
        style={{ background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)', touchAction: 'none' }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); dragRef.current = 'hue'; applyHue(e) }}
        onPointerMove={e => { if (dragRef.current === 'hue') applyHue(e) }}
        onPointerUp={e => { dragRef.current = null; e.currentTarget.releasePointerCapture(e.pointerId) }}>
        <span className="absolute top-1/2 w-5 h-5 rounded-full border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hsvToHex(hsv.h, 1, 1) }} />
      </div>
      {/* Hex preciso */}
      <div className="flex items-center gap-2 mt-3">
        <span className="w-7 h-7 rounded-lg border border-black/10 shrink-0" style={{ backgroundColor: hex }} />
        <input value={hex} onChange={e => {
          const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value
          setHex(v)
          if (/^#[0-9a-fA-F]{6}$/.test(v)) { setHsv(hexToHsv(v)); onChange(v) }
        }} spellCheck={false} maxLength={7}
          className="w-full border border-ink-navy/15 rounded-lg px-2.5 py-1.5 text-sm text-ink-navy font-mono lowercase focus:outline-none focus:ring-2 focus:ring-electric-blue/30" />
      </div>
    </div>
  )
}

// Campo colore: palette di pastiglie + picker custom in un popover. Componente a livello di
// modulo (identità stabile) così il popover non si richiude a ogni re-render del pannello.
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cur = (value || '').toLowerCase()
  // Se il colore corrente non è nella palette, lo mostro come prima pastiglia.
  const swatches = PALETTE.some(c => c.toLowerCase() === cur) ? PALETTE : [value, ...PALETTE]
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div className="min-w-0" ref={wrapRef}>
      <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">{label}</label>
      <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
        {swatches.map(c => (
          <button key={c} type="button" onClick={() => onChange(c)} title={c} aria-label={`Colore ${c}`}
            style={{ backgroundColor: c }}
            className={`w-6 h-6 rounded-full transition-transform ${cur === c.toLowerCase() ? 'ring-2 ring-offset-1 ring-ink-navy/50 scale-110' : 'border border-black/10 hover:scale-110'}`} />
        ))}
        {/* Colore preciso: apre il picker HSV custom (mouse + touch). */}
        <div className="relative">
          <button type="button" onClick={() => setOpen(o => !o)} title="Scegli un colore preciso" aria-label="Colore personalizzato"
            className={`w-6 h-6 rounded-full border border-dashed flex items-center justify-center text-xs leading-none transition-transform hover:scale-110 ${open ? 'border-electric-blue text-electric-blue bg-electric-blue/5' : 'border-ink-navy/30 text-ink-navy/40 bg-white'}`}>
            +
          </button>
          {open && (
            <div className="absolute z-50 top-full mt-2 left-0 bg-white rounded-2xl border border-ink-navy/10 shadow-xl p-3">
              <CustomColorPicker value={value} onChange={onChange} />
              <button type="button" onClick={() => setOpen(false)}
                className="mt-3 w-full py-1.5 rounded-lg bg-ink-navy text-white text-xs font-semibold hover:bg-ink-navy/80 transition-colors">Fatto</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Persistenza (sul server, condivisa tra tutti i dispositivi del locale) ─────
// Tutto ciò che l'utente imposta (colori, opzioni, selezione e ordine dei piatti)
// viene salvato lato server, così è uguale su ogni dispositivo dell'account.
type SavedCfg = {
  tipo?: 'locale' | 'asporto'; header?: string; footer?: string
  accent?: string; coloreCategorie?: string; coloreDettagli?: string
  textScale?: number; logoPos?: LogoPos; mostraData?: boolean
}
type SavedLayout = { cats: { id: string; piatti: { id: string; on: boolean }[] }[] }
type SavedData = { cfg?: SavedCfg; layouts?: Record<string, SavedLayout> }

const toLayout = (items: PanelCat[]): SavedLayout => ({
  cats: items.map(c => ({ id: c.id, piatti: c.piatti.map(p => ({ id: p.id, on: p.on })) })),
})

// Fonde i dati del menu dal server con le scelte salvate: applica ordine e on/off
// salvati, i piatti nuovi entrano attivi in fondo, quelli tolti dal menu spariscono.
function reconcile(cats: FetchedCat[], saved: SavedLayout | null): PanelCat[] {
  const catOrder = saved?.cats.map(c => c.id) ?? []
  const savedById = new Map((saved?.cats ?? []).map(c => [c.id, c]))
  const rank = (id: string, order: string[]) => { const i = order.indexOf(id); return i === -1 ? Number.MAX_SAFE_INTEGER : i }
  return [...cats].sort((a, b) => rank(a.id, catOrder) - rank(b.id, catOrder)).map(c => {
    const sc = savedById.get(c.id)
    const pOrder = sc?.piatti.map(p => p.id) ?? []
    const onMap = new Map((sc?.piatti ?? []).map(p => [p.id, p.on]))
    const disp = c.piatti.filter(p => p.disponibile)
    return {
      id: c.id, nome: c.nome,
      piatti: [...disp].sort((a, b) => rank(a.id, pOrder) - rank(b.id, pOrder))
        .map(p => ({ id: p.id, nome: p.nome, descrizione: p.descrizione, prezzo: p.prezzo, on: onMap.has(p.id) ? onMap.get(p.id)! : true })),
    }
  })
}

export default function MenuStampaPanel() {
  const [tipo, setTipo] = useState<'locale' | 'asporto'>('locale')
  const [settings, setSettings] = useState<{ nomeLocale?: string; menuLogoUrl?: string | null; menuColoreP?: string } | null>(null)
  const [catByTipo, setCatByTipo] = useState<Record<string, FetchedCat[]>>({})
  const [items, setItems] = useState<PanelCat[]>([])
  const [header, setHeader] = useState('')
  const [footer, setFooter] = useState('')
  const [accent, setAccent] = useState('#dc2626')
  const [coloreCategorie, setColoreCategorie] = useState('#dc2626')
  const [coloreDettagli, setColoreDettagli] = useState('#111827')
  const [logoPos, setLogoPos] = useState<LogoPos>('centro')
  const [mostraData, setMostraData] = useState(true)
  const [dataScelta, setDataScelta] = useState<string>(() => new Date().toISOString().slice(0, 10)) // yyyy-mm-dd, default oggi
  const [textScale, setTextScale] = useState(1)

  // Persistenza server: layout piatti per tipo (ref), flag "caricato" e un
  // contatore per far scattare il salvataggio quando il layout cambia.
  const layoutsRef = useRef<Record<string, SavedLayout>>({})
  const [caricato, setCaricato] = useState(false)
  const [layoutVersion, setLayoutVersion] = useState(0)

  // Anteprima scalata: misuro il contenitore e adatto l'iframe A4 (794px) con transform.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.42)
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (el.clientWidth) setScale(el.clientWidth / 794) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Caricamento (una volta): prima la config salvata sul server, poi i settings
  // del locale. I default dal locale si applicano SOLO se non c'è già una config
  // salvata, per non sovrascrivere le scelte dell'utente. Sequenziale = niente race.
  useEffect(() => {
    let cfgSalvata: SavedCfg | null = null
    fetch('/api/menu/stampa-config', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { dati?: string | null }) => {
        const data: SavedData | null = d?.dati ? JSON.parse(d.dati) : null
        if (data?.cfg) {
          cfgSalvata = data.cfg
          const c = data.cfg
          if (c.tipo) setTipo(c.tipo)
          if (c.header != null) setHeader(c.header)
          if (c.footer != null) setFooter(c.footer)
          if (c.accent) setAccent(c.accent)
          if (c.coloreCategorie) setColoreCategorie(c.coloreCategorie)
          if (c.coloreDettagli) setColoreDettagli(c.coloreDettagli)
          if (c.textScale) setTextScale(c.textScale)
          if (c.logoPos) setLogoPos(c.logoPos)
          if (typeof c.mostraData === 'boolean') setMostraData(c.mostraData)
        }
        if (data?.layouts) layoutsRef.current = data.layouts
      })
      .catch(() => {})
      .finally(() => {
        fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).then(s => {
          setSettings(s)
          if (!cfgSalvata) {
            if (s.menuColoreP) { setAccent(s.menuColoreP); setColoreCategorie(s.menuColoreP) }
            setHeader(prev => prev || s.nomeLocale || 'Menù del giorno')
          }
          if (!s.menuLogoUrl) setLogoPos('nessuno') // senza logo, posizione forzata a nessuno
        }).catch(() => {}).finally(() => setCaricato(true))
      })
  }, [])

  // Salvataggio sul server (con debounce) di config + layout, quando qualcosa
  // cambia. Non salva prima del caricamento iniziale (per non sovrascrivere).
  useEffect(() => {
    if (!caricato) return
    const t = setTimeout(() => {
      const dati: SavedData = {
        cfg: { tipo, header, footer, accent, coloreCategorie, coloreDettagli, textScale, logoPos, mostraData },
        layouts: layoutsRef.current,
      }
      fetch('/api/menu/stampa-config', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dati: JSON.stringify(dati) }),
      }).catch(() => {})
    }, 700)
    return () => clearTimeout(t)
  }, [caricato, tipo, header, footer, accent, coloreCategorie, coloreDettagli, textScale, logoPos, mostraData, layoutVersion])

  useEffect(() => {
    if (catByTipo[tipo]) return
    fetch(`/api/menu/categorie?tipo=${tipo}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCatByTipo(prev => ({ ...prev, [tipo]: d.categorie ?? [] })))
      .catch(() => {})
  }, [tipo, catByTipo])

  useEffect(() => {
    const cats = catByTipo[tipo]
    if (!cats) return
    // Fonde i dati del server con il layout salvato per questo menu.
    setItems(reconcile(cats, layoutsRef.current[tipo] ?? null))
  }, [tipo, catByTipo, caricato])

  // Applica una modifica agli items, aggiorna il layout salvato e fa scattare il
  // salvataggio sul server (tramite layoutVersion).
  function aggiornaItems(fn: (prev: PanelCat[]) => PanelCat[]) {
    setItems(prev => { const next = fn(prev); layoutsRef.current[tipo] = toLayout(next); return next })
    setLayoutVersion(v => v + 1)
  }
  function togglePiatto(ci: number, pi: number) {
    aggiornaItems(prev => prev.map((c, i) => i !== ci ? c : { ...c, piatti: c.piatti.map((p, j) => j !== pi ? p : { ...p, on: !p.on }) }))
  }
  function toggleCat(ci: number, value: boolean) {
    aggiornaItems(prev => prev.map((c, i) => i !== ci ? c : { ...c, piatti: c.piatti.map(p => ({ ...p, on: value })) }))
  }
  function setAll(value: boolean) {
    aggiornaItems(prev => prev.map(c => ({ ...c, piatti: c.piatti.map(p => ({ ...p, on: value })) })))
  }
  function moveCat(ci: number, dir: -1 | 1) {
    const j = ci + dir
    aggiornaItems(prev => { if (j < 0 || j >= prev.length) return prev; const n = [...prev];[n[ci], n[j]] = [n[j], n[ci]]; return n })
  }
  function movePiatto(ci: number, pi: number, dir: -1 | 1) {
    aggiornaItems(prev => prev.map((c, i) => {
      if (i !== ci) return c
      const j = pi + dir
      if (j < 0 || j >= c.piatti.length) return c
      const pp = [...c.piatti];[pp[pi], pp[j]] = [pp[j], pp[pi]]
      return { ...c, piatti: pp }
    }))
  }
  const totSelezionati = items.reduce((s, c) => s + c.piatti.filter(p => p.on).length, 0)

  const tipoLabel = tipo === 'locale' ? 'Menu Tavoli' : 'Menu Asporto & Delivery'
  const pdfCategorie: PdfCat[] = items.map(c => ({
    nome: c.nome,
    piatti: c.piatti.filter(p => p.on).map(p => ({ nome: p.nome, descrizione: p.descrizione, prezzo: p.prezzo, disponibile: true })),
  }))
  // Data scelta, formattata in esteso (T12:00 per non spostare il giorno per fuso orario).
  const dataLabel = (() => {
    const d = new Date(dataScelta + 'T12:00:00')
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  })()
  const opts: PdfOpts = {
    tipoLabel, nomeLocale: settings?.nomeLocale ?? '', categorie: pdfCategorie,
    header, footer, accent, coloreCategorie, coloreDettagli, textScale,
    logoUrl: settings?.menuLogoUrl ?? null, logoPos, mostraData, dataLabel,
  }
  const previewDoc = buildMenuDoc(opts, false)

  function scarica() {
    if (totSelezionati === 0) return
    const w = window.open('', '_blank')
    if (w) { w.document.write(buildMenuDoc(opts, true)); w.document.close() }
  }

  const inputCls = 'w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm text-ink-navy focus:outline-none focus:ring-2 focus:ring-electric-blue/30'

  return (
    <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5 mb-4">
      <div className="mb-4">
        <p className="font-semibold text-ink-navy">Menu da stampare (PDF)</p>
        <p className="text-xs text-ink-navy/50 mt-0.5">Scegli quale menu, personalizza e scarica il PDF pronto da stampare.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Controlli */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Quale menu</label>
            <div className="flex gap-1 bg-mist rounded-xl p-1 mt-1.5 w-fit">
              {([['locale', 'Tavoli'], ['asporto', 'Asporto & Delivery']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTipo(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tipo === k ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Scritta in cima</label>
            <input type="text" value={header} onChange={e => setHeader(e.target.value)} placeholder="es. Menù del giorno" className={`${inputCls} mt-1.5`} />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Scritta in fondo</label>
            <textarea value={footer} onChange={e => setFooter(e.target.value)} rows={2} placeholder="es. Coperto €2 · Wi-Fi: pop-cafe · Grazie e a presto!"
              className={`${inputCls} mt-1.5 resize-none`} />
          </div>

          {/* Colori separati */}
          <div className="flex flex-wrap gap-4">
            <ColorField label="Colore generale" value={accent} onChange={setAccent} />
            <ColorField label="Colore categorie" value={coloreCategorie} onChange={setColoreCategorie} />
            <ColorField label="Colore dettagli" value={coloreDettagli} onChange={setColoreDettagli} />
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Dimensione testo</label>
              <div className="flex gap-1 bg-mist rounded-xl p-1 mt-1.5 w-fit">
                {SIZES.map(([l, v]) => (
                  <button key={l} onClick={() => setTextScale(v)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${textScale === v ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Posizione logo</label>
              <div className="flex gap-1 bg-mist rounded-xl p-1 mt-1.5 w-fit">
                {LOGO_POS.map(([k, l]) => {
                  const disabilitato = k !== 'nessuno' && !settings?.menuLogoUrl
                  return (
                    <button key={k} onClick={() => !disabilitato && setLogoPos(k)} disabled={disabilitato}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30 ${logoPos === k ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                      {l}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-ink-navy/70 cursor-pointer select-none">
              <input type="checkbox" checked={mostraData} onChange={e => setMostraData(e.target.checked)} className="w-4 h-4 rounded accent-electric-blue" />
              Mostra la data
            </label>
            {mostraData && (
              <div className="flex items-center gap-2 mt-2 pl-6 flex-wrap">
                <input type="date" value={dataScelta} onChange={e => setDataScelta(e.target.value)}
                  className="border border-ink-navy/15 rounded-lg px-2.5 py-1.5 text-sm text-ink-navy focus:outline-none focus:ring-2 focus:ring-electric-blue/30" />
                <button type="button" onClick={() => setDataScelta(new Date().toISOString().slice(0, 10))}
                  className="text-xs font-semibold text-electric-blue hover:underline">Oggi</button>
              </div>
            )}
          </div>

          <button onClick={scarica} disabled={totSelezionati === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: accent }}>
            ↓ Scarica PDF — {tipo === 'locale' ? 'Menu Tavoli' : 'Menu Asporto'} ({totSelezionati})
          </button>
          {!settings?.menuLogoUrl && (
            <p className="text-xs text-ink-navy/35">
              Per usare il logo caricalo qui sopra in <Link href="/food/dashboard/impostazioni?sezione=menu" className="text-electric-blue underline">Aspetto menu</Link>.
            </p>
          )}
        </div>

        {/* Anteprima */}
        <div>
          <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Anteprima</label>
          <div className="mt-1.5 rounded-xl border border-ink-navy/10 bg-mist/40 p-3">
            <div ref={wrapRef} style={{ width: '100%', height: 1123 * scale, position: 'relative', overflow: 'hidden' }}>
              <iframe title="Anteprima menu" srcDoc={previewDoc} scrolling="no"
                style={{ width: 794, height: 1123, border: 0, transformOrigin: 'top left', transform: `scale(${scale})`, pointerEvents: 'none', background: '#fff' }} />
            </div>
          </div>
          <p className="text-[11px] text-ink-navy/35 mt-1.5 text-center">Anteprima indicativa · nel PDF il menu si impagina su A4</p>
        </div>
      </div>

      {/* ── Contenuto: seleziona e riordina i piatti da includere ── */}
      <div className="mt-6 border-t border-ink-navy/10 pt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">
            Contenuto — {totSelezionati} piatt{totSelezionati === 1 ? 'o' : 'i'} nel PDF
          </label>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setAll(true)} className="px-2.5 py-1 rounded-lg text-electric-blue hover:bg-electric-blue/10 font-medium">Seleziona tutti</button>
            <button onClick={() => setAll(false)} className="px-2.5 py-1 rounded-lg text-ink-navy/50 hover:bg-mist font-medium">Deseleziona tutti</button>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-ink-navy/35 py-3">Nessun piatto disponibile in questo menu.</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {items.map((c, ci) => {
              const tutti = c.piatti.length > 0 && c.piatti.every(p => p.on)
              return (
                <div key={c.id} className="rounded-xl border border-ink-navy/10 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-mist/60 border-b border-ink-navy/8">
                    <input type="checkbox" checked={tutti} onChange={e => toggleCat(ci, e.target.checked)}
                      className="w-4 h-4 rounded accent-electric-blue shrink-0" />
                    <span className="font-semibold text-sm text-ink-navy flex-1 truncate">{c.nome}</span>
                    <div className="flex flex-col shrink-0 -my-1">
                      <button onClick={() => moveCat(ci, -1)} disabled={ci === 0} aria-label="Sposta categoria su"
                        className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▲</button>
                      <button onClick={() => moveCat(ci, 1)} disabled={ci === items.length - 1} aria-label="Sposta categoria giù"
                        className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▼</button>
                    </div>
                  </div>
                  {c.piatti.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-ink-navy/30">Nessun piatto disponibile</p>
                  ) : (
                    <div className="divide-y divide-ink-navy/6">
                      {c.piatti.map((p, pi) => (
                        <div key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                          <input type="checkbox" checked={p.on} onChange={() => togglePiatto(ci, pi)}
                            className="w-4 h-4 rounded accent-electric-blue shrink-0" />
                          <span className={`text-sm flex-1 truncate ${p.on ? 'text-ink-navy' : 'text-ink-navy/40 line-through'}`}>{p.nome}</span>
                          <span className="text-xs text-ink-navy/40 shrink-0">€{p.prezzo.toFixed(2)}</span>
                          <div className="flex flex-col shrink-0 -my-1">
                            <button onClick={() => movePiatto(ci, pi, -1)} disabled={pi === 0} aria-label="Sposta piatto su"
                              className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▲</button>
                            <button onClick={() => movePiatto(ci, pi, 1)} disabled={pi === c.piatti.length - 1} aria-label="Sposta piatto giù"
                              className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▼</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

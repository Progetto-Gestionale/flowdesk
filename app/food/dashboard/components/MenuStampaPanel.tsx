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
}

// Documento HTML del menu: usato sia per l'anteprima (iframe) sia per la stampa/PDF (nuova finestra).
function buildMenuDoc(o: PdfOpts, forPrint: boolean): string {
  const base = 15 * o.textScale
  const dataLabel = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
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
    @page { size: A4; margin: 0 }
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
        ${o.mostraData ? `<div class="sub">${dataLabel}</div>` : ''}
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
  const [textScale, setTextScale] = useState(1)

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

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).then(s => {
      setSettings(s)
      if (s.menuColoreP) { setAccent(s.menuColoreP); setColoreCategorie(s.menuColoreP) }
      setHeader(prev => prev || s.nomeLocale || 'Menù del giorno')
      if (!s.menuLogoUrl) setLogoPos('nessuno')
    }).catch(() => {})
  }, [])

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
    setItems(cats.map(c => ({
      id: c.id, nome: c.nome,
      piatti: c.piatti.filter(p => p.disponibile).map(p => ({ id: p.id, nome: p.nome, descrizione: p.descrizione, prezzo: p.prezzo, on: true })),
    })))
  }, [tipo, catByTipo])

  function togglePiatto(ci: number, pi: number) {
    setItems(prev => prev.map((c, i) => i !== ci ? c : { ...c, piatti: c.piatti.map((p, j) => j !== pi ? p : { ...p, on: !p.on }) }))
  }
  function toggleCat(ci: number, value: boolean) {
    setItems(prev => prev.map((c, i) => i !== ci ? c : { ...c, piatti: c.piatti.map(p => ({ ...p, on: value })) }))
  }
  function setAll(value: boolean) {
    setItems(prev => prev.map(c => ({ ...c, piatti: c.piatti.map(p => ({ ...p, on: value })) })))
  }
  function moveCat(ci: number, dir: -1 | 1) {
    const j = ci + dir
    setItems(prev => { if (j < 0 || j >= prev.length) return prev; const n = [...prev];[n[ci], n[j]] = [n[j], n[ci]]; return n })
  }
  function movePiatto(ci: number, pi: number, dir: -1 | 1) {
    setItems(prev => prev.map((c, i) => {
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
  const opts: PdfOpts = {
    tipoLabel, nomeLocale: settings?.nomeLocale ?? '', categorie: pdfCategorie,
    header, footer, accent, coloreCategorie, coloreDettagli, textScale,
    logoUrl: settings?.menuLogoUrl ?? null, logoPos, mostraData,
  }
  const previewDoc = buildMenuDoc(opts, false)

  function scarica() {
    if (totSelezionati === 0) return
    const w = window.open('', '_blank')
    if (w) { w.document.write(buildMenuDoc(opts, true)); w.document.close() }
  }

  const inputCls = 'w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm text-ink-navy focus:outline-none focus:ring-2 focus:ring-electric-blue/30'
  const ColorPicker = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => {
    const cur = (value || '').toLowerCase()
    // Se il colore corrente (es. quello salvato del locale) non è nella palette, lo mostro come prima pastiglia.
    const swatches = PALETTE.some(c => c.toLowerCase() === cur) ? PALETTE : [value, ...PALETTE]
    return (
      <div className="min-w-0">
        <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">{label}</label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {swatches.map(c => (
            <button key={c} type="button" onClick={() => onChange(c)} title={c} aria-label={`Colore ${c}`}
              style={{ backgroundColor: c }}
              className={`w-6 h-6 rounded-full transition-transform ${cur === c.toLowerCase() ? 'ring-2 ring-offset-1 ring-ink-navy/50 scale-110' : 'border border-black/10 hover:scale-110'}`} />
          ))}
        </div>
      </div>
    )
  }

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
            <ColorPicker label="Colore generale" value={accent} onChange={setAccent} />
            <ColorPicker label="Colore categorie" value={coloreCategorie} onChange={setColoreCategorie} />
            <ColorPicker label="Colore dettagli" value={coloreDettagli} onChange={setColoreDettagli} />
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

          <label className="flex items-center gap-2 text-sm text-ink-navy/70 cursor-pointer select-none">
            <input type="checkbox" checked={mostraData} onChange={e => setMostraData(e.target.checked)} className="w-4 h-4 rounded accent-electric-blue" />
            Mostra data di oggi
          </label>

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

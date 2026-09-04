'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { IconTrash, IconCamera, IconFile } from '@/app/components/icons'
import { MiniCalendario } from '@/app/components/MiniCalendario'

// Aliquote IVA acquisti nella ristorazione (frazione salvata sul DB).
const ALIQUOTE = [
  ['0.1', '10%', 'carne, pesce, uova, caffè, acqua'],
  ['0.04', '4%', 'pane, farina, latte, frutta, verdura'],
  ['0.22', '22%', 'vino, alcolici, bibite, packaging, detersivi'],
  ['0', 'Esente', 'senza IVA'],
] as const

const CATEGORIE = [
  ['merci', 'Merci (cibo)'],
  ['bevande', 'Bevande'],
  ['servizi', 'Servizi'],
  ['altro', 'Altro'],
] as const

const eur = (n: number) => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const oggiISO = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD locale

interface RigaOut { imponibile: number; aliquota: number }
interface LineaDettaglio { descrizione: string; quantita: number | null; unita: string | null; prezzoTotale: number | null; aliquota: number | null }
interface Fattura {
  id: string; fornitore: string | null; partitaIvaFornitore: string | null; numero: string | null; data: string
  categoria: string; note: string | null; origine: string; netto: number; iva: number; lordo: number
  righe: RigaOut[]; dettaglio: LineaDettaglio[]
}
interface Totali { netto: number; iva: number; numero: number }

// Etichetta dell'aliquota per la vista dettaglio.
const aliqLabel = (a: number) => (a === 0 ? 'esente' : `${Math.round(a * 100)}%`)
// Badge dell'origine della bolla.
const ORIGINE_BADGE: Record<string, { label: string; cls: string }> = {
  foto: { label: '📷 da foto', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  xml: { label: '📄 da XML', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  manuale: { label: 'manuale', cls: 'bg-ink-navy/5 text-ink-navy/50 border-ink-navy/10' },
}

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIE.map(([v, l]) => [v, l]))

// Primo giorno del mese di una data (a mezzogiorno, per evitare slittamenti di fuso).
const primoDelMese = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 15, 12, 0, 0)
// Riferimento "YYYY-MM-15" da passare all'API (calcola il mese senza ambiguità di fuso).
const rifISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`
const MESI_NAV_INDIETRO = 24 // quanto indietro si può navigare dalla UI (le bolle restano comunque nel DB)

export default function AcquistiPage() {
  const [fatture, setFatture] = useState<Fattura[]>([])
  const [totali, setTotali] = useState<Totali>({ netto: 0, iva: 0, numero: 0 })
  const [label, setLabel] = useState('')

  // Mese visualizzato nell'elenco bolle. Default = mese corrente; frecce ◀ ▶ per navigare.
  const meseCorrente = primoDelMese(new Date())
  const [rifMese, setRifMese] = useState<Date>(meseCorrente)
  const limiteIndietro = new Date(meseCorrente.getFullYear(), meseCorrente.getMonth() - MESI_NAV_INDIETRO, 15, 12, 0, 0)
  const puoAvanti = rifMese < meseCorrente
  const puoIndietro = rifMese > limiteIndietro
  const cambiaMese = (delta: number) => setRifMese(m => new Date(m.getFullYear(), m.getMonth() + delta, 15, 12, 0, 0))
  const [calAperto, setCalAperto] = useState(false)

  // Form nuova bolla. Gli importi per aliquota si copiano dal riquadro "Riepilogo IVA".
  const [fornitore, setFornitore] = useState('')
  const [partitaIvaFornitore, setPartitaIvaFornitore] = useState('')
  const [numero, setNumero] = useState('')
  const [data, setData] = useState(oggiISO())
  const [categoria, setCategoria] = useState('merci')
  const [imponibili, setImponibili] = useState<Record<string, string>>({}) // aliquotaKey → imponibile
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState('')
  // OCR foto / import XML: precompilano il form, non salvano (il titolare conferma).
  const [imports, setImports] = useState<'' | 'foto' | 'xml'>('')
  const [precompilato, setPrecompilato] = useState(false)
  // Origine + dettaglio riga-per-riga della bolla in compilazione (da foto/XML).
  const [origineNuova, setOrigineNuova] = useState<'manuale' | 'foto' | 'xml'>('manuale')
  const [dettaglioNuovo, setDettaglioNuovo] = useState<LineaDettaglio[]>([])
  // Bolla espansa nell'elenco (clic sulla riga per vedere il dettaglio).
  const [apertaId, setApertaId] = useState<string | null>(null)
  const fotoRef = useRef<HTMLInputElement>(null)
  const xmlRef = useRef<HTMLInputElement>(null)

  const carica = useCallback(() => {
    fetch(`/api/contabilita/fatture?periodo=mese&riferimento=${rifISO(rifMese)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setFatture(d.fatture ?? []); setTotali(d.totali ?? { netto: 0, iva: 0, numero: 0 }); setLabel(d.label ?? '') })
      .catch(() => {})
  }, [rifMese])
  useEffect(() => { carica() }, [carica])

  // Anteprima live di IVA e totale della bolla che si sta compilando.
  const righeAnteprima = ALIQUOTE
    .map(([k]) => ({ aliquota: Number(k), imponibile: Number(imponibili[k] || 0) }))
    .filter(r => r.imponibile > 0)
  const nettoNuovo = righeAnteprima.reduce((s, r) => s + r.imponibile, 0)
  const ivaNuovo = righeAnteprima.reduce((s, r) => s + r.imponibile * r.aliquota, 0)

  async function salva() {
    setErrore('')
    if (righeAnteprima.length === 0) { setErrore('Inserisci almeno un imponibile per aliquota.'); return }
    setSalvando(true)
    const res = await fetch('/api/contabilita/fatture', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fornitore, partitaIvaFornitore, numero, data, categoria, righe: righeAnteprima, origine: origineNuova, dettaglio: dettaglioNuovo }),
    })
    setSalvando(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErrore(d.error ?? 'Errore nel salvataggio'); return }
    // Salta al mese della bolla appena salvata, così la vedi subito nell'elenco.
    const meseBolla = primoDelMese(new Date(data))
    setFornitore(''); setPartitaIvaFornitore(''); setNumero(''); setData(oggiISO()); setCategoria('merci'); setImponibili({}); setPrecompilato(false)
    setOrigineNuova('manuale'); setDettaglioNuovo([])
    if (meseBolla.getTime() !== rifMese.getTime()) setRifMese(meseBolla) // il cambio mese ricarica da solo
    else carica()
  }

  async function elimina(id: string) {
    await fetch(`/api/contabilita/fatture?id=${id}`, { method: 'DELETE', credentials: 'include' })
    carica()
  }

  // Precompila il form da un estratto (OCR o XML). Non salva: il titolare controlla e conferma.
  interface Estratto { fornitore: string | null; numero: string | null; data: string | null; categoria: string; righe: RigaOut[]; origine?: 'foto' | 'xml'; dettaglio?: LineaDettaglio[] }
  function applicaEstratto(est: Estratto) {
    if (est.fornitore) setFornitore(est.fornitore)
    if (est.numero) setNumero(est.numero)
    if (est.data) setData(est.data)
    if (est.categoria) setCategoria(est.categoria)
    const imp: Record<string, string> = {}
    for (const r of est.righe) imp[String(r.aliquota)] = String(r.imponibile)
    setImponibili(imp)
    setOrigineNuova(est.origine ?? 'manuale')
    setDettaglioNuovo(Array.isArray(est.dettaglio) ? est.dettaglio : [])
    setPrecompilato(true)
  }

  async function onFoto(file: File) {
    setErrore(''); setImports('foto')
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file)
      })
      const r = await fetch('/api/copilot/ocr-bolla', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, mediaType: file.type }),
      })
      const d = await r.json()
      if (!r.ok) { setErrore(d.error ?? 'Lettura foto non riuscita'); return }
      applicaEstratto(d.estratto as Estratto)
    } catch { setErrore('Errore nella lettura della foto') }
    finally { setImports(''); if (fotoRef.current) fotoRef.current.value = '' }
  }

  async function onXml(file: File) {
    setErrore(''); setImports('xml')
    try {
      const xml = await file.text()
      const r = await fetch('/api/contabilita/xml-sdi', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml }),
      })
      const d = await r.json()
      if (!r.ok) { setErrore(d.error ?? 'Import XML non riuscito'); return }
      applicaEstratto(d.estratto as Estratto)
    } catch { setErrore('Errore nella lettura dell’XML') }
    finally { setImports(''); if (xmlRef.current) xmlRef.current.value = '' }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/food/dashboard/contabilita" className="text-xs text-ink-navy/50 hover:text-ink-navy">← Contabilità</Link>
        <h1 className="text-xl font-bold text-ink-navy mt-1">Acquisti / Bolle fornitori</h1>
        <p className="text-sm text-ink-navy/50">Registra quanto spendi dai fornitori: serve a confrontare <b>comprato vs consumato</b> e a tenere sotto controllo le materie prime. Foto o XML: compilo io, tu controlli.</p>
      </div>

      {/* Nuova bolla */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-ink-navy">Aggiungi una bolla</h2>
          <div className="flex items-center gap-2">
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFoto(f) }} />
            <button onClick={() => fotoRef.current?.click()} disabled={imports !== ''}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-ink-navy/15 text-ink-navy/70 hover:border-electric-blue hover:text-electric-blue disabled:opacity-40 transition-colors">
              <span className="w-4 h-4"><IconCamera /></span>{imports === 'foto' ? 'Leggo…' : 'Foto bolla'}
            </button>
            <input ref={xmlRef} type="file" accept=".xml,text/xml,application/xml" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onXml(f) }} />
            <button onClick={() => xmlRef.current?.click()} disabled={imports !== ''}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-ink-navy/15 text-ink-navy/70 hover:border-electric-blue hover:text-electric-blue disabled:opacity-40 transition-colors">
              <span className="w-4 h-4"><IconFile /></span>{imports === 'xml' ? 'Importo…' : 'Importa XML'}
            </button>
          </div>
        </div>
        <p className="text-xs text-ink-navy/45 -mt-2">Scatta la foto della bolla o carica l&apos;XML della fattura elettronica: compilo io i campi, tu <b>controlli e salvi</b>.</p>
        {precompilato && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
            ✓ Campi precompilati automaticamente. <b>Controlla</b> importi e aliquote, poi premi «Salva bolla».
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="text-xs text-ink-navy/55 sm:col-span-2">
            Fornitore
            <input value={fornitore} onChange={e => setFornitore(e.target.value)} placeholder="es. Ittica Rossi"
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white text-ink-navy" />
          </label>
          <label className="text-xs text-ink-navy/55 sm:col-span-2">
            P.IVA fornitore <span className="text-ink-navy/35">(facoltativa)</span>
            <input value={partitaIvaFornitore} onChange={e => setPartitaIvaFornitore(e.target.value)} inputMode="numeric" placeholder="es. 01234567890"
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white text-ink-navy" />
          </label>
          <label className="text-xs text-ink-navy/55">
            Data documento
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white text-ink-navy" />
          </label>
          <label className="text-xs text-ink-navy/55">
            Tipo
            <select value={categoria} onChange={e => setCategoria(e.target.value)}
              className="mt-1 w-full px-2 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white text-ink-navy">
              {CATEGORIE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        <div>
          <p className="text-sm font-medium text-ink-navy">Imponibile per aliquota <span className="font-normal text-ink-navy/50">(senza IVA)</span></p>
          <p className="text-xs text-ink-navy/45 mt-0.5 mb-3">Copia gli importi dal riquadro <b>&laquo;Riepilogo IVA&raquo;</b> in fondo alla fattura: per ogni aliquota, l&apos;imponibile (l&apos;importo <b>senza</b> IVA). Lascia vuote le aliquote non presenti.</p>
          <div className="space-y-2">
            {ALIQUOTE.map(([k, etichetta, esempi]) => {
              const imp = Number(imponibili[k] || 0)
              const iva = imp * Number(k)
              return (
                <div key={k} className="flex items-center gap-3 flex-wrap">
                  <div className="w-24 shrink-0">
                    <span className="text-sm font-semibold text-ink-navy">{etichetta}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-ink-navy/40">€</span>
                    <input type="number" inputMode="decimal" min={0} placeholder="0,00" value={imponibili[k] ?? ''}
                      onChange={e => setImponibili({ ...imponibili, [k]: e.target.value })}
                      className="w-28 px-2 py-1.5 text-sm rounded-lg border border-ink-navy/10 bg-white text-ink-navy" />
                  </div>
                  <span className="text-xs text-ink-navy/45 tabular-nums w-28">IVA {eur(iva)}</span>
                  <span className="text-[11px] text-ink-navy/35 flex-1 min-w-0 hidden sm:block">{esempi}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Riepilogo live della bolla */}
        <div className="flex items-center justify-between flex-wrap gap-3 bg-mist rounded-xl px-4 py-3">
          <div className="text-sm text-ink-navy/60">
            Netto <b className="text-ink-navy">{eur(nettoNuovo)}</b> · IVA a credito <b className="text-emerald-600">{eur(ivaNuovo)}</b> · Totale <b className="text-ink-navy">{eur(nettoNuovo + ivaNuovo)}</b>
          </div>
          <div className="flex items-center gap-3">
            {errore && <span className="text-xs text-rose-600">{errore}</span>}
            <button onClick={salva} disabled={salvando || nettoNuovo <= 0}
              className="text-sm font-semibold bg-electric-blue text-white rounded-lg px-4 py-2 disabled:opacity-40">
              {salvando ? 'Salvo…' : 'Salva bolla'}
            </button>
          </div>
        </div>
      </div>

      {/* Elenco bolle del periodo */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="relative flex items-center gap-1">
            <button onClick={() => cambiaMese(-1)} disabled={!puoIndietro}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 text-ink-navy/60 hover:bg-mist disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Mese precedente">‹</button>
            {/* Clic sull'etichetta = apre il calendarietto per saltare a un mese (come in Analytics). */}
            <button onClick={() => setCalAperto(v => !v)}
              className="text-base font-semibold text-ink-navy min-w-[8rem] text-center rounded-lg px-2 py-0.5 hover:bg-mist transition-colors">
              Bolle di {label || 'questo mese'}
            </button>
            <button onClick={() => cambiaMese(1)} disabled={!puoAvanti}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/10 text-ink-navy/60 hover:bg-mist disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Mese successivo">›</button>
            {rifMese < meseCorrente && (
              <button onClick={() => setRifMese(meseCorrente)} className="ml-1 text-xs text-electric-blue hover:underline">oggi</button>
            )}
            {calAperto && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCalAperto(false)} />
                <MiniCalendario periodo="mese" riferimento={rifMese}
                  onScegli={d => { setRifMese(primoDelMese(d)); setCalAperto(false) }}
                  onChiudi={() => setCalAperto(false)} />
              </>
            )}
          </div>
          <span className="text-sm text-ink-navy/50">Credito IVA <b className="text-emerald-600">{eur(totali.iva)}</b> · su {eur(totali.netto)} netto</span>
        </div>
        <div className="space-y-1">
          {fatture.map(f => {
            const aperta = apertaId === f.id
            const badge = ORIGINE_BADGE[f.origine] ?? ORIGINE_BADGE.manuale
            return (
              <div key={f.id} className="border-b border-ink-navy/5 last:border-0">
                {/* Riga cliccabile: apre/chiude il dettaglio della bolla. */}
                <div className="flex items-center gap-3 py-2">
                  <button onClick={() => setApertaId(aperta ? null : f.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <span className={`text-ink-navy/30 text-xs transition-transform ${aperta ? 'rotate-90' : ''}`}>▶</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-navy truncate">{f.fornitore || 'Fornitore n.d.'}</span>
                        <span className={`shrink-0 text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${badge.cls}`}>{badge.label}</span>
                      </span>
                      <span className="block text-xs text-ink-navy/40">
                        {new Date(f.data).toLocaleDateString('it-IT')} · {CAT_LABEL[f.categoria] ?? f.categoria}
                        {f.numero ? ` · n. ${f.numero}` : ''}
                      </span>
                    </span>
                  </button>
                  <div className="text-right">
                    <p className="text-sm tabular-nums text-ink-navy">{eur(f.netto)} <span className="text-ink-navy/40 text-xs">netto</span></p>
                    <p className="text-[11px] text-emerald-600 tabular-nums">+ {eur(f.iva)} IVA a credito</p>
                  </div>
                  <button onClick={() => elimina(f.id)} className="w-4 h-4 text-ink-navy/30 hover:text-rose-500 shrink-0" aria-label="Elimina"><IconTrash /></button>
                </div>

                {/* Dettaglio espanso */}
                {aperta && (
                  <div className="pb-3 pl-6 pr-1 space-y-3">
                    {/* Anagrafica */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                      <Dato label="Fornitore" valore={f.fornitore || '—'} />
                      <Dato label="P.IVA" valore={f.partitaIvaFornitore || '—'} />
                      <Dato label="N° documento" valore={f.numero || '—'} />
                      <Dato label="Data" valore={new Date(f.data).toLocaleDateString('it-IT')} />
                    </div>

                    {/* Castelletto IVA (quello che entra in contabilità) */}
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-wide text-ink-navy/35 mb-1">Riepilogo IVA</p>
                      <div className="rounded-lg border border-ink-navy/10 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-mist/60 text-ink-navy/50">
                            <tr><th className="text-left font-medium px-3 py-1.5">Aliquota</th><th className="text-right font-medium px-3 py-1.5">Imponibile</th><th className="text-right font-medium px-3 py-1.5">IVA</th><th className="text-right font-medium px-3 py-1.5">Totale</th></tr>
                          </thead>
                          <tbody>
                            {f.righe.map((r, i) => (
                              <tr key={i} className="border-t border-ink-navy/5">
                                <td className="px-3 py-1.5 text-ink-navy/70">{aliqLabel(r.aliquota)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-ink-navy">{eur(r.imponibile)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">{eur(r.imponibile * r.aliquota)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-ink-navy">{eur(r.imponibile * (1 + r.aliquota))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Dettaglio righe prodotto (da foto/XML) */}
                    {f.dettaglio && f.dettaglio.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-wide text-ink-navy/35 mb-1">Articoli ({f.dettaglio.length})</p>
                        <div className="rounded-lg border border-ink-navy/10 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-mist/60 text-ink-navy/50">
                              <tr><th className="text-left font-medium px-3 py-1.5">Descrizione</th><th className="text-right font-medium px-3 py-1.5">Q.tà</th><th className="text-right font-medium px-3 py-1.5">Importo</th></tr>
                            </thead>
                            <tbody>
                              {f.dettaglio.map((d, i) => (
                                <tr key={i} className="border-t border-ink-navy/5">
                                  <td className="px-3 py-1.5 text-ink-navy/70">{d.descrizione}{d.aliquota != null ? <span className="text-ink-navy/30"> · IVA {aliqLabel(d.aliquota)}</span> : ''}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-ink-navy/60 whitespace-nowrap">{d.quantita != null ? `${d.quantita}${d.unita ? ' ' + d.unita : ''}` : '—'}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-ink-navy">{d.prezzoTotale != null ? eur(d.prezzoTotale) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-ink-navy/35">
                        {f.origine === 'manuale'
                          ? 'Bolla inserita a mano: nessun dettaglio riga-per-riga. Il totale per aliquota è qui sopra.'
                          : 'Nessun dettaglio articoli disponibile per questa bolla.'}
                      </p>
                    )}

                    {f.note && <p className="text-xs text-ink-navy/50"><span className="text-ink-navy/35">Note:</span> {f.note}</p>}
                  </div>
                )}
              </div>
            )
          })}
          {fatture.length === 0 && (
            <p className="text-sm text-ink-navy/40 py-2">Nessuna bolla in questo mese. Inseriscile qui per recuperare l&apos;IVA a credito sugli acquisti.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Coppia etichetta/valore per la vista dettaglio della bolla.
function Dato({ label, valore }: { label: string; valore: string }) {
  return (
    <div>
      <p className="text-ink-navy/35">{label}</p>
      <p className="text-ink-navy/80 font-medium truncate">{valore}</p>
    </div>
  )
}

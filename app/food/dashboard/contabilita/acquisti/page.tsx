'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { IconTrash } from '@/app/components/icons'

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
interface Fattura {
  id: string; fornitore: string | null; numero: string | null; data: string
  categoria: string; note: string | null; netto: number; iva: number; lordo: number
  righe: RigaOut[]
}
interface Totali { netto: number; iva: number; numero: number }

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIE.map(([v, l]) => [v, l]))

export default function AcquistiPage() {
  const [fatture, setFatture] = useState<Fattura[]>([])
  const [totali, setTotali] = useState<Totali>({ netto: 0, iva: 0, numero: 0 })
  const [label, setLabel] = useState('')

  // Form nuova bolla. Gli importi per aliquota si copiano dal riquadro "Riepilogo IVA".
  const [fornitore, setFornitore] = useState('')
  const [numero, setNumero] = useState('')
  const [data, setData] = useState(oggiISO())
  const [categoria, setCategoria] = useState('merci')
  const [imponibili, setImponibili] = useState<Record<string, string>>({}) // aliquotaKey → imponibile
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState('')

  const carica = useCallback(() => {
    fetch('/api/contabilita/fatture', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setFatture(d.fatture ?? []); setTotali(d.totali ?? { netto: 0, iva: 0, numero: 0 }); setLabel(d.label ?? '') })
      .catch(() => {})
  }, [])
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
      body: JSON.stringify({ fornitore, numero, data, categoria, righe: righeAnteprima }),
    })
    setSalvando(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErrore(d.error ?? 'Errore nel salvataggio'); return }
    setFornitore(''); setNumero(''); setData(oggiISO()); setCategoria('merci'); setImponibili({})
    carica()
  }

  async function elimina(id: string) {
    await fetch(`/api/contabilita/fatture?id=${id}`, { method: 'DELETE', credentials: 'include' })
    carica()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/food/dashboard/contabilita" className="text-xs text-ink-navy/50 hover:text-ink-navy">← Contabilità</Link>
        <h1 className="text-xl font-bold text-ink-navy mt-1">Acquisti / Bolle fornitori</h1>
        <p className="text-sm text-ink-navy/50">Le fatture dei fornitori servono a recuperare l&apos;<b>IVA a credito</b> reale. Ogni euro di IVA qui è un euro in meno da versare allo Stato.</p>
      </div>

      {/* Nuova bolla */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-ink-navy">Aggiungi una bolla</h2>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="text-xs text-ink-navy/55 sm:col-span-2">
            Fornitore
            <input value={fornitore} onChange={e => setFornitore(e.target.value)} placeholder="es. Ittica Rossi"
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink-navy">Bolle di {label || 'questo mese'}</h2>
          <span className="text-sm text-ink-navy/50">Credito IVA <b className="text-emerald-600">{eur(totali.iva)}</b> · su {eur(totali.netto)} netto</span>
        </div>
        <div className="space-y-2">
          {fatture.map(f => (
            <div key={f.id} className="flex items-center gap-3 py-2 border-b border-ink-navy/5 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-navy truncate">{f.fornitore || 'Fornitore n.d.'}</p>
                <p className="text-xs text-ink-navy/40">
                  {new Date(f.data).toLocaleDateString('it-IT')} · {CAT_LABEL[f.categoria] ?? f.categoria}
                  {f.numero ? ` · n. ${f.numero}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm tabular-nums text-ink-navy">{eur(f.netto)} <span className="text-ink-navy/40 text-xs">netto</span></p>
                <p className="text-[11px] text-emerald-600 tabular-nums">+ {eur(f.iva)} IVA a credito</p>
              </div>
              <button onClick={() => elimina(f.id)} className="w-4 h-4 text-ink-navy/30 hover:text-rose-500 shrink-0" aria-label="Elimina"><IconTrash /></button>
            </div>
          ))}
          {fatture.length === 0 && (
            <p className="text-sm text-ink-navy/40 py-2">Nessuna bolla in questo mese. Inseriscile qui per recuperare l&apos;IVA a credito sugli acquisti.</p>
          )}
        </div>
      </div>
    </div>
  )
}

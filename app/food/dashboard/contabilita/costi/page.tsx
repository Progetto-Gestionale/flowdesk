'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { IconTrash, IconArrowRight } from '@/app/components/icons'

interface CostoFisso {
  id: string; voce: string; categoria: string; importoNetto: number
  aliquota: number; periodicita: string; attivo: boolean
}
interface CostoUnaTantum {
  id: string; voce: string; categoria: string; importoNetto: number
  aliquota: number; dataInizio: string; dataFine: string
}
interface Dip {
  id: string; nome: string; ruolo: string | null
  pagaOrariaBaseNetta: number | null; moltiplicatoreCostoAzienda: number; costoOrarioReale: number
}

const CATEGORIE = [
  ['affitto', 'Affitto'], ['utenze', 'Utenze'], ['servizi', 'Servizi'], ['personale_extra', 'Personale extra'], ['altro', 'Altro'],
]
// Etichetta di categoria con fallback: alcune categorie (marketing, leasing…) non sono più
// selezionabili ma potrebbero esistere su costi salvati in passato → mostriamo la chiave.
const catLabel = (c: string) => CATEGORIE.find(x => x[0] === c)?.[1] ?? c
const PERIODI = [['mensile', '/mese'], ['trimestrale', '/trim.'], ['annuale', '/anno']]

// Lordo effettivo di un costo salvato: i costi inseriti da oggi salvano già il lordo con
// aliquota 0, quelli vecchi sono netti + aliquota reale. La formula vale per entrambi.
const lordoCosto = (importoNetto: number, aliquota: number) => importoNetto * (1 + aliquota)
const eur = (n: number) => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const oggiISO = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD locale
const giornoBreve = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
// Etichetta del periodo di un costo una tantum: "5 set" per il singolo giorno, "5–12 set" per un intervallo.
const periodoLabel = (inizio: string, fine: string) =>
  inizio.slice(0, 10) === fine.slice(0, 10) ? giornoBreve(inizio) : `${giornoBreve(inizio)} – ${giornoBreve(fine)}`

export default function CostiPage() {
  const [costi, setCosti] = useState<CostoFisso[]>([])
  const [totaleMensile, setTotaleMensile] = useState(0)
  const [dip, setDip] = useState<Dip[]>([])
  // `lordo` = quello che il ristoratore paga davvero (IVA inclusa: la bolletta dice "TOTALE").
  // Lo salviamo così com'è (aliquota 0): nella vista di cassa conta quello che esce dal conto.
  const [nuovo, setNuovo] = useState({ voce: '', lordo: '', categoria: 'utenze', periodicita: 'mensile' })

  // Costi una tantum (spot): importo TOTALE su un intervallo di date, spalmato dal conto economico.
  const [costiUT, setCostiUT] = useState<CostoUnaTantum[]>([])
  const [nuovoUT, setNuovoUT] = useState({ voce: '', lordo: '', categoria: 'personale_extra', dataInizio: oggiISO(), dataFine: '' })

  const caricaCosti = useCallback(() => {
    fetch('/api/contabilita/costi-fissi', { credentials: 'include' })
      .then(r => r.json()).then(d => { setCosti(d.costi ?? []); setTotaleMensile(d.totaleMensile ?? 0) }).catch(() => {})
  }, [])
  const caricaUT = useCallback(() => {
    fetch('/api/contabilita/costi-una-tantum', { credentials: 'include' })
      .then(r => r.json()).then(d => setCostiUT(d.costi ?? [])).catch(() => {})
  }, [])
  const caricaDip = useCallback(() => {
    fetch('/api/contabilita/labor', { credentials: 'include' })
      .then(r => r.json()).then(d => setDip(d.dipendenti ?? [])).catch(() => {})
  }, [])

  useEffect(() => { caricaCosti(); caricaDip(); caricaUT() }, [caricaCosti, caricaDip, caricaUT])

  async function aggiungiCosto() {
    if (!nuovo.voce.trim() || !nuovo.lordo) return
    // Salviamo il LORDO com'è digitato (aliquota 0): è quello che esce davvero dal conto.
    await fetch('/api/contabilita/costi-fissi', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voce: nuovo.voce, categoria: nuovo.categoria, aliquota: 0, periodicita: nuovo.periodicita, importoNetto: Number(nuovo.lordo) }),
    })
    setNuovo({ voce: '', lordo: '', categoria: 'utenze', periodicita: 'mensile' })
    caricaCosti()
  }
  async function eliminaCosto(id: string) {
    await fetch(`/api/contabilita/costi-fissi?id=${id}`, { method: 'DELETE', credentials: 'include' })
    caricaCosti()
  }

  async function aggiungiUT() {
    if (!nuovoUT.voce.trim() || !nuovoUT.lordo || !nuovoUT.dataInizio) return
    // Salviamo il LORDO totale com'è (aliquota 0). dataFine vuota → singolo giorno.
    await fetch('/api/contabilita/costi-una-tantum', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voce: nuovoUT.voce, categoria: nuovoUT.categoria, aliquota: 0, importoNetto: Number(nuovoUT.lordo),
        dataInizio: nuovoUT.dataInizio, dataFine: nuovoUT.dataFine || nuovoUT.dataInizio,
      }),
    })
    setNuovoUT({ voce: '', lordo: '', categoria: 'personale_extra', dataInizio: oggiISO(), dataFine: '' })
    caricaUT()
  }
  async function eliminaUT(id: string) {
    await fetch(`/api/contabilita/costi-una-tantum?id=${id}`, { method: 'DELETE', credentials: 'include' })
    caricaUT()
  }
  async function salvaPaga(d: Dip, paga: string, molt: number) {
    await fetch('/api/contabilita/labor', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, pagaOrariaBaseNetta: paga === '' ? null : Number(paga), moltiplicatoreCostoAzienda: molt }),
    })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/food/dashboard/contabilita" className="text-xs text-ink-navy/50 hover:text-ink-navy">← Contabilità</Link>
        <h1 className="text-xl font-bold text-ink-navy mt-1">Costi & Personale</h1>
        <p className="text-sm text-ink-navy/50">Inseriti una volta: il conto economico li spalma da solo, ogni giorno.</p>
      </div>

      {/* Costi fissi */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink-navy">Costi fissi</h2>
          <span className="text-sm text-ink-navy/50">Totale <b className="text-ink-navy">{eur(totaleMensile)}</b>/mese</span>
        </div>

        <div className="space-y-2 mb-4">
          {costi.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2 border-b border-ink-navy/5 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-navy truncate">{c.voce}</p>
                <p className="text-xs text-ink-navy/40">{catLabel(c.categoria)}</p>
              </div>
              <span className="text-sm tabular-nums text-ink-navy">{eur(lordoCosto(c.importoNetto, c.aliquota))}<span className="text-ink-navy/40 text-xs">{PERIODI.find(p => p[0] === c.periodicita)?.[1]}</span></span>
              <button onClick={() => eliminaCosto(c.id)} className="w-4 h-4 text-ink-navy/30 hover:text-rose-500" aria-label="Elimina"><IconTrash /></button>
            </div>
          ))}
          {costi.length === 0 && <p className="text-sm text-ink-navy/40 py-2">Nessun costo fisso ancora. Aggiungi affitto, utenze, commercialista…</p>}
        </div>

        {/* Nuovo costo */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-mist rounded-xl p-3">
          <input value={nuovo.voce} onChange={e => setNuovo({ ...nuovo, voce: e.target.value })} placeholder="Voce (es. Affitto)"
            className="sm:col-span-4 px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
          <select value={nuovo.categoria} onChange={e => setNuovo({ ...nuovo, categoria: e.target.value })}
            className="sm:col-span-3 px-2 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white">
            {CATEGORIE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={nuovo.lordo} onChange={e => setNuovo({ ...nuovo, lordo: e.target.value })} type="number" placeholder="€ quanto paghi" inputMode="decimal"
            className="sm:col-span-3 px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
          <select value={nuovo.periodicita} onChange={e => setNuovo({ ...nuovo, periodicita: e.target.value })}
            className="sm:col-span-1 px-1 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white">
            {PERIODI.map(([v, l]) => <option key={v} value={v}>{l.replace('/', '')}</option>)}
          </select>
          <button onClick={aggiungiCosto} className="sm:col-span-1 bg-electric-blue text-white rounded-lg py-2 flex items-center justify-center" aria-label="Aggiungi"><span className="w-4 h-4"><IconArrowRight /></span></button>
        </div>
        <p className="text-xs text-ink-navy/35 mt-2">
          Scrivi <b>quanto paghi davvero</b> (il totale della bolletta/fattura, IVA inclusa) e ogni quanto. Il conto lo spalma da solo, ogni giorno.
        </p>
      </div>

      {/* Costi una tantum (spot) */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-ink-navy">Costi una tantum</h2>
        </div>
        <p className="text-sm text-ink-navy/50 mb-4">Spese occasionali legate a giorni precisi: un cameriere in più per un evento, una riparazione, spese accessorie. Il conto economico le conta <b>solo nei giorni del periodo</b> che indichi.</p>

        <div className="space-y-2 mb-4">
          {costiUT.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2 border-b border-ink-navy/5 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-navy truncate">{c.voce}</p>
                <p className="text-xs text-ink-navy/40">
                  {periodoLabel(c.dataInizio, c.dataFine)} · {catLabel(c.categoria)}
                </p>
              </div>
              <span className="text-sm tabular-nums text-ink-navy">{eur(lordoCosto(c.importoNetto, c.aliquota))}</span>
              <button onClick={() => eliminaUT(c.id)} className="w-4 h-4 text-ink-navy/30 hover:text-rose-500" aria-label="Elimina"><IconTrash /></button>
            </div>
          ))}
          {costiUT.length === 0 && <p className="text-sm text-ink-navy/40 py-2">Nessun costo una tantum. Aggiungi spese occasionali legate a date precise.</p>}
        </div>

        {/* Nuovo costo una tantum */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-mist rounded-xl p-3">
          <input value={nuovoUT.voce} onChange={e => setNuovoUT({ ...nuovoUT, voce: e.target.value })} placeholder="Voce (es. Cameriere extra)"
            className="sm:col-span-3 px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
          <select value={nuovoUT.categoria} onChange={e => setNuovoUT({ ...nuovoUT, categoria: e.target.value })}
            className="sm:col-span-3 px-2 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white">
            {CATEGORIE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={nuovoUT.lordo} onChange={e => setNuovoUT({ ...nuovoUT, lordo: e.target.value })} type="number" placeholder="€ totale" inputMode="decimal"
            className="sm:col-span-2 px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
          <input value={nuovoUT.dataInizio} onChange={e => setNuovoUT({ ...nuovoUT, dataInizio: e.target.value })} type="date" title="Dal giorno"
            className="sm:col-span-2 px-2 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
          <input value={nuovoUT.dataFine} onChange={e => setNuovoUT({ ...nuovoUT, dataFine: e.target.value })} type="date" title="Al giorno (vuoto = singolo giorno)" min={nuovoUT.dataInizio}
            className="sm:col-span-1 px-1 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
          <button onClick={aggiungiUT} className="sm:col-span-1 bg-electric-blue text-white rounded-lg py-2 flex items-center justify-center" aria-label="Aggiungi"><span className="w-4 h-4"><IconArrowRight /></span></button>
        </div>
        <p className="text-xs text-ink-navy/35 mt-2">
          Scrivi l&apos;importo <b>totale</b> (quello che paghi, IVA inclusa) e le date <b>dal / al</b> (lascia «al» vuoto per un solo giorno): spalmiamo la spesa in modo uniforme sui giorni indicati.
          {Number(nuovoUT.lordo) > 0 && (() => {
            const inizio = nuovoUT.dataInizio, fine = nuovoUT.dataFine || nuovoUT.dataInizio
            const gg = inizio && fine ? Math.max(1, Math.round((new Date(fine).getTime() - new Date(inizio).getTime()) / 86_400_000) + 1) : 1
            const totale = Number(nuovoUT.lordo)
            return (
              <span className="block mt-1 text-ink-navy/55">
                = {eur(totale)} su {gg} {gg === 1 ? 'giorno' : 'giorni'} ({eur(totale / gg)}/giorno)
              </span>
            )
          })()}
        </p>
      </div>

      {/* Personale */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink-navy mb-1">Personale · costo orario</h2>
        <p className="text-xs text-ink-navy/50 mb-4">Paga netta in tasca × moltiplicatore costi azienda (INPS/INAIL/TFR/13ª ≈ 1,40) = costo reale/ora. Il costo dei turni si calcola da qui.</p>
        <div className="space-y-2">
          {dip.map(d => <RigaDip key={d.id} d={d} onSalva={salvaPaga} />)}
          {dip.length === 0 && (
            <p className="text-sm text-ink-navy/40">Nessun dipendente. Aggiungili in <Link href="/food/dashboard/staff" className="text-electric-blue">Staff</Link>.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function RigaDip({ d, onSalva }: { d: Dip; onSalva: (d: Dip, paga: string, molt: number) => Promise<void> }) {
  const [paga, setPaga] = useState(d.pagaOrariaBaseNetta?.toString() ?? '')
  const [molt, setMolt] = useState(d.moltiplicatoreCostoAzienda ?? 1.4)
  const [stato, setStato] = useState<'' | 'saving' | 'saved'>('')
  const salvato = useRef({ paga, molt })
  const costo = paga ? Number(paga) * molt : 0

  // Autosalvataggio: al blur di uno dei campi, se il valore è cambiato dall'ultimo
  // salvataggio lo persiste da solo. Niente tasto Salva.
  async function salvaSeCambiato() {
    if (paga === salvato.current.paga && molt === salvato.current.molt) return
    setStato('saving')
    try {
      await onSalva(d, paga, molt)
      salvato.current = { paga, molt }
      setStato('saved')
      setTimeout(() => setStato(s => (s === 'saved' ? '' : s)), 1500)
    } catch {
      setStato('')
    }
  }

  return (
    <div className="flex items-center gap-3 py-2 border-b border-ink-navy/5 last:border-0 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-navy truncate">{d.nome}</p>
        {d.ruolo && <p className="text-xs text-ink-navy/40">{d.ruolo}</p>}
      </div>
      <label className="flex items-center gap-1 text-xs text-ink-navy/50">
        Paga
        <input value={paga} onChange={e => setPaga(e.target.value)} onBlur={salvaSeCambiato} type="number" inputMode="decimal" placeholder="€/h"
          className="w-20 px-2 py-1.5 text-sm rounded-lg border border-ink-navy/10 bg-white" />
      </label>
      <label className="flex items-center gap-1 text-xs text-ink-navy/50">
        ×
        <input value={molt} onChange={e => setMolt(Number(e.target.value))} onBlur={salvaSeCambiato} type="number" step="0.05" inputMode="decimal"
          className="w-16 px-2 py-1.5 text-sm rounded-lg border border-ink-navy/10 bg-white" />
      </label>
      <span className="text-sm tabular-nums text-ink-navy w-20 text-right">{eur(costo)}<span className="text-ink-navy/40 text-xs">/h</span></span>
      <span className="w-14 text-xs text-right" aria-live="polite">
        {stato === 'saving' && <span className="text-ink-navy/40">salvo…</span>}
        {stato === 'saved' && <span className="text-emerald-500">✓ salvato</span>}
      </span>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { IconTrash, IconArrowRight } from '@/app/components/icons'

interface CostoFisso {
  id: string; voce: string; categoria: string; importoNetto: number
  aliquota: number; periodicita: string; attivo: boolean
}
interface Dip {
  id: string; nome: string; ruolo: string | null
  pagaOrariaBaseNetta: number | null; moltiplicatoreCostoAzienda: number; costoOrarioReale: number
}

const CATEGORIE = [
  ['affitto', 'Affitto'], ['utenze', 'Utenze'], ['servizi', 'Servizi'], ['personale_extra', 'Personale extra'],
  ['marketing', 'Marketing'], ['leasing', 'Leasing'], ['assicurazioni', 'Assicurazioni'], ['manutenzioni', 'Manutenzioni'], ['altro', 'Altro'],
]
const PERIODI = [['mensile', '/mese'], ['trimestrale', '/trim.'], ['annuale', '/anno']]

// Aliquote IVA selezionabili per un costo fisso (frazione salvata sul DB).
const ALIQUOTE_COSTO = [
  ['0', 'Esente (0%)'], ['0.04', '4%'], ['0.1', '10%'], ['0.22', '22%'],
] as const

// IVA suggerita in base alla categoria (impostazione di partenza, sempre modificabile).
// La quasi totalità dei costi di struttura ha IVA ordinaria 22%; l'eccezione classica sono
// le assicurazioni, esenti IVA (art. 10). L'affitto spesso è esente ma può avere IVA al 22%
// (locazione commerciale con opzione): lasciamo 22% e sarà il titolare a metterlo esente se serve.
const IVA_SUGGERITA: Record<string, number> = {
  assicurazioni: 0,
  affitto: 0.22, utenze: 0.22, servizi: 0.22, personale_extra: 0.22,
  marketing: 0.22, leasing: 0.22, manutenzioni: 0.22, altro: 0.22,
}
const labelIva = (a: number) => (a === 0 ? 'esente' : `IVA ${Math.round(a * 100)}%`)
const eur = (n: number) => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

export default function CostiPage() {
  const [costi, setCosti] = useState<CostoFisso[]>([])
  const [totaleMensile, setTotaleMensile] = useState(0)
  const [dip, setDip] = useState<Dip[]>([])
  const [nuovo, setNuovo] = useState({ voce: '', importoNetto: '', categoria: 'utenze', aliquota: 0.22, periodicita: 'mensile' })

  const caricaCosti = useCallback(() => {
    fetch('/api/contabilita/costi-fissi', { credentials: 'include' })
      .then(r => r.json()).then(d => { setCosti(d.costi ?? []); setTotaleMensile(d.totaleMensile ?? 0) }).catch(() => {})
  }, [])
  const caricaDip = useCallback(() => {
    fetch('/api/contabilita/labor', { credentials: 'include' })
      .then(r => r.json()).then(d => setDip(d.dipendenti ?? [])).catch(() => {})
  }, [])

  useEffect(() => { caricaCosti(); caricaDip() }, [caricaCosti, caricaDip])

  async function aggiungiCosto() {
    if (!nuovo.voce.trim() || !nuovo.importoNetto) return
    await fetch('/api/contabilita/costi-fissi', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nuovo, importoNetto: Number(nuovo.importoNetto) }),
    })
    setNuovo({ voce: '', importoNetto: '', categoria: 'utenze', aliquota: 0.22, periodicita: 'mensile' })
    caricaCosti()
  }
  async function eliminaCosto(id: string) {
    await fetch(`/api/contabilita/costi-fissi?id=${id}`, { method: 'DELETE', credentials: 'include' })
    caricaCosti()
  }
  async function salvaPaga(d: Dip, paga: string, molt: number) {
    await fetch('/api/contabilita/labor', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, pagaOrariaBaseNetta: paga === '' ? null : Number(paga), moltiplicatoreCostoAzienda: molt }),
    })
    caricaDip()
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
                <p className="text-xs text-ink-navy/40">{CATEGORIE.find(x => x[0] === c.categoria)?.[1]} · {labelIva(c.aliquota)}</p>
              </div>
              <span className="text-sm tabular-nums text-ink-navy">{eur(c.importoNetto)}<span className="text-ink-navy/40 text-xs">{PERIODI.find(p => p[0] === c.periodicita)?.[1]}</span></span>
              <button onClick={() => eliminaCosto(c.id)} className="w-4 h-4 text-ink-navy/30 hover:text-rose-500" aria-label="Elimina"><IconTrash /></button>
            </div>
          ))}
          {costi.length === 0 && <p className="text-sm text-ink-navy/40 py-2">Nessun costo fisso ancora. Aggiungi affitto, utenze, commercialista…</p>}
        </div>

        {/* Nuovo costo */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-mist rounded-xl p-3">
          <input value={nuovo.voce} onChange={e => setNuovo({ ...nuovo, voce: e.target.value })} placeholder="Voce (es. Affitto)"
            className="sm:col-span-3 px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
          {/* Al cambio categoria proponiamo l'IVA tipica di quel costo (modificabile). */}
          <select value={nuovo.categoria} onChange={e => setNuovo({ ...nuovo, categoria: e.target.value, aliquota: IVA_SUGGERITA[e.target.value] ?? 0.22 })}
            className="sm:col-span-3 px-2 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white">
            {CATEGORIE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={nuovo.importoNetto} onChange={e => setNuovo({ ...nuovo, importoNetto: e.target.value })} type="number" placeholder="€ netto" inputMode="decimal"
            className="sm:col-span-2 px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
          <select value={String(nuovo.aliquota)} onChange={e => setNuovo({ ...nuovo, aliquota: Number(e.target.value) })}
            title="IVA di questo costo"
            className="sm:col-span-2 px-2 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white">
            {ALIQUOTE_COSTO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={nuovo.periodicita} onChange={e => setNuovo({ ...nuovo, periodicita: e.target.value })}
            className="sm:col-span-1 px-1 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white">
            {PERIODI.map(([v, l]) => <option key={v} value={v}>{l.replace('/', '')}</option>)}
          </select>
          <button onClick={aggiungiCosto} className="sm:col-span-1 bg-electric-blue text-white rounded-lg py-2 flex items-center justify-center" aria-label="Aggiungi"><span className="w-4 h-4"><IconArrowRight /></span></button>
        </div>
        <p className="text-xs text-ink-navy/35 mt-2">Importo <b>senza IVA</b> (imponibile). L&apos;IVA (suggerita per categoria, modificabile) serve al cassetto fiscale: mettila <b>Esente</b> per assicurazioni, affitti senza IVA e simili.</p>
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

function RigaDip({ d, onSalva }: { d: Dip; onSalva: (d: Dip, paga: string, molt: number) => void }) {
  const [paga, setPaga] = useState(d.pagaOrariaBaseNetta?.toString() ?? '')
  const [molt, setMolt] = useState(d.moltiplicatoreCostoAzienda ?? 1.4)
  const costo = paga ? Number(paga) * molt : 0
  return (
    <div className="flex items-center gap-3 py-2 border-b border-ink-navy/5 last:border-0 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-navy truncate">{d.nome}</p>
        {d.ruolo && <p className="text-xs text-ink-navy/40">{d.ruolo}</p>}
      </div>
      <label className="flex items-center gap-1 text-xs text-ink-navy/50">
        Paga
        <input value={paga} onChange={e => setPaga(e.target.value)} type="number" inputMode="decimal" placeholder="€/h"
          className="w-20 px-2 py-1.5 text-sm rounded-lg border border-ink-navy/10 bg-white" />
      </label>
      <label className="flex items-center gap-1 text-xs text-ink-navy/50">
        ×
        <input value={molt} onChange={e => setMolt(Number(e.target.value))} type="number" step="0.05" inputMode="decimal"
          className="w-16 px-2 py-1.5 text-sm rounded-lg border border-ink-navy/10 bg-white" />
      </label>
      <span className="text-sm tabular-nums text-ink-navy w-20 text-right">{eur(costo)}<span className="text-ink-navy/40 text-xs">/h</span></span>
      <button onClick={() => onSalva(d, paga, molt)} className="text-xs font-medium bg-ink-navy text-white rounded-lg px-3 py-1.5">Salva</button>
    </div>
  )
}

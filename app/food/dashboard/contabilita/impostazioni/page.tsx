'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Config {
  ragioneSociale?: string | null
  partitaIva?: string | null
  codiceFiscale?: string | null
  aliquotaVenditaDefault: number
  percentualeAccantonamentoImposte: number
  moltiplicatoreLaborDefault: number
  regimeFiscale: string
  coefficienteRedditivita: number
  aliquotaImpostaForfettario: number
  fonteOreLabor: string
}

export default function ImpostazioniContabiliPage() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [salvato, setSalvato] = useState(false)

  useEffect(() => {
    fetch('/api/contabilita/config', { credentials: 'include' })
      .then(r => r.json()).then(setCfg).catch(() => {})
  }, [])

  async function salva() {
    if (!cfg) return
    await fetch('/api/contabilita/config', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
    setSalvato(true)
    setTimeout(() => setSalvato(false), 2000)
  }

  if (!cfg) return <div className="p-6 text-sm text-ink-navy/40">Caricamento…</div>

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/food/dashboard/contabilita" className="text-xs text-ink-navy/50 hover:text-ink-navy">← Contabilità</Link>
        <h1 className="text-xl font-bold text-ink-navy mt-1">Impostazioni contabili</h1>
        <p className="text-sm text-ink-navy/50">Dati fiscali per il report e come stimiamo il costo del personale.</p>
      </div>

      {/* Dati fiscali del locale: usati nell'intestazione del report per il commercialista. */}
      <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm space-y-5">
        <div>
          <p className="text-sm font-semibold text-ink-navy">Dati fiscali del locale</p>
          <p className="text-xs text-ink-navy/45">Compaiono nell&apos;intestazione del report Excel per il commercialista. Facoltativi ma consigliati.</p>
        </div>
        <Campo label="Ragione sociale" hint="Es. «Trattoria Da Mario S.r.l.». Se vuota, nel report si usa il nome del locale.">
          <input type="text" value={cfg.ragioneSociale ?? ''} onChange={e => setCfg({ ...cfg, ragioneSociale: e.target.value })}
            placeholder="Ragione sociale" className="w-full max-w-md px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
        </Campo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Partita IVA" hint="11 cifre.">
            <input type="text" inputMode="numeric" value={cfg.partitaIva ?? ''} onChange={e => setCfg({ ...cfg, partitaIva: e.target.value })}
              placeholder="01234567890" className="w-full px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
          </Campo>
          <Campo label="Codice Fiscale" hint="Del titolare o della società.">
            <input type="text" value={cfg.codiceFiscale ?? ''} onChange={e => setCfg({ ...cfg, codiceFiscale: e.target.value })}
              placeholder="Codice Fiscale" className="w-full px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
          </Campo>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm space-y-5">
        <div>
          <p className="text-sm font-semibold text-ink-navy">Costo del personale</p>
          <p className="text-xs text-ink-navy/45">Come stimiamo quanto ti costa davvero lo staff nella vista di cassa.</p>
        </div>

        <Campo
          label="Moltiplicatore costo azienda (default)"
          hint="Sulla busta paga netta gravano i contributi (INPS/INAIL/TFR, tredicesima…): il costo reale per l'azienda è più alto di quello che il dipendente porta a casa. ~1,40 = +40% sul netto è una stima tipica per la ristorazione; regolala se il tuo commercialista ti dà un valore più preciso. Vale per i nuovi dipendenti."
        >
          <div className="flex items-center gap-2">
            <input type="number" step="0.05" min={1} value={cfg.moltiplicatoreLaborDefault}
              onChange={e => setCfg({ ...cfg, moltiplicatoreLaborDefault: Number(e.target.value) })}
              className="w-24 px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
            <span className="text-sm text-ink-navy/50">× la paga netta</span>
          </div>
        </Campo>

        <Campo
          label="Ore per il costo del personale"
          hint="Da dove prendere le ore lavorate. «Turni pianificati» usa gli orari che programmi (semplice). «Timbrature reali» usa entrata/uscita effettive dei dipendenti, con ritorno automatico ai turni quando per quel giorno non ci sono timbri."
        >
          <select value={cfg.fonteOreLabor} onChange={e => setCfg({ ...cfg, fonteOreLabor: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white">
            <option value="turni">Turni pianificati</option>
            <option value="timbrature">Timbrature reali (con fallback ai turni)</option>
          </select>
        </Campo>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={salva} className="text-sm font-semibold bg-electric-blue text-white rounded-lg px-5 py-2.5 hover:bg-electric-blue/90">Salva</button>
        {salvato && <span className="text-sm text-emerald-600 font-medium">✓ Salvato</span>}
      </div>
    </div>
  )
}

function Campo({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink-navy mb-1">{label}</p>
      <p className="text-xs text-ink-navy/45 mb-2 max-w-lg">{hint}</p>
      {children}
    </div>
  )
}

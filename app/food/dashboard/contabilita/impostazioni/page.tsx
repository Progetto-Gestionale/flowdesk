'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Config {
  aliquotaVenditaDefault: number
  percentualeAccantonamentoImposte: number
  moltiplicatoreLaborDefault: number
  regimeFiscale: string
  coefficienteRedditivita: number
  aliquotaImpostaForfettario: number
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
        <p className="text-sm text-ink-navy/50">Valgono per tutto il locale. Le eccezioni si impostano sulla singola categoria/piatto.</p>
      </div>

      <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm space-y-5">
        <Campo
          label="Aliquota IVA di vendita (default)"
          hint="10% per la somministrazione al tavolo. Vale per tutti i piatti, salvo override su categoria/piatto (es. alcolici in asporto al 22%)."
        >
          <select value={cfg.aliquotaVenditaDefault} onChange={e => setCfg({ ...cfg, aliquotaVenditaDefault: Number(e.target.value) })}
            className="px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white">
            <option value={0.1}>10% — somministrazione</option>
            <option value={0.04}>4% — beni prima necessità</option>
            <option value={0.22}>22% — ordinaria</option>
          </select>
          <div className="mt-3 rounded-xl bg-mist/60 border border-ink-navy/10 px-3 py-2.5 flex items-start gap-3">
            <p className="text-xs text-ink-navy/55 flex-1">
              L&apos;override per singolo prodotto si imposta dal <b>Menu</b>: apri un piatto e scegli la sua &laquo;IVA di vendita&raquo;
              (es. gli alcolici al 22%). Quello che scegli lì vince su questo default.
            </p>
            <Link href="/food/dashboard/menu"
              className="shrink-0 text-xs font-semibold bg-white border border-ink-navy/15 rounded-lg px-3 py-2 text-ink-navy/70 hover:border-electric-blue hover:text-electric-blue transition-colors">
              Vai al Menu →
            </Link>
          </div>
        </Campo>

        {cfg.regimeFiscale !== 'forfettario' && (
          <Campo
            label="Accantonamento imposte (regime ordinario)"
            hint="Percentuale dell'utile (EBITDA) messa da parte come stima delle imposte sul reddito (IRES/IRAP/IRPEF). Non sostituisce il commercialista: serve a non farti trovare senza liquidità quando arriva l'F24."
          >
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} value={Math.round(cfg.percentualeAccantonamentoImposte * 100)}
                onChange={e => setCfg({ ...cfg, percentualeAccantonamentoImposte: Number(e.target.value) / 100 })}
                className="w-20 px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
              <span className="text-sm text-ink-navy/50">% dell&apos;utile</span>
            </div>
          </Campo>
        )}

        <Campo
          label="Moltiplicatore costo azienda (default)"
          hint="Costi nascosti del personale (INPS/INAIL/TFR/13ª/14ª). ~1,40 = +40% sulla paga netta. Applicato ai nuovi dipendenti."
        >
          <input type="number" step="0.05" min={1} value={cfg.moltiplicatoreLaborDefault}
            onChange={e => setCfg({ ...cfg, moltiplicatoreLaborDefault: Number(e.target.value) })}
            className="w-24 px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
        </Campo>

        <Campo label="Regime fiscale" hint="In forfettario non c'è IVA (non la incassi sulle vendite né la recuperi sugli acquisti) e l'imposta si calcola sui ricavi, non sull'utile. Cambia il modo in cui stimiamo le tasse.">
          <select value={cfg.regimeFiscale} onChange={e => setCfg({ ...cfg, regimeFiscale: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white">
            <option value="ordinario">Ordinario</option>
            <option value="forfettario">Forfettario</option>
          </select>
        </Campo>

        {cfg.regimeFiscale === 'forfettario' && (
          <>
            <Campo
              label="Coefficiente di redditività"
              hint="Nel forfettario le tasse si pagano solo su una parte dei ricavi: per bar e ristoranti è il 40% (il resto è considerato costo forfettario dallo Stato). Lascia 40% salvo diversa indicazione del commercialista."
            >
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={100} value={Math.round(cfg.coefficienteRedditivita * 100)}
                  onChange={e => setCfg({ ...cfg, coefficienteRedditivita: Number(e.target.value) / 100 })}
                  className="w-20 px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white" />
                <span className="text-sm text-ink-navy/50">% dei ricavi</span>
              </div>
            </Campo>
            <Campo
              label="Imposta sostitutiva"
              hint="L'aliquota unica del forfettario: 15% a regime, oppure 5% nei primi 5 anni di una nuova attività (start-up). Si applica sui ricavi × coefficiente."
            >
              <select value={String(cfg.aliquotaImpostaForfettario)} onChange={e => setCfg({ ...cfg, aliquotaImpostaForfettario: Number(e.target.value) })}
                className="px-3 py-2 text-sm rounded-lg border border-ink-navy/10 bg-white">
                <option value="0.15">15% — a regime</option>
                <option value="0.05">5% — start-up (primi 5 anni)</option>
              </select>
            </Campo>
          </>
        )}
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

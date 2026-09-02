'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getCache, setCache } from '@/lib/pageCache'
import { IconSettings, IconCash, IconUsers, IconRefresh } from '@/app/components/icons'

// ── Tipi allineati a /api/contabilita/summary ────────────────────────────────
interface Conto {
  fatturatoLordo: number; ivaDebito: number; ivaCredito: number; ivaNetta: number
  fatturatoNetto: number; foodCostVenduto: number; primoMargine: number
  laborCost: number; margineDopoPersonale: number; quotaCostiFissi: number
  ebitda: number; accantonamentoImposte: number; utileStimato: number; marginePct: number
  spendibile: { livello1: number; livello2: number; livello3: number; livello4: number }
}
interface Summary {
  periodo: string; label: string; semaforo: 'verde' | 'giallo' | 'rosso'
  giorni: number; coperti: number; ordini: number; conto: Conto
  perReparto: { reparto: string; netto: number }[]
  perCanale: { canale: string; netto: number }[]
  perCategoriaCosto: { categoria: string; importo: number }[]
}

const PERIODI = [
  { id: 'oggi', label: 'Oggi' },
  { id: 'settimana', label: 'Settimana' },
  { id: 'mese', label: 'Mese' },
  { id: 'anno', label: 'Anno' },
]

const eur = (n: number) => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

const SEMAFORO: Record<string, { bg: string; testo: string; label: string; emoji: string }> = {
  verde: { bg: 'bg-emerald-50 border-emerald-200', testo: 'text-emerald-700', label: 'In salute', emoji: '🟢' },
  giallo: { bg: 'bg-amber-50 border-amber-200', testo: 'text-amber-700', label: 'Attenzione', emoji: '🟡' },
  rosso: { bg: 'bg-rose-50 border-rose-200', testo: 'text-rose-700', label: 'Criticità', emoji: '🔴' },
}

const CANALE_LABEL: Record<string, string> = { tavolo: 'Tavolo', asporto: 'Asporto', delivery: 'Delivery' }
const CAT_COSTO_LABEL: Record<string, string> = {
  affitto: 'Affitto', utenze: 'Utenze', servizi: 'Servizi', personale_extra: 'Personale extra',
  marketing: 'Marketing', leasing: 'Leasing', assicurazioni: 'Assicurazioni', manutenzioni: 'Manutenzioni', altro: 'Altro',
}

// Sposta il riferimento avanti/indietro di un'unità del periodo scelto (per navigare i mesi/settimane/anni passati).
function spostaRiferimento(rif: Date, periodo: string, dir: 1 | -1): Date {
  const d = new Date(rif)
  if (periodo === 'settimana') d.setDate(d.getDate() + dir * 7)
  else if (periodo === 'anno') d.setFullYear(d.getFullYear() + dir)
  else if (periodo === 'oggi') d.setDate(d.getDate() + dir)
  else d.setMonth(d.getMonth() + dir) // mese
  return d
}
// Due date cadono nello stesso periodo? Serve a disabilitare "avanti" quando siamo già sul periodo corrente.
function stessoPeriodo(a: Date, b: Date, periodo: string): boolean {
  if (periodo === 'anno') return a.getFullYear() === b.getFullYear()
  if (periodo === 'mese') return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
  if (periodo === 'settimana') {
    const lun = (d: Date) => { const x = new Date(d); x.setDate(d.getDate() - ((d.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x.getTime() }
    return lun(a) === lun(b)
  }
  return a.toDateString() === b.toDateString() // oggi
}
const refKey = (rif: Date) => rif.toISOString().slice(0, 10)

export default function ContabilitaPage() {
  const [periodo, setPeriodo] = useState('mese')
  const [riferimento, setRiferimento] = useState<Date>(new Date())
  const [data, setData] = useState<Summary | null>(() => getCache<Summary>('contabilita_mese') ?? null)
  const [loading, setLoading] = useState(false)

  const carica = useCallback((p: string, rif: Date) => {
    setLoading(true)
    fetch(`/api/contabilita/summary?periodo=${p}&riferimento=${rif.toISOString()}`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: Summary) => { setData(d); setCache(`contabilita_${p}_${refKey(rif)}`, d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const cached = getCache<Summary>(`contabilita_${periodo}_${refKey(riferimento)}`)
    if (cached) setData(cached)
    carica(periodo, riferimento)
  }, [periodo, riferimento, carica])

  const isCorrente = stessoPeriodo(riferimento, new Date(), periodo)
  // Cambiare tipo di periodo riparte sempre da "adesso".
  function cambiaPeriodo(p: string) { setPeriodo(p); setRiferimento(new Date()) }

  const c = data?.conto
  const sem = data ? SEMAFORO[data.semaforo] : SEMAFORO.giallo

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-navy">Contabilità</h1>
          <p className="text-sm text-ink-navy/50">Il conto economico reale del locale — al netto di IVA, costi e tasse.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/food/dashboard/contabilita/costi" className="flex items-center gap-1.5 text-sm font-medium text-ink-navy/70 hover:text-ink-navy bg-white border border-ink-navy/10 rounded-lg px-3 py-2">
            <span className="w-4 h-4"><IconCash /></span> Costi & Personale
          </Link>
          <Link href="/food/dashboard/contabilita/impostazioni" className="flex items-center gap-1.5 text-sm font-medium text-ink-navy/70 hover:text-ink-navy bg-white border border-ink-navy/10 rounded-lg px-3 py-2">
            <span className="w-4 h-4"><IconSettings /></span> Impostazioni
          </Link>
        </div>
      </div>

      {/* Selettore periodo */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex bg-white border border-ink-navy/10 rounded-lg p-1">
          {PERIODI.map(p => (
            <button key={p.id} onClick={() => cambiaPeriodo(p.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${periodo === p.id ? 'bg-electric-blue text-white' : 'text-ink-navy/60 hover:text-ink-navy'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* Navigazione periodi passati: ‹ periodo precedente · periodo · successivo › */}
          <div className="inline-flex items-center gap-1 bg-white border border-ink-navy/10 rounded-lg px-1 py-1">
            <button onClick={() => setRiferimento(spostaRiferimento(riferimento, periodo, -1))}
              className="w-7 h-7 flex items-center justify-center rounded-md text-ink-navy/60 hover:bg-mist" aria-label="Periodo precedente">‹</button>
            <span className="text-sm font-medium text-ink-navy min-w-[92px] text-center tabular-nums">{data?.label ?? '—'}</span>
            <button onClick={() => { if (!isCorrente) setRiferimento(spostaRiferimento(riferimento, periodo, 1)) }}
              disabled={isCorrente}
              className="w-7 h-7 flex items-center justify-center rounded-md text-ink-navy/60 hover:bg-mist disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Periodo successivo">›</button>
          </div>
          {data && <span className="text-xs text-ink-navy/40 hidden sm:inline">{data.ordini} ordini · {data.coperti} coperti</span>}
          <button onClick={() => carica(periodo, riferimento)} className={`w-4 h-4 text-ink-navy/40 ${loading ? 'animate-spin' : ''}`} aria-label="Aggiorna"><IconRefresh /></button>
        </div>
      </div>

      {/* Semaforo Anti-Fallimento */}
      <div className={`rounded-2xl border p-6 ${sem.bg}`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">{sem.emoji}</span>
          <span className={`text-sm font-bold uppercase tracking-wide ${sem.testo}`}>{sem.label}</span>
          {c && <span className={`text-sm font-medium ${sem.testo}`}>· Margine netto {pct(c.marginePct)}</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-mono uppercase tracking-wide text-ink-navy/40 mb-1">Cassa totale (lordo)</p>
            <p className="text-3xl font-bold text-ink-navy/70">{eur(c?.fatturatoLordo ?? 0)}</p>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-wide text-ink-navy/40 mb-1">Soldi realmente tuoi</p>
            <p className="text-3xl font-extrabold text-ink-navy">{eur(c?.spendibile.livello4 ?? 0)}</p>
            <p className="text-xs text-ink-navy/50 mt-1">Utile netto stimato dopo IVA, food cost, personale, costi fissi e tasse.</p>
          </div>
        </div>
      </div>

      {c && (
        <>
          {/* Cosa è stato messo da parte */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniCard label="IVA da versare" valore={c.ivaNetta} hint="Cassetto fiscale" tono="rose" />
            <MiniCard label="Food cost" valore={c.foodCostVenduto} hint="Materie prime" tono="amber" />
            <MiniCard label="Personale" valore={c.laborCost} hint="Labor cost" tono="amber" />
            <MiniCard label="Costi fissi" valore={c.quotaCostiFissi} hint={`Quota ${data?.giorni}gg`} tono="amber" />
          </div>

          {/* Conto economico a cascata */}
          <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-ink-navy mb-4">Conto economico gestionale</h2>
            <div className="space-y-1 text-sm">
              <Riga label="Fatturato lordo" valore={c.fatturatoLordo} />
              <Riga label="− IVA a debito (vendite)" valore={-c.ivaDebito} muted />
              <Riga label="Fatturato netto (imponibile)" valore={c.fatturatoNetto} bold />
              <Riga label="− Food & beverage cost" valore={-c.foodCostVenduto} muted />
              <Riga label="Primo margine" valore={c.primoMargine} bold />
              <Riga label="− Labor cost (personale)" valore={-c.laborCost} muted />
              <Riga label="Margine dopo personale" valore={c.margineDopoPersonale} bold />
              <Riga label="− Quota costi fissi" valore={-c.quotaCostiFissi} muted />
              <Riga label="EBITDA gestionale" valore={c.ebitda} bold />
              <Riga label="− Accantonamento imposte" valore={-c.accantonamentoImposte} muted />
              <div className="pt-2 mt-1 border-t border-ink-navy/10">
                <Riga label="Utile netto stimato" valore={c.utileStimato} bold big />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Cassetto fiscale IVA */}
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-ink-navy mb-4">Cassetto fiscale IVA</h2>
              <div className="space-y-1 text-sm">
                <Riga label="IVA a debito (vendite)" valore={c.ivaDebito} />
                <Riga label="IVA a credito (acquisti/fissi)" valore={-c.ivaCredito} muted />
                <div className="pt-2 mt-1 border-t border-ink-navy/10">
                  <Riga label="Da versare allo Stato" valore={c.ivaNetta} bold />
                </div>
              </div>
              <p className="text-xs text-ink-navy/40 mt-3">Cifra già sottratta dal tuo &laquo;spendibile&raquo; e messa nel fondo tasse virtuale.</p>
            </div>

            {/* Ricavi netti per reparto e canale */}
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-ink-navy mb-4">Ricavi netti</h2>
              <Breakdown titolo="Per reparto" voci={data!.perReparto.map(x => ({ label: x.reparto, valore: x.netto }))} />
              <Breakdown titolo="Per canale" voci={data!.perCanale.map(x => ({ label: CANALE_LABEL[x.canale] ?? x.canale, valore: x.netto }))} />
            </div>
          </div>

          {/* Costi fissi per categoria */}
          {data!.perCategoriaCosto.length > 0 && (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-ink-navy mb-4">Costi fissi per categoria (quota del periodo)</h2>
              <Breakdown voci={data!.perCategoriaCosto.map(x => ({ label: CAT_COSTO_LABEL[x.categoria] ?? x.categoria, valore: x.importo }))} />
            </div>
          )}

          {/* Export */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-ink-navy">Report per il commercialista</p>
              <p className="text-xs text-ink-navy/50">Excel con conto economico, ricavi e costi del periodo.</p>
            </div>
            <a href={`/api/contabilita/export?periodo=${periodo}`}
              className="text-sm font-semibold bg-ink-navy text-white rounded-lg px-4 py-2.5 hover:bg-ink-navy/90">
              Esporta Excel
            </a>
          </div>
        </>
      )}

      {!c && !loading && (
        <p className="text-center text-ink-navy/40 text-sm py-12">Nessun dato per questo periodo.</p>
      )}
    </div>
  )
}

// ── Componenti di supporto ───────────────────────────────────────────────────
function Riga({ label, valore, muted, bold, big }: { label: string; valore: number; muted?: boolean; bold?: boolean; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? 'font-semibold text-ink-navy' : muted ? 'text-ink-navy/50' : 'text-ink-navy/70'} ${big ? 'text-base' : ''}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold text-ink-navy' : muted ? 'text-ink-navy/50' : 'text-ink-navy'} ${big ? 'text-lg' : ''} ${valore < 0 ? 'text-rose-600' : ''}`}>
        {eur(valore)}
      </span>
    </div>
  )
}

function MiniCard({ label, valore, hint, tono }: { label: string; valore: number; hint: string; tono: 'rose' | 'amber' }) {
  const t = tono === 'rose' ? 'text-rose-600' : 'text-amber-600'
  return (
    <div className="bg-white rounded-xl border border-ink-navy/10 p-4 shadow-sm">
      <p className="text-xs text-ink-navy/40 mb-1">{label}</p>
      <p className={`text-lg font-bold ${t}`}>{eur(valore)}</p>
      <p className="text-[11px] text-ink-navy/35 mt-0.5">{hint}</p>
    </div>
  )
}

function Breakdown({ titolo, voci }: { titolo?: string; voci: { label: string; valore: number }[] }) {
  const max = Math.max(1, ...voci.map(v => Math.abs(v.valore)))
  if (voci.length === 0) return null
  return (
    <div className="mb-3 last:mb-0">
      {titolo && <p className="text-xs font-mono uppercase tracking-wide text-ink-navy/35 mb-2">{titolo}</p>}
      <div className="space-y-2">
        {voci.map((v, i) => (
          <div key={i}>
            <div className="flex items-center justify-between text-sm mb-0.5">
              <span className="text-ink-navy/70">{v.label}</span>
              <span className="tabular-nums text-ink-navy font-medium">{eur(v.valore)}</span>
            </div>
            <div className="h-1.5 bg-ink-navy/5 rounded-full overflow-hidden">
              <div className="h-full bg-electric-blue rounded-full" style={{ width: `${(Math.abs(v.valore) / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

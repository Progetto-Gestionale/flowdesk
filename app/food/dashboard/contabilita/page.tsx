'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getCache, setCache } from '@/lib/pageCache'
import { IconSettings, IconCash, IconRefresh, IconReceipt } from '@/app/components/icons'
import { MiniCalendario } from '@/app/components/MiniCalendario'
import AiInsightCard from './AiInsightCard'

// ── Vista di CASSA semplificata ──────────────────────────────────────────────
// La pagina non mostra più un conto economico formale (IVA scorporata, cassetto
// fiscale, utile netto stimato): su dati approssimativi dava una falsa precisione.
// Mostra invece quanto entra, i costi principali e quanto resta "grosso modo",
// con un disclaimer onesto su cosa quella cifra NON include.
interface Cassa {
  incassi: number; personale: number; materiePrime: number; costiFissi: number
  cassaResta: number; cassaPct: number
}
interface Acquisti { nettoMerci: number; nettoTotale: number; ivaCredito: number; numero: number }
interface Summary {
  periodo: string; label: string; semaforo: 'verde' | 'giallo' | 'rosso'
  giorni: number; coperti: number; ordini: number; cassa: Cassa
  perReparto: { reparto: string; netto: number }[]
  perCanale: { canale: string; netto: number }[]
  perCategoriaCosto: { categoria: string; importo: number }[]
  acquisti: Acquisti
}

const PERIODI = [
  { id: 'oggi', label: 'Oggi' },
  { id: 'settimana', label: 'Settimana' },
  { id: 'mese', label: 'Mese' },
  { id: 'anno', label: 'Anno' },
]

const eur = (n: number) => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const pct = (n: number) => `${(n * 100).toFixed(0)}%`

const SEMAFORO: Record<string, { bg: string; testo: string; label: string; emoji: string }> = {
  verde: { bg: 'bg-emerald-50 border-emerald-200', testo: 'text-emerald-700', label: 'Cassa in salute', emoji: '🟢' },
  giallo: { bg: 'bg-amber-50 border-amber-200', testo: 'text-amber-700', label: 'Cassa da tenere d’occhio', emoji: '🟡' },
  rosso: { bg: 'bg-rose-50 border-rose-200', testo: 'text-rose-700', label: 'Cassa in sofferenza', emoji: '🔴' },
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
  const [calendarioAperto, setCalendarioAperto] = useState(false)
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

  const cs = data?.cassa
  const sem = data ? SEMAFORO[data.semaforo] : SEMAFORO.giallo
  const acquisti = data?.acquisti
  // Incidenza dei costi principali sugli incassi (per gli hint delle mini-card).
  const incidenza = (v: number) => (cs && cs.incassi > 0 ? ` · ${pct(v / cs.incassi)} degli incassi` : '')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-navy">Contabilità</h1>
          <p className="text-sm text-ink-navy/50">La cassa del locale in soldoni: quanto entra, i costi principali, quanto resta.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/food/dashboard/contabilita/acquisti" className="flex items-center gap-1.5 text-sm font-medium text-ink-navy/70 hover:text-ink-navy bg-white border border-ink-navy/10 rounded-lg px-3 py-2">
            <span className="w-4 h-4"><IconReceipt /></span> Acquisti / Bolle
          </Link>
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
          <div className="relative inline-flex items-center gap-1 bg-white border border-ink-navy/10 rounded-lg px-1 py-1">
            <button onClick={() => setRiferimento(spostaRiferimento(riferimento, periodo, -1))}
              className="w-7 h-7 flex items-center justify-center rounded-md text-ink-navy/60 hover:bg-mist" aria-label="Periodo precedente">‹</button>
            {/* Clic sull'etichetta = apre il calendarietto per saltare a una data (come in Analytics). */}
            <button onClick={() => setCalendarioAperto(v => !v)}
              className="text-sm font-medium text-ink-navy min-w-[92px] text-center tabular-nums rounded-md px-1.5 py-0.5 hover:bg-mist transition-colors">
              {data?.label ?? '—'}
            </button>
            <button onClick={() => { if (!isCorrente) setRiferimento(spostaRiferimento(riferimento, periodo, 1)) }}
              disabled={isCorrente}
              className="w-7 h-7 flex items-center justify-center rounded-md text-ink-navy/60 hover:bg-mist disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Periodo successivo">›</button>
            {calendarioAperto && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCalendarioAperto(false)} />
                <MiniCalendario periodo={periodo} riferimento={riferimento}
                  onScegli={d => { setRiferimento(d); setCalendarioAperto(false) }}
                  onChiudi={() => setCalendarioAperto(false)} />
              </>
            )}
          </div>
          {data && <span className="text-xs text-ink-navy/40 hidden sm:inline">{data.ordini} ordini · {data.coperti} coperti</span>}
          <button onClick={() => carica(periodo, riferimento)} className={`w-4 h-4 text-ink-navy/40 ${loading ? 'animate-spin' : ''}`} aria-label="Aggiorna"><IconRefresh /></button>
        </div>
      </div>

      {/* Semaforo cassa: quanto entra vs quanto resta */}
      <div className={`rounded-2xl border p-6 ${sem.bg}`}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-lg">{sem.emoji}</span>
          <span className={`text-sm font-bold uppercase tracking-wide ${sem.testo}`}>{sem.label}</span>
          {cs && <span className={`text-sm font-medium ${sem.testo}`}>· ti resta il {pct(cs.cassaPct)} di quello che incassi</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-mono uppercase tracking-wide text-ink-navy/40 mb-1">Incassi del periodo</p>
            <p className="text-3xl font-bold text-ink-navy/70">{eur(cs?.incassi ?? 0)}</p>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-wide text-ink-navy/40 mb-1">Cassa che resta ≈</p>
            <p className={`text-3xl font-extrabold ${(cs?.cassaResta ?? 0) < 0 ? 'text-rose-600' : 'text-ink-navy'}`}>{eur(cs?.cassaResta ?? 0)}</p>
            <p className="text-xs text-ink-navy/50 mt-1">Dopo personale, materie prime e costi fissi. Stima grossolana — vedi nota sotto.</p>
          </div>
        </div>
      </div>

      {cs && (
        <>
          {/* Ponte AI (F4): verdetto in parole semplici sul periodo mostrato.
              key = periodo+riferimento → la card rimonta a ogni cambio periodo (stato pulito). */}
          <AiInsightCard key={`${periodo}_${refKey(riferimento)}`} periodo={periodo} riferimento={riferimento} label={data?.label} corrente={isCorrente} />

          {/* I tre costi principali */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MiniCard label="Personale" valore={cs.personale} hint={`Costo azienda${incidenza(cs.personale)}`} />
            <MiniCard label="Materie prime" valore={cs.materiePrime} hint={`Food cost${incidenza(cs.materiePrime)}`} />
            <MiniCard label="Costi fissi" valore={cs.costiFissi} hint={`Affitto, utenze…${incidenza(cs.costiFissi)}`} />
          </div>

          {/* Cassa a cascata: quanto entra, i costi, quanto resta */}
          <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-ink-navy mb-4">Dove vanno i soldi</h2>
            <div className="space-y-1 text-sm">
              <Riga label="Incassi del periodo" valore={cs.incassi} bold />
              <Riga label="− Personale" valore={-cs.personale} muted />
              <Riga label="− Materie prime (food cost)" valore={-cs.materiePrime} muted />
              <Riga label="− Costi fissi (affitto, utenze, servizi…)" valore={-cs.costiFissi} muted />
              <div className="pt-2 mt-1 border-t border-ink-navy/10">
                <Riga label="Cassa che resta (stima)" valore={cs.cassaResta} bold big />
              </div>
            </div>
          </div>

          {/* Disclaimer onesto: cosa NON è incluso in "cassa che resta" */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ Cos&apos;è (e cosa NON è) questa cifra</p>
            <p className="text-sm text-ink-navy/70 leading-relaxed mb-2">
              La <b>cassa che resta</b> è una stima di massima dei soldi che restano dopo i costi principali. <b>Non è il tuo guadagno netto.</b> La cifra reale che ti rimane in tasca sarà più bassa, perché qui <b>non</b> sono conteggiati:
            </p>
            <ul className="text-sm text-ink-navy/70 leading-relaxed space-y-1 mb-2">
              <li className="flex gap-2"><span className="text-amber-500 shrink-0">•</span><span>Le <b>tasse sul reddito</b> (IRPEF/IRES/IRAP o imposta sostitutiva).</span></li>
              <li className="flex gap-2"><span className="text-amber-500 shrink-0">•</span><span>Il <b>saldo IVA</b> da versare allo Stato (qui IVA incassata e IVA pagata si compensano in grosso modo).</span></li>
              <li className="flex gap-2"><span className="text-amber-500 shrink-0">•</span><span>Costi <b>straordinari o occasionali</b> non registrati, e i tuoi eventuali <b>prelievi</b> dal locale.</span></li>
            </ul>
            <p className="text-xs text-ink-navy/45 leading-relaxed">
              Il costo del personale include una stima dei contributi (INPS/INAIL/TFR) tramite un moltiplicatore sulla paga netta, regolabile nelle <Link href="/food/dashboard/contabilita/impostazioni" className="underline font-medium">impostazioni</Link>. Sono numeri per capire l&apos;andamento della cassa, non un bilancio: il commercialista resta il riferimento ufficiale.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Da dove arrivano gli incassi */}
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-ink-navy mb-4">Da dove arrivano gli incassi</h2>
              <Breakdown titolo="Per reparto" voci={data!.perReparto.map(x => ({ label: x.reparto, valore: x.netto }))} />
              <Breakdown titolo="Per canale" voci={data!.perCanale.map(x => ({ label: CANALE_LABEL[x.canale] ?? x.canale, valore: x.netto }))} />
            </div>

            {/* Costi fissi per categoria */}
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-ink-navy mb-4">Costi fissi per categoria</h2>
              {data!.perCategoriaCosto.length > 0 ? (
                <Breakdown voci={data!.perCategoriaCosto.map(x => ({ label: CAT_COSTO_LABEL[x.categoria] ?? x.categoria, valore: x.importo }))} />
              ) : (
                <p className="text-sm text-ink-navy/45 leading-relaxed">
                  Nessun costo fisso registrato. Aggiungi affitto, utenze e servizi in{' '}
                  <Link href="/food/dashboard/contabilita/costi" className="font-medium underline">Costi & Personale</Link> per una cassa realistica.
                </p>
              )}
            </div>
          </div>

          {/* Merci: comprato vs consumato (solo se ci sono bolle) */}
          {acquisti && acquisti.numero > 0 && (
            <div className="bg-white rounded-2xl border border-ink-navy/10 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-ink-navy mb-1">Merci: comprato vs consumato</h2>
              <p className="text-xs text-ink-navy/45 mb-4">Confronto tra ciò che hai <b>pagato ai fornitori</b> (dalle bolle) e il costo delle materie prime <b>finite nei piatti venduti</b>.</p>
              <div className="space-y-1 text-sm">
                <Riga label="Acquisti dai fornitori nel periodo (bolle)" valore={acquisti.nettoMerci} />
                <Riga label="Materie prime consumate (nei piatti serviti)" valore={-cs.materiePrime} muted />
                <div className="pt-2 mt-1 border-t border-ink-navy/10">
                  <Riga label="Differenza (magazzino, scarti, omaggi)" valore={acquisti.nettoMerci - cs.materiePrime} bold />
                </div>
              </div>
              <p className="text-xs text-ink-navy/45 mt-3 leading-relaxed">
                Una differenza positiva è normale se stai facendo <b>magazzino</b>. Se resta alta mese dopo mese a magazzino stabile, sono <b>scarti, sprechi o ammanchi</b> da tenere d&apos;occhio.
              </p>
            </div>
          )}

          {/* Export */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-ink-navy/10 p-5 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-ink-navy">Report per il commercialista</p>
              <p className="text-xs text-ink-navy/50">Excel mensile: corrispettivi giornalieri, incassi, costi e cassa del periodo.</p>
            </div>
            <a href={`/api/contabilita/export?riferimento=${riferimento.toISOString()}`}
              className="text-sm font-semibold bg-ink-navy text-white rounded-lg px-4 py-2.5 hover:bg-ink-navy/90">
              Esporta Excel
            </a>
          </div>
        </>
      )}

      {!cs && !loading && (
        <p className="text-center text-ink-navy/40 text-sm py-12">Nessun dato per questo periodo.</p>
      )}
    </div>
  )
}

// ── Componenti di supporto ───────────────────────────────────────────────────
// Colora di rosso i valori negativi (costi sottratti in cascata, o una cassa negativa).
function Riga({ label, valore, muted, bold, big }: { label: string; valore: number; muted?: boolean; bold?: boolean; big?: boolean }) {
  const coloreValore = valore < 0 ? 'text-rose-600' : muted ? 'text-ink-navy/50' : 'text-ink-navy'
  return (
    // Sottile linea orizzontale tra le voci: aiuta a leggere a colpo d'occhio quale valore va con quale voce.
    <div className="flex items-center justify-between py-1.5 border-b border-ink-navy/5 last:border-b-0">
      <span className={`${bold ? 'font-semibold text-ink-navy' : muted ? 'text-ink-navy/50' : 'text-ink-navy/70'} ${big ? 'text-base' : ''}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${big ? 'text-lg' : ''} ${coloreValore}`}>
        {eur(valore)}
      </span>
    </div>
  )
}

function MiniCard({ label, valore, hint }: { label: string; valore: number; hint: string }) {
  return (
    <div className="bg-white rounded-xl border border-ink-navy/10 p-4 shadow-sm">
      <p className="text-xs text-ink-navy/40 mb-1">{label}</p>
      <p className="text-lg font-bold text-amber-600">{eur(valore)}</p>
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

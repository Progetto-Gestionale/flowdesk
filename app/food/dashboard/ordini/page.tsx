'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { IconReceipt } from '@/app/components/icons'

interface RigaOrdine {
  id: string
  nome: string
  prezzo: number
  quantita: number
  note: string
}

interface TavoloDb {
  id: string
  numero: number
  etichetta: string | null
  posti: number
}

interface Ordine {
  id: string
  tavolo: string
  tavoloId: string | null
  gruppoId: string | null
  tipo: string
  clienteInfo: string | null
  status: string
  totale: number
  note: string | null
  createdAt: string
  righe: RigaOrdine[]
}

interface AppuntamentoOrdine {
  id: string
  clienteNome?: string
  servizio?: string
  data: string
  status: string
  note?: string
  allergie?: string
}

function inferTipoOrdine(servizio?: string): 'delivery' | 'asporto' | null {
  const s = (servizio ?? '').toLowerCase()
  if (/delivery|consegna|domicilio/.test(s)) return 'delivery'
  if (/asporto|take away|takeaway|ordine/.test(s)) return 'asporto'
  return null // prenotazioni tavolo (e altri servizi) non sono ordini → escluse
}

function getServiceWindow(): { start: Date; end: Date } {
  const CUTOFF_HOUR = 4
  const now = new Date()
  const serviceDay = new Date(now)
  if (now.getHours() < CUTOFF_HOUR) serviceDay.setDate(serviceDay.getDate() - 1)
  serviceDay.setHours(0, 0, 0, 0)
  const end = new Date(serviceDay)
  end.setDate(end.getDate() + 1)
  end.setHours(CUTOFF_HOUR, 0, 0, 0)
  return { start: serviceDay, end }
}

const TIPO_THEME = {
  tavolo:   { border: 'border-amber-300',  bg: 'bg-amber-50',   text: 'text-amber-800'  },
  asporto:  { border: 'border-violet-300', bg: 'bg-violet-50',  text: 'text-violet-800' },
  delivery: { border: 'border-teal-300',   bg: 'bg-teal-50',    text: 'text-teal-800'   },
}

// Colori più tenui per le celle dentro le righe
const CELL_THEME = {
  tavolo:   { border: 'border-amber-200',  bg: 'bg-amber-50/30'  },
  asporto:  { border: 'border-violet-200', bg: 'bg-violet-50/30' },
  delivery: { border: 'border-teal-200',   bg: 'bg-teal-50/30'   },
}

export default function OrdiniPage() {
  const [ordini, setOrdini] = useState<Ordine[]>([])
  const [tavoli, setTavoli] = useState<TavoloDb[]>([])
  const [appuntamenti, setAppuntamenti] = useState<AppuntamentoOrdine[]>([])
  const [loading, setLoading] = useState(true)
  const [cambioTavolo, setCambioTavolo] = useState<string | null>(null)
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null)
  const [vista, setVista] = useState<'attuali' | 'passati'>('attuali')
  const [filtroStorico, setFiltroStorico] = useState<'tavolo' | 'asporto' | 'delivery'>('tavolo')
  const [blockAsporto, setBlockAsporto] = useState(false)
  const [blockDelivery, setBlockDelivery] = useState(false)
  const [savingBlocco, setSavingBlocco] = useState(false)

  async function fetchOrdini() {
    const res = await fetch('/api/ordini?oggi=1', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setOrdini(data.ordini ?? [])
  }

  async function fetchBlocchi() {
    const res = await fetch('/api/impostazioni/blocchi', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setBlockAsporto(data.blockAsporto ?? false)
    setBlockDelivery(data.blockDelivery ?? false)
  }

  async function toggleBlocco(campo: 'blockAsporto' | 'blockDelivery', valore: boolean) {
    setSavingBlocco(true)
    if (campo === 'blockAsporto') setBlockAsporto(valore)
    else setBlockDelivery(valore)
    await fetch('/api/impostazioni/blocchi', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valore }),
    })
    setSavingBlocco(false)
  }

  async function fetchTavoli() {
    const res = await fetch('/api/tavoli', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setTavoli(data.tavoli ?? [])
  }

  async function fetchAppuntamenti() {
    const res = await fetch('/api/appuntamenti', { credentials: 'include', cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    setAppuntamenti(data.appuntamenti ?? [])
  }

  useEffect(() => {
    Promise.all([fetchOrdini(), fetchTavoli(), fetchAppuntamenti(), fetchBlocchi()]).finally(() => setLoading(false))
    const interval = setInterval(() => { fetchOrdini(); fetchAppuntamenti() }, 15000)
    return () => clearInterval(interval)
  }, [])

  // La cucina segna l'ordine come "pronto".
  // - delivery: diventa 'pronto', poi il fattorino lo segnerà 'consegnato' (auto-chiusura conto).
  // - asporto: diventa 'pronto' e il conto NON viene chiuso: lo chiude il cameriere con "Chiudi conto".
  // - tavolo: va 'consegnato' (servito in sala; il conto del tavolo si gestisce dai Conti).
  async function avanzaOrdine(o: Ordine) {
    const isTavolo = o.tipo === 'tavolo' || o.tavoloId != null || o.gruppoId != null
    const nuovoStatus = isTavolo ? 'consegnato' : 'pronto'
    // Update ottimistico: la card si sposta subito, senza aspettare il server.
    setOrdini(prev => prev.map(x => x.id === o.id ? { ...x, status: nuovoStatus } : x))
    try {
      await fetch(`/api/ordini/${o.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nuovoStatus }),
      })
    } finally {
      fetchOrdini()
    }
  }


  async function cancellaOrdine(id: string) {
    await fetch(`/api/ordini/${id}`, { method: 'DELETE', credentials: 'include' })
    setConfermaElimina(null)
    fetchOrdini()
  }

  async function assegnaTavolo(ordineId: string, tavoloId: string, tavoloNumero: string) {
    await fetch(`/api/ordini/${ordineId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tavoloId, tavolo: tavoloNumero }),
    })
    setCambioTavolo(null)
    fetchOrdini()
  }

  async function segnaAppCompletato(id: string) {
    await fetch(`/api/appuntamenti/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completato' }),
    })
    fetchAppuntamenti()
  }

  async function eliminaAppuntamento(id: string) {
    await fetch(`/api/appuntamenti/${id}`, { method: 'DELETE', credentials: 'include' })
    fetchAppuntamenti()
  }

  const { start: serviceStart, end: serviceEnd } = getServiceWindow()
  const appOggi = appuntamenti.filter(a => {
    if (a.status === 'cancellato' || a.status === 'no_show') return false
    const tipo = inferTipoOrdine(a.servizio)
    if (!tipo) return false
    const d = new Date(a.data)
    return d >= serviceStart && d < serviceEnd
  })

  // Per la cucina un delivery è "concluso" già quando è pronto (la consegna la gestisce il fattorino).
  // 'pagato' = pagato in cassa → concluso anche per la cucina.
  // Tavolo: concluso solo quando 'consegnato'/'chiuso'. Asporto e delivery: 'pronto' = concluso
  // per la cucina (esce dagli attivi). La chiusura conto / "non ritirato" si gestisce da Conti.
  const isDoneOrdine = (o: Ordine) => {
    const isTav = o.tipo === 'tavolo' || o.tavoloId != null || o.gruppoId != null
    return isTav
      ? ['consegnato', 'pagato', 'chiuso', 'non_consegnato'].includes(o.status)
      : ['pronto', 'consegnato', 'chiuso', 'non_consegnato'].includes(o.status)
  }
  const isDoneApp = (a: AppuntamentoOrdine) => a.status === 'completato'

  const ordiniAttivi = ordini.filter(o => !isDoneOrdine(o))
  const ordiniStorico = ordini.filter(o => isDoneOrdine(o))
  const appAttivi = appOggi.filter(a => !isDoneApp(a))
  const appStorico = appOggi.filter(a => isDoneApp(a))

  const totaleAttivi = ordiniAttivi.length + appAttivi.length
  const totaleStorico = ordiniStorico.length + appStorico.length

  // filtro tipo applicato SOLO agli ordini conclusi (storico)
  const tipoDiOrdine = (o: Ordine): 'tavolo' | 'asporto' | 'delivery' =>
    (o.tipo === 'tavolo' || o.tavoloId != null || o.gruppoId != null) ? 'tavolo' : o.tipo === 'delivery' ? 'delivery' : 'asporto'
  const ordiniStoricoFiltrati = ordiniStorico.filter(o => tipoDiOrdine(o) === filtroStorico)
  const appStoricoFiltrati = filtroStorico === 'tavolo' ? []
    : appStorico.filter(a => (inferTipoOrdine(a.servizio) ?? 'asporto') === filtroStorico)

  // Raggruppamento degli ordini di tavolo: ogni tavolo (o gruppo di tavoli uniti) è una
  // riga orizzontale con tutti i suoi ordini in fila. Asporto/delivery restano card singole.
  const isTavoloOrdine = (o: Ordine) => o.tipo === 'tavolo' || o.tavoloId != null || o.gruppoId != null

  function raggruppaPerTavolo(list: Ordine[]) {
    const map = new Map<string, { key: string; label: string; ordini: Ordine[] }>()
    for (const o of list) {
      const key = o.gruppoId ? `g:${o.gruppoId}` : o.tavoloId ? `t:${o.tavoloId}` : 'none'
      if (!map.has(key)) {
        const t = tavoli.find(tv => tv.id === o.tavoloId)
        // gruppo → o.tavolo è già "T2+3"; tavolo singolo → etichetta o "Tavolo N"; senza tavolo → "Da assegnare"
        const label = o.gruppoId
          ? o.tavolo
          : t ? (t.etichetta ?? `Tavolo ${t.numero}`)
          : o.tavoloId ? o.tavolo : 'Da assegnare'
        map.set(key, { key, label, ordini: [] })
      }
      map.get(key)!.ordini.push(o)
    }
    const gruppi = [...map.values()]
    // dentro ogni riga: ordini più vecchi a sinistra
    for (const g of gruppi) g.ordini.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    // in cima il tavolo che aspetta da più tempo
    gruppi.sort((a, b) => +new Date(a.ordini[0].createdAt) - +new Date(b.ordini[0].createdAt))
    return gruppi
  }

  const ordiniAttiviTavolo = ordiniAttivi.filter(isTavoloOrdine)
  const gruppiTavoloAttivi = raggruppaPerTavolo(ordiniAttiviTavolo)
  const gruppiTavoloStorico = raggruppaPerTavolo(ordiniStoricoFiltrati)

  // Asporto e delivery: come i tavoli, ognuno diventa una riga orizzontale con dentro
  // sia gli ordini dal menu (Ordine) sia le prenotazioni online (AppuntamentoOrdine).
  const perOra = (a: Ordine, b: Ordine) => +new Date(a.createdAt) - +new Date(b.createdAt)
  const ordiniAttiviAsporto = ordiniAttivi.filter(o => !isTavoloOrdine(o) && o.tipo !== 'delivery').sort(perOra)
  const ordiniAttiviDelivery = ordiniAttivi.filter(o => !isTavoloOrdine(o) && o.tipo === 'delivery').sort(perOra)
  const appAttiviAsporto = appAttivi.filter(a => inferTipoOrdine(a.servizio) !== 'delivery')
  const appAttiviDelivery = appAttivi.filter(a => inferTipoOrdine(a.servizio) === 'delivery')
  const nAsportoAttivi = ordiniAttiviAsporto.length + appAttiviAsporto.length
  const nDeliveryAttivi = ordiniAttiviDelivery.length + appAttiviDelivery.length

  // Bottoni azione condivisi dalle celle degli ordini (Pronto / Elimina con conferma).
  function AzioneOrdine({ o }: { o: Ordine }) {
    const isDone = isDoneOrdine(o)
    if (!isDone) return (
      <button onClick={() => avanzaOrdine(o)}
        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 transition-colors shrink-0">
        Pronto
      </button>
    )
    return confermaElimina === o.id ? (
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => setConfermaElimina(null)} className="text-xs px-2 py-0.5 rounded-lg border border-ink-navy/15 text-ink-navy/50">No</button>
        <button onClick={() => cancellaOrdine(o.id)} className="text-xs px-2 py-0.5 rounded-lg bg-red-500 text-white font-semibold">Sì</button>
      </div>
    ) : (
      <button onClick={() => setConfermaElimina(o.id)}
        className="text-xs font-semibold px-2 py-1 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors shrink-0">
        Elimina
      </button>
    )
  }

  // Cella compatta di un singolo ordine dentro una riga (tavolo, asporto o delivery).
  function OrderCell({ o }: { o: Ordine }) {
    const isDone = isDoneOrdine(o)
    const isTavolo = isTavoloOrdine(o)
    const tipoKey: keyof typeof CELL_THEME = isTavolo ? 'tavolo' : o.tipo === 'delivery' ? 'delivery' : 'asporto'
    const cell = CELL_THEME[tipoKey]
    const oraArrivo = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const nonConsegnato = o.status === 'non_consegnato'
    let ci: { nome?: string; telefono?: string; indirizzo?: string; ora?: string } = {}
    try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
    const nome = ci.nome || 'Ordine online'

    return (
      <div className={`shrink-0 w-56 rounded-lg border flex flex-col overflow-hidden ${nonConsegnato ? 'border-red-300 bg-red-50/40' : `${cell.border} ${cell.bg}`} ${isDone ? 'opacity-60' : ''}`}>
        {nonConsegnato && (
          <p className="px-3 py-1 bg-red-500 text-white text-[10px] font-bold uppercase tracking-wide text-center">
            {tipoKey === 'delivery' ? 'Non consegnato' : 'Non ritirato'}
          </p>
        )}
        <div className="px-3 py-2 border-b border-black/5 bg-white/50">
          <div className="flex items-center justify-between gap-2">
            {isTavolo
              ? <span className="text-xs font-semibold text-ink-navy/50 truncate">{oraArrivo} · €{o.totale.toFixed(2)}</span>
              : <span className="text-sm font-bold text-ink-navy truncate">{nome}</span>}
            <AzioneOrdine o={o} />
          </div>
          {!isTavolo && (
            <>
              {ci.ora && (
                <p className="mt-0.5 text-sm font-bold text-ink-navy">
                  {tipoKey === 'delivery' ? 'Consegna' : 'Ritiro'} alle {ci.ora}
                </p>
              )}
              <p className="text-xs text-ink-navy/45">
                €{o.totale.toFixed(2)}{ci.telefono ? ` · ${ci.telefono}` : ''}
              </p>
              {tipoKey === 'delivery' && ci.indirizzo && (
                <p className="text-[11px] text-ink-navy/45 break-words">{ci.indirizzo}</p>
              )}
            </>
          )}
        </div>
        <div className="divide-y divide-ink-navy/6 flex-1">
          {o.righe.map(r => (
            <div key={r.id} className="flex items-start gap-1.5 px-3 py-1.5">
              <span className="text-sm font-extrabold text-ink-navy shrink-0">{r.quantita}×</span>
              <div className="min-w-0">
                <span className="text-sm font-bold text-ink-navy break-words">{r.nome}</span>
                {r.note && <span className="block text-[11px] text-ink-navy/35 break-words">{r.note}</span>}
              </div>
            </div>
          ))}
          {o.righe.length === 0 && <p className="px-3 py-2 text-xs text-ink-navy/30">Nessuna voce</p>}
        </div>
        {o.note && <p className="px-3 py-1.5 text-[11px] text-ink-navy/35 italic border-t border-black/5">{o.note}</p>}
        {/* riassegna tavolo (solo per ordini di tavolo, utile per quelli senza tavolo o da spostare) */}
        {isTavolo && !isDone && tavoli.length > 0 && (
          <div className="border-t border-black/5">
            <button onClick={() => setCambioTavolo(cambioTavolo === o.id ? null : o.id)}
              className="w-full text-left px-3 py-1.5 text-[11px] text-electric-blue hover:underline">
              cambia tavolo
            </button>
            {cambioTavolo === o.id && (
              <div className="px-3 pb-2 flex flex-wrap gap-1">
                {tavoli.map(t => (
                  <button key={t.id} onClick={() => assegnaTavolo(o.id, t.id, t.numero.toString())}
                    className={`text-[11px] px-2 py-0.5 rounded-lg font-medium transition-colors ${o.tavoloId === t.id ? 'bg-electric-blue text-white' : 'bg-white border border-electric-blue/25 text-electric-blue hover:bg-electric-blue/15'}`}>
                    {t.etichetta ?? `T${t.numero}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Cella compatta di una prenotazione online (asporto/delivery) dentro la riga.
  function AppCell({ a }: { a: AppuntamentoOrdine }) {
    const isDone = isDoneApp(a)
    const tipoKey: keyof typeof CELL_THEME = inferTipoOrdine(a.servizio) === 'delivery' ? 'delivery' : 'asporto'
    const cell = CELL_THEME[tipoKey]
    const ora = new Date(a.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const [desc] = (a.note ?? '').split('\n')
    const nota = (desc ?? '').replace(/^Da richiesta #\d+$/, '').trim()

    return (
      <div className={`shrink-0 w-56 rounded-lg border flex flex-col overflow-hidden ${cell.border} ${cell.bg} ${isDone ? 'opacity-60' : ''}`}>
        <div className="px-3 py-2 border-b border-black/5 bg-white/50">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-ink-navy truncate">{a.clienteNome || 'Cliente'}</span>
            {!isDone ? (
              <button onClick={() => segnaAppCompletato(a.id)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 transition-colors shrink-0">
                Pronto
              </button>
            ) : (
              <button onClick={() => eliminaAppuntamento(a.id)}
                className="text-xs font-semibold px-2 py-1 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors shrink-0">
                Elimina
              </button>
            )}
          </div>
          <p className="mt-0.5 text-sm font-bold text-ink-navy">
            {tipoKey === 'delivery' ? 'Consegna' : 'Ritiro'} alle {ora}
          </p>
        </div>
        <div className="flex-1">
          {nota && <p className="px-3 py-1.5 text-sm font-bold text-ink-navy break-words">{nota}</p>}
          {a.allergie && a.allergie.toLowerCase() !== 'nessuna' && (
            <p className="px-3 pb-1.5 text-xs text-red-500 break-words">{a.allergie}</p>
          )}
        </div>
      </div>
    )
  }

  // Riga orizzontale con intestazione (tavolo/asporto/delivery) e le celle degli ordini in fila.
  function OrdiniRow({ label, tipoKey, totale, count, children }: {
    label: string
    tipoKey: keyof typeof TIPO_THEME
    totale?: number
    count: number
    children: ReactNode
  }) {
    const theme = TIPO_THEME[tipoKey]
    const badge = tipoKey === 'tavolo' ? 'bg-amber-200/60 text-amber-700'
      : tipoKey === 'delivery' ? 'bg-teal-200/60 text-teal-700' : 'bg-violet-200/60 text-violet-700'
    return (
      <div className={`bg-white border ${theme.border} rounded-xl overflow-hidden shadow-sm`}>
        <div className={`px-4 py-2.5 ${theme.bg} border-b ${theme.border} flex items-center justify-between gap-2`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-sm font-bold truncate ${theme.text}`}>{label}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${badge}`}>
              {count} {count === 1 ? 'ordine' : 'ordini'}
            </span>
          </div>
          {totale != null && <span className={`text-sm font-semibold shrink-0 ${theme.text}`}>€{totale.toFixed(2)}</span>}
        </div>
        <div className="flex gap-3 overflow-x-auto p-3">{children}</div>
      </div>
    )
  }

  if (loading) return <p className="text-ink-navy/35 text-sm p-8">Caricamento...</p>

  const vuoto = totaleAttivi === 0 && totaleStorico === 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-ink-navy">Ordini</h1>
          <div className="flex gap-1 bg-mist rounded-xl p-1">
            {([
              { key: 'attuali' as const, label: 'Attuali', count: totaleAttivi },
              { key: 'passati' as const, label: 'Passati', count: totaleStorico },
            ]).map(({ key, label, count }) => (
              <button key={key} onClick={() => setVista(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${vista === key ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                {label}
                {count > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${vista === key ? 'bg-electric-blue text-white' : 'bg-ink-navy/10 text-ink-navy/50'}`}>{count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => { fetchOrdini(); fetchAppuntamenti() }}
          className="text-sm text-electric-blue hover:text-ink-navy font-medium border border-electric-blue/25 px-3 py-1.5 rounded-lg hover:bg-electric-blue/10 transition-colors">
          ↻ Aggiorna
        </button>
      </div>

      {/* Switch blocco asporto/delivery */}
      <div className="bg-white border border-ink-navy/10 rounded-2xl px-4 py-3 flex flex-wrap gap-4 items-center shadow-sm">
        <p className="text-sm font-semibold text-ink-navy flex-1 min-w-max">Disponibilità ordini online</p>
        <div className="flex gap-4">
          {([
            { campo: 'blockAsporto' as const, label: 'Asporto' },
            { campo: 'blockDelivery' as const, label: 'Delivery' },
          ]).map(({ campo, label }) => {
            const bloccato = campo === 'blockAsporto' ? blockAsporto : blockDelivery
            return (
              <div key={campo} className="flex items-center gap-2 select-none">
                <span className={`text-sm font-medium ${bloccato ? 'text-red-500' : 'text-ink-navy/60'}`}>{label}</span>
                <button type="button" disabled={savingBlocco} onClick={() => toggleBlocco(campo, !bloccato)}
                  className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none disabled:opacity-50 ${bloccato ? 'bg-red-400' : 'bg-green-400'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform block ${bloccato ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className={`text-xs font-semibold ${bloccato ? 'text-red-500' : 'text-green-600'}`}>
                  {bloccato ? 'Sospeso' : 'Attivo'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {vuoto ? (
        <div className="bg-white rounded-2xl border border-ink-navy/10 p-20 text-center shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-3 mx-auto mb-4">
            <IconReceipt />
          </div>
          <p className="text-ink-navy/50 text-sm">Nessun ordine ancora</p>
          <p className="text-ink-navy/35 text-xs mt-1">Gli ordini arrivano dal menu digitale o dal calendario</p>
        </div>
      ) : vista === 'attuali' ? (
        /* ─── Ordini attuali ─── */
        totaleAttivi === 0 ? (
          <p className="text-sm text-ink-navy/40 py-12 text-center">Nessun ordine attivo al momento</p>
        ) : (
          <div className="space-y-3">
            {/* Tavoli: una riga orizzontale per tavolo (o gruppo di tavoli uniti) */}
            {gruppiTavoloAttivi.map(g => (
              <OrdiniRow key={g.key} label={g.label} tipoKey="tavolo" count={g.ordini.length}
                totale={g.ordini.reduce((s, o) => s + o.totale, 0)}>
                {g.ordini.map(o => <OrderCell key={o.id} o={o} />)}
              </OrdiniRow>
            ))}
            {/* Asporto: una riga con ordini e prenotazioni online */}
            {nAsportoAttivi > 0 && (
              <OrdiniRow label="Asporto" tipoKey="asporto" count={nAsportoAttivi}
                totale={ordiniAttiviAsporto.reduce((s, o) => s + o.totale, 0)}>
                {ordiniAttiviAsporto.map(o => <OrderCell key={o.id} o={o} />)}
                {appAttiviAsporto.map(a => <AppCell key={a.id} a={a} />)}
              </OrdiniRow>
            )}
            {/* Delivery: una riga con ordini e prenotazioni online */}
            {nDeliveryAttivi > 0 && (
              <OrdiniRow label="Delivery" tipoKey="delivery" count={nDeliveryAttivi}
                totale={ordiniAttiviDelivery.reduce((s, o) => s + o.totale, 0)}>
                {ordiniAttiviDelivery.map(o => <OrderCell key={o.id} o={o} />)}
                {appAttiviDelivery.map(a => <AppCell key={a.id} a={a} />)}
              </OrdiniRow>
            )}
          </div>
        )
      ) : (
        /* ─── Ordini passati (pronti questa serata) ─── */
        totaleStorico === 0 ? (
          <p className="text-sm text-ink-navy/40 py-12 text-center">Nessun ordine concluso questa serata</p>
        ) : (
          <div className="space-y-3">
            {/* Selettore tipo */}
            <div className="flex gap-1 bg-mist rounded-xl p-1 w-fit">
              {(['tavolo', 'asporto', 'delivery'] as const).map(t => (
                <button key={t} onClick={() => setFiltroStorico(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${filtroStorico === t ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                  {t}
                </button>
              ))}
            </div>
            {ordiniStoricoFiltrati.length + appStoricoFiltrati.length === 0 ? (
              <p className="text-sm text-ink-navy/30 py-3">Nessun ordine concluso di questo tipo</p>
            ) : filtroStorico === 'tavolo' ? (
              <div className="space-y-3">
                {gruppiTavoloStorico.map(g => (
                  <OrdiniRow key={g.key} label={g.label} tipoKey="tavolo" count={g.ordini.length}
                    totale={g.ordini.reduce((s, o) => s + o.totale, 0)}>
                    {g.ordini.map(o => <OrderCell key={o.id} o={o} />)}
                  </OrdiniRow>
                ))}
              </div>
            ) : (
              <OrdiniRow label={filtroStorico === 'delivery' ? 'Delivery' : 'Asporto'} tipoKey={filtroStorico}
                count={ordiniStoricoFiltrati.length + appStoricoFiltrati.length}
                totale={ordiniStoricoFiltrati.reduce((s, o) => s + o.totale, 0)}>
                {ordiniStoricoFiltrati.map(o => <OrderCell key={o.id} o={o} />)}
                {appStoricoFiltrati.map(a => <AppCell key={a.id} a={a} />)}
              </OrdiniRow>
            )}
          </div>
        )
      )}
    </div>
  )
}

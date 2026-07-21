'use client'
import { useEffect, useState } from 'react'
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

export default function OrdiniPage() {
  const [ordini, setOrdini] = useState<Ordine[]>([])
  const [tavoli, setTavoli] = useState<TavoloDb[]>([])
  const [appuntamenti, setAppuntamenti] = useState<AppuntamentoOrdine[]>([])
  const [loading, setLoading] = useState(true)
  const [cambioTavolo, setCambioTavolo] = useState<string | null>(null)
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null)
  const [storicoAperto, setStoricoAperto] = useState(false)
  const [filtroStorico, setFiltroStorico] = useState<'tutti' | 'tavolo' | 'asporto' | 'delivery'>('tutti')
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
  // Per i delivery lo stato diventa 'pronto' (poi il fattorino lo segnerà 'consegnato'
  // dalla pagina Delivery o dall'area dipendenti); per asporto/tavolo resta 'consegnato'.
  async function avanzaOrdine(o: Ordine) {
    const nuovoStatus = o.tipo === 'delivery' ? 'pronto' : 'consegnato'
    await fetch(`/api/ordini/${o.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nuovoStatus }),
    })
    fetchOrdini()
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
  const isDoneOrdine = (o: Ordine) => o.tipo === 'delivery'
    ? ['pronto', 'consegnato', 'chiuso'].includes(o.status)
    : ['consegnato', 'pagato', 'chiuso'].includes(o.status)
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
  const ordiniStoricoFiltrati = filtroStorico === 'tutti' ? ordiniStorico : ordiniStorico.filter(o => tipoDiOrdine(o) === filtroStorico)
  const appStoricoFiltrati = filtroStorico === 'tavolo' ? []
    : filtroStorico === 'tutti' ? appStorico
    : appStorico.filter(a => (inferTipoOrdine(a.servizio) ?? 'asporto') === filtroStorico)

  function OrdineCard({ o }: { o: Ordine }) {
    const isDone = isDoneOrdine(o)
    const isTavolo = o.tipo === 'tavolo' || o.tavoloId != null || o.gruppoId != null
    const tipoKey: keyof typeof TIPO_THEME = isTavolo ? 'tavolo' : o.tipo === 'delivery' ? 'delivery' : 'asporto'
    const theme = TIPO_THEME[tipoKey] // colore per tipo anche sugli ordini conclusi
    const ora = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

    const tavoloAssegnato = tavoli.find(t => t.id === o.tavoloId)
    const label = isTavolo
      ? (o.gruppoId ? o.tavolo : tavoloAssegnato ? (tavoloAssegnato.etichetta ?? `Tavolo ${tavoloAssegnato.numero}`) : `Tavolo ${o.tavolo}`)
      : (() => { try { return JSON.parse(o.clienteInfo ?? '{}').nome || 'Ordine online' } catch { return 'Ordine online' } })()

    let ci: { nome?: string; telefono?: string; indirizzo?: string; ora?: string; clienteOra?: string } = {}
    try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}

    return (
      <div className={`bg-white border rounded-xl overflow-hidden shadow-sm ${theme ? theme.border : 'border-ink-navy/10'}`}>
        {/* Header */}
        <div className={`px-4 py-3 border-b ${theme ? `${theme.bg} ${theme.border}` : 'bg-mist border-ink-navy/10'}`}>
          {/* Riga 1: label a sinistra + badge tipo (con orario per i tavoli) a destra */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className={`block text-sm font-bold truncate ${theme ? theme.text : 'text-ink-navy/50'}`}>{label}</span>
              {/* asporto/delivery: orario ritiro/consegna in evidenza sotto il nome */}
              {!isTavolo && ci.ora && (
                <p className={`mt-0.5 text-sm font-bold ${isDone ? 'text-ink-navy/40' : 'text-ink-navy'}`}>
                  {tipoKey === 'delivery' ? 'Consegna' : 'Ritiro'} alle {ci.ora}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isTavolo ? 'bg-amber-200/60 text-amber-700' : tipoKey === 'delivery' ? 'bg-teal-200/60 text-teal-700' : 'bg-violet-200/60 text-violet-700'}`}>
                {isTavolo ? 'Tavolo' : tipoKey === 'delivery' ? 'Delivery' : 'Asporto'}
              </span>
              {/* tavolo: orario di arrivo ordine sotto il badge */}
              {isTavolo && <span className={`text-xs ${theme ? theme.text + '/60' : 'text-ink-navy/35'}`}>{ora}</span>}
            </div>
          </div>

          {/* Riga 2: prezzo + azione */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className={`text-sm font-semibold ${isDone ? 'text-ink-navy/40' : 'text-ink-navy/70'}`}>€{o.totale.toFixed(2)}</span>
            {!isDone && (
              <button onClick={() => avanzaOrdine(o)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 transition-colors">
                {o.tipo === 'delivery' ? 'Segna pronto' : 'Pronto'}
              </button>
            )}
            {isDone && (
              confermaElimina === o.id ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setConfermaElimina(null)} className="text-xs px-2 py-1 rounded-lg border border-ink-navy/15 text-ink-navy/50">No</button>
                  <button onClick={() => cancellaOrdine(o.id)} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-semibold">Sì</button>
                </div>
              ) : (
                <button onClick={() => setConfermaElimina(o.id)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors">
                  Elimina
                </button>
              )
            )}
          </div>
        </div>

        {/* Assegna tavolo */}
        {isTavolo && !isDone && cambioTavolo === o.id && (
          <div className="px-4 py-2 bg-electric-blue/10 border-b border-electric-blue/15">
            <p className="text-xs font-medium text-electric-blue mb-2">Assegna tavolo:</p>
            <div className="flex flex-wrap gap-1.5">
              {tavoli.map(t => (
                <button key={t.id} onClick={() => assegnaTavolo(o.id, t.id, t.numero.toString())}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${o.tavoloId === t.id ? 'bg-electric-blue text-white' : 'bg-white border border-electric-blue/25 text-electric-blue hover:bg-electric-blue/15'}`}>
                  {t.etichetta ?? `T${t.numero}`}
                  <span className="ml-1 text-electric-blue">({t.posti}p)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Righe */}
        <div className={`divide-y divide-ink-navy/6 ${isDone ? 'opacity-60' : ''}`}>
          {isTavolo && tavoli.length > 0 && !isDone && (
            <div className="px-4 py-2">
              <button onClick={() => setCambioTavolo(cambioTavolo === o.id ? null : o.id)}
                className="text-xs text-electric-blue hover:underline">cambia tavolo</button>
            </div>
          )}
          {!isTavolo && (ci.telefono || ci.indirizzo) && (
            <div className="px-4 py-2 space-y-0.5">
              {ci.telefono && <p className="text-xs text-ink-navy/50">{ci.telefono}</p>}
              {ci.indirizzo && <p className="text-xs text-ink-navy/50">{ci.indirizzo}</p>}
            </div>
          )}
          {o.righe.map(r => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-extrabold text-ink-navy shrink-0">{r.quantita}×</span>
                <span className="text-sm font-bold text-ink-navy truncate">{r.nome}</span>
                {r.note && <span className="text-xs text-ink-navy/35 truncate">({r.note})</span>}
              </div>
              <span className="text-sm text-ink-navy/50 shrink-0">€{(r.prezzo * r.quantita).toFixed(2)}</span>
            </div>
          ))}
          {o.righe.length === 0 && <p className="px-4 py-3 text-sm text-ink-navy/30">Nessuna voce</p>}
          {o.note && <p className="px-4 py-2 text-xs text-ink-navy/35 italic">{o.note}</p>}
        </div>
      </div>
    )
  }

  function AppCard({ a }: { a: AppuntamentoOrdine }) {
    const isDone = isDoneApp(a)
    const tipoKey: keyof typeof TIPO_THEME = inferTipoOrdine(a.servizio) === 'delivery' ? 'delivery' : 'asporto'
    const theme = TIPO_THEME[tipoKey] // colore per tipo anche sugli ordini conclusi
    const ora = new Date(a.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const [desc] = (a.note ?? '').split('\n')
    const nota = (desc ?? '').replace(/^Da richiesta #\d+$/, '').trim()

    return (
      <div className={`bg-white border rounded-xl overflow-hidden shadow-sm ${theme ? theme.border : 'border-ink-navy/10'}`}>
        <div className={`px-4 py-3 border-b ${theme ? `${theme.bg} ${theme.border}` : 'bg-mist border-ink-navy/10'}`}>
          {/* Riga 1: nome + tipo a destra */}
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-bold truncate ${theme ? theme.text : 'text-ink-navy/50'}`}>{a.clienteNome || 'Cliente'}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${tipoKey === 'delivery' ? 'bg-teal-200/60 text-teal-700' : 'bg-violet-200/60 text-violet-700'}`}>
              {tipoKey === 'delivery' ? 'Delivery' : 'Asporto'}
            </span>
          </div>
          {/* Orario ritiro/consegna in evidenza */}
          <p className={`mt-1 text-sm font-bold ${isDone ? 'text-ink-navy/40' : 'text-ink-navy'}`}>
            {tipoKey === 'delivery' ? 'Consegna' : 'Ritiro'} alle {ora}
          </p>
          {/* Riga 2: azione */}
          <div className="flex items-center gap-2 mt-2">
            {!isDone && (
              <button onClick={() => segnaAppCompletato(a.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 transition-colors">
                Pronto
              </button>
            )}
            {isDone && (
              <button onClick={() => eliminaAppuntamento(a.id)}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors">
                Elimina
              </button>
            )}
          </div>
        </div>
        {nota && (
          <div className={`px-4 py-3 ${isDone ? 'opacity-60' : ''}`}>
            <p className="text-sm font-bold text-ink-navy">{nota}</p>
          </div>
        )}
        {a.allergie && a.allergie.toLowerCase() !== 'nessuna' && (
          <div className="px-4 pb-3">
            <p className="text-xs text-red-500">{a.allergie}</p>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <p className="text-ink-navy/35 text-sm p-8">Caricamento...</p>

  const vuoto = totaleAttivi === 0 && totaleStorico === 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-navy">Ordini</h1>
          <p className="text-ink-navy/50 text-sm mt-0.5">
            {totaleAttivi > 0 ? `${totaleAttivi} ordini attivi` : 'Nessun ordine attivo'} · aggiornamento ogni 15s
          </p>
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
      ) : (
        <div className="space-y-6">

          {/* Ordini attivi */}
          {totaleAttivi > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-navy/50 uppercase tracking-wider flex items-center gap-2">
                In corso
                <span className="bg-electric-blue text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{totaleAttivi}</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {ordiniAttivi.map(o => <OrdineCard key={o.id} o={o} />)}
                {appAttivi.map(a => <AppCard key={a.id} a={a} />)}
              </div>
            </div>
          )}

          {/* Storico di oggi */}
          {totaleStorico > 0 && (
            <div>
              <button onClick={() => setStoricoAperto(v => !v)}
                className="w-full flex items-center gap-3 text-left group py-2">
                <div className="h-px flex-1 bg-ink-navy/8" />
                <span className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider group-hover:text-ink-navy/60 transition-colors flex items-center gap-1.5">
                  Pronti questa serata
                  <span className="bg-mist text-ink-navy/40 px-2 py-0.5 rounded-full normal-case tracking-normal">{totaleStorico}</span>
                  <span className="text-ink-navy/30">{storicoAperto ? '▲' : '▼'}</span>
                </span>
                <div className="h-px flex-1 bg-ink-navy/8" />
              </button>
              {storicoAperto && (
                <div className="mt-3 space-y-3">
                  {/* Selettore tipo — solo per gli ordini conclusi */}
                  <div className="flex gap-1 bg-mist rounded-xl p-1 w-fit">
                    {(['tutti', 'tavolo', 'asporto', 'delivery'] as const).map(t => (
                      <button key={t} onClick={() => setFiltroStorico(t)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${filtroStorico === t ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                        {t === 'tutti' ? 'Tutti' : t}
                      </button>
                    ))}
                  </div>
                  {ordiniStoricoFiltrati.length + appStoricoFiltrati.length === 0 ? (
                    <p className="text-sm text-ink-navy/30 py-3">Nessun ordine concluso di questo tipo</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {ordiniStoricoFiltrati.map(o => <OrdineCard key={o.id} o={o} />)}
                      {appStoricoFiltrati.map(a => <AppCard key={a.id} a={a} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}

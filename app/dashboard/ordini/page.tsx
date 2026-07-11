'use client'
import { useEffect, useState } from 'react'
import { IconReceipt } from '../../components/icons'

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

const STATUS_CONFIG: Record<string, { label: string; color: string; next: string; nextLabel: string }> = {
  nuovo: { label: 'Nuovo', color: 'bg-amber-100 text-amber-700 border-amber-200', next: 'pronto', nextLabel: 'Pronto' },
  in_preparazione: { label: 'In preparazione', color: 'bg-blue-100 text-blue-700 border-blue-200', next: 'pronto', nextLabel: 'Pronto' },
  pronto: { label: 'Pronto', color: 'bg-green-100 text-green-700 border-green-200', next: 'consegnato', nextLabel: 'Consegnato' },
  consegnato: { label: 'Consegnato', color: 'bg-mist text-ink-navy/50 border-ink-navy/10', next: '', nextLabel: '' },
}

const GRUPPI = [
  { key: 'nuovo', label: 'Nuovi' },
  { key: 'pronto', label: 'Pronti' },
]

function inferTipoOrdine(servizio?: string): 'ordine' | 'delivery' | null {
  const s = (servizio ?? '').toLowerCase()
  if (/delivery|consegna|domicilio/.test(s)) return 'delivery'
  if (/asporto|take away|takeaway|ordine/.test(s)) return 'ordine'
  return null
}

// Giornata di servizio: inizia alle 04:00 e termina alle 04:00 del giorno successivo
// Gestisce lo scavallamento mezzanotte per ristoranti che chiudono tardi
function getServiceWindow(): { start: Date; end: Date } {
  const CUTOFF_HOUR = 4
  const now = new Date()
  const serviceDay = new Date(now)
  if (now.getHours() < CUTOFF_HOUR) {
    serviceDay.setDate(serviceDay.getDate() - 1)
  }
  serviceDay.setHours(0, 0, 0, 0)
  const end = new Date(serviceDay)
  end.setDate(end.getDate() + 1)
  end.setHours(CUTOFF_HOUR, 0, 0, 0)
  return { start: serviceDay, end }
}

export default function OrdiniPage() {
  const [ordini, setOrdini] = useState<Ordine[]>([])
  const [tavoli, setTavoli] = useState<TavoloDb[]>([])
  const [appuntamenti, setAppuntamenti] = useState<AppuntamentoOrdine[]>([])
  const [loading, setLoading] = useState(true)
  const [cambioTavolo, setCambioTavolo] = useState<string | null>(null)
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null)
  const [confermaAnnullaApp, setConfermaAnnullaApp] = useState<string | null>(null)
  const [storicoAperto, setStoricoAperto] = useState(false)
  const [blockAsporto, setBlockAsporto] = useState(false)
  const [blockDelivery, setBlockDelivery] = useState(false)
  const [savingBlocco, setSavingBlocco] = useState(false)

  async function fetchOrdini() {
    const res = await fetch('/api/ordini', { credentials: 'include' })
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

  async function avanzaStatus(id: string, status: string) {
    await fetch(`/api/ordini/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
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

  async function aggiornaStatusAppuntamento(id: string, status: string) {
    await fetch(`/api/appuntamenti/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchAppuntamenti()
  }

  async function eliminaAppuntamento(id: string) {
    await fetch(`/api/appuntamenti/${id}`, { method: 'DELETE', credentials: 'include' })
    fetchAppuntamenti()
  }

  // Filtra appuntamenti asporto/delivery della giornata di servizio corrente
  const { start: serviceStart, end: serviceEnd } = getServiceWindow()
  const appOggi = appuntamenti.filter(a => {
    const tipo = inferTipoOrdine(a.servizio)
    if (!tipo) return false
    if (a.status === 'cancellato' || a.status === 'no_show') return false
    const d = new Date(a.data)
    return d >= serviceStart && d < serviceEnd
  })
  const appInAttesa = appOggi.filter(a => a.status === 'confermato')
  const appPronti = appOggi.filter(a => a.status === 'pronto')
  const appAttivi = [...appInAttesa, ...appPronti]
  const appCompletati = appOggi.filter(a => a.status === 'completato')

  const ordiniTavolo = ordini.filter(o => o.tipo === 'tavolo' || (!o.tipo && o.tavolo !== 'Asporto' && o.tavolo !== 'Delivery'))
  const ordiniAsportoWeb = ordini.filter(o => o.tipo === 'asporto' || o.tipo === 'delivery' || (!o.tipo && (o.tavolo === 'Asporto' || o.tavolo === 'Delivery')))
  const ordiniAttivi = ordiniTavolo.filter(o => o.status !== 'consegnato')
  const ordiniConsegnati = ordiniTavolo.filter(o => o.status === 'consegnato')
  const hasTavoloOrdini = ordiniTavolo.filter(o => o.status !== 'consegnato').length > 0
  const hasCalendarioOrdini = appOggi.length > 0 || ordiniAsportoWeb.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-navy">Ordini</h1>
          <p className="text-ink-navy/50 text-sm mt-0.5">
            {ordiniAttivi.length > 0 || appAttivi.length > 0
              ? `${ordiniAttivi.length + appAttivi.length} ordini attivi`
              : 'Nessun ordine attivo'} · aggiornamento ogni 15s
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
                <span className={`text-sm font-medium ${bloccato ? 'text-red-500' : 'text-ink-navy/60'}`}>
                  {label}
                </span>
                <button
                  type="button"
                  disabled={savingBlocco}
                  onClick={() => toggleBlocco(campo, !bloccato)}
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

      {loading ? (
        <p className="text-ink-navy/35 text-sm">Caricamento...</p>
      ) : !hasTavoloOrdini && !hasCalendarioOrdini && ordiniConsegnati.length === 0 ? (
        <div className="bg-white rounded-2xl border border-ink-navy/10 p-20 text-center shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-3 mx-auto mb-4">
            <IconReceipt />
          </div>
          <p className="text-ink-navy/50 text-sm">Nessun ordine ancora</p>
          <p className="text-ink-navy/35 text-xs mt-1">Gli ordini arrivano dal menu digitale o dal calendario</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── ORDINI AL TAVOLO (menù digitale) ── */}
          {hasTavoloOrdini && (
            <div className="rounded-2xl border border-ink-navy/10 overflow-hidden shadow-sm">
              <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <h2 className="text-sm font-bold text-amber-800 uppercase tracking-wider">Ordini al tavolo</h2>
                <span className="text-xs font-medium bg-amber-100 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">menù digitale</span>
              </div>
              <div className="p-5 space-y-8">
                {GRUPPI.map(g => {
                  const lista = ordiniTavolo.filter(o => o.status === g.key)
                  if (lista.length === 0) return null
                  return (
                    <div key={g.key}>
                      <h3 className="text-base font-bold text-ink-navy mb-3 flex items-center gap-2">
                        {g.label}
                        <span className="text-xs font-semibold bg-mist text-ink-navy/60 px-2 py-0.5 rounded-full">{lista.length}</span>
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {lista.map(o => {
                          const cfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.nuovo
                          const ora = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                          const tavoloAssegnato = tavoli.find(t => t.id === o.tavoloId)
                          const labelTavolo = tavoloAssegnato
                            ? (tavoloAssegnato.etichetta ?? `Tavolo ${tavoloAssegnato.numero}`)
                            : `Tavolo ${o.tavolo}`
                          return (
                            <div key={o.id} className={`relative bg-white rounded-2xl border shadow-sm overflow-hidden ${o.status === 'nuovo' ? 'border-amber-300 ring-2 ring-amber-200' : 'border-ink-navy/10'}`}>
                              <div className="flex items-center justify-between px-4 py-3 border-b border-ink-navy/8">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-ink-navy">{labelTavolo}</p>
                                    {tavoli.length > 0 && (
                                      <button onClick={() => setCambioTavolo(cambioTavolo === o.id ? null : o.id)}
                                        className="text-xs text-electric-blue hover:text-electric-blue underline">
                                        cambia
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-xs text-ink-navy/35">{ora}</p>
                                </div>
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                              </div>
                              {cambioTavolo === o.id && (
                                <div className="px-4 py-2 bg-electric-blue/10 border-b border-electric-blue/15">
                                  <p className="text-xs font-medium text-electric-blue mb-2">Assegna tavolo:</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {tavoli.map(t => (
                                      <button key={t.id}
                                        onClick={() => assegnaTavolo(o.id, t.id, t.numero.toString())}
                                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${o.tavoloId === t.id ? 'bg-electric-blue text-white' : 'bg-white border border-electric-blue/25 text-electric-blue hover:bg-electric-blue/15'}`}>
                                        {t.etichetta ?? `T${t.numero}`}
                                        <span className="ml-1 text-electric-blue">({t.posti}p)</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="px-4 py-3 space-y-1.5">
                                {o.righe.map(r => (
                                  <div key={r.id} className="flex justify-between text-sm">
                                    <span className="text-ink-navy/70">{r.quantita}× {r.nome}</span>
                                    <span className="text-ink-navy/50 font-medium">€{(r.prezzo * r.quantita).toFixed(2)}</span>
                                  </div>
                                ))}
                                {o.note && <p className="text-xs text-ink-navy/35 pt-1 italic">{o.note}</p>}
                              </div>
                              <div className="px-4 py-3 border-t border-ink-navy/8 flex items-center justify-between">
                                <p className="font-bold text-ink-navy">€{o.totale.toFixed(2)}</p>
                                <div className="flex gap-2">
                                  <button onClick={() => setConfermaElimina(o.id)}
                                    className="text-xs px-3 py-1.5 rounded-lg border border-ink-navy/10 text-ink-navy/40 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors font-medium">
                                    Elimina
                                  </button>
                                  {confermaElimina === o.id && (
                                    <div className="absolute bottom-14 right-4 z-10 bg-white border border-red-200 rounded-xl shadow-lg p-3 w-52">
                                      <p className="text-xs text-ink-navy/70 font-medium mb-2">Annullare questo ordine?</p>
                                      <div className="flex gap-2">
                                        <button onClick={() => setConfermaElimina(null)}
                                          className="flex-1 text-xs py-1.5 rounded-lg border border-ink-navy/10 text-ink-navy/50 hover:bg-mist">No</button>
                                        <button onClick={() => cancellaOrdine(o.id)}
                                          className="flex-1 text-xs py-1.5 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600">Sì, elimina</button>
                                      </div>
                                    </div>
                                  )}
                                  {cfg.next && (
                                    <button onClick={() => avanzaStatus(o.id, cfg.next)}
                                      className="text-xs px-3 py-1.5 rounded-lg bg-electric-blue text-white font-semibold hover:bg-electric-blue/90 transition-colors">
                                      {cfg.nextLabel}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── ASPORTO & DELIVERY ── */}
          {hasCalendarioOrdini && (() => {
            // Unifica ordini web (Ordine) e dal calendario (Appuntamento)
            type ItemApp = { kind: 'app'; id: string; isDelivery: boolean; label: string; ora: string; note: string }
            type ItemOrdine = { kind: 'ordine'; id: string; isDelivery: boolean; righe: RigaOrdine[]; totale: number; note: string | null; ora: string; clienteNome: string | null; clienteTelefono: string | null; clienteIndirizzo: string | null; clienteOra: string | null }
            type Item = ItemApp | ItemOrdine

            const toApp = (a: AppuntamentoOrdine): ItemApp => {
              const isDelivery = inferTipoOrdine(a.servizio) === 'delivery'
              const ora = new Date(a.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
              const [desc] = (a.note ?? '').split('\n')
              const note = (desc ?? '').replace(/^Da richiesta #\d+$/, '').trim()
              return { kind: 'app', id: a.id, isDelivery, label: a.clienteNome || 'Cliente', ora, note }
            }
            const toOrdine = (o: Ordine): ItemOrdine => {
              let ci: { nome?: string; telefono?: string; indirizzo?: string; ora?: string } = {}
              try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
              return {
                kind: 'ordine', id: o.id, isDelivery: o.tipo === 'delivery',
                righe: o.righe, totale: o.totale, note: o.note,
                ora: new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                clienteNome: ci.nome ?? null,
                clienteTelefono: ci.telefono ?? null,
                clienteIndirizzo: ci.indirizzo ?? null,
                clienteOra: ci.ora ?? null,
              }
            }

            const daPrepItems: Item[] = [
              ...appInAttesa.map(toApp),
              ...ordiniAsportoWeb.filter(o => ['nuovo', 'in_preparazione'].includes(o.status)).map(toOrdine),
            ]
            const prontiItems: Item[] = [
              ...appPronti.map(toApp),
              ...ordiniAsportoWeb.filter(o => o.status === 'pronto').map(toOrdine),
            ]
            const evasiItems: Item[] = [
              ...appCompletati.map(toApp),
              ...ordiniAsportoWeb.filter(o => o.status === 'consegnato').map(toOrdine),
            ]
            const CardFooter = ({ item, stepLabel, stepColor, onStep }: {
              item: Item; stepLabel?: string; stepColor?: string; onStep?: () => void
            }) => (
              <div className="px-4 py-3 border-t border-ink-navy/8 flex items-center justify-between gap-2">
                {confermaAnnullaApp === item.id ? (
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-xs text-ink-navy/50 flex-1">Eliminare?</span>
                    <button onClick={() => setConfermaAnnullaApp(null)} className="text-xs px-2.5 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:bg-mist">No</button>
                    <button onClick={() => {
                      item.kind === 'app' ? eliminaAppuntamento(item.id) : cancellaOrdine(item.id)
                      setConfermaAnnullaApp(null)
                    }} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600">Sì</button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => setConfermaAnnullaApp(item.id)} className="text-xs px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">Elimina</button>
                    {onStep && stepLabel && (
                      <button onClick={onStep} className={`text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition-colors ${stepColor}`}>
                        {stepLabel}
                      </button>
                    )}
                  </>
                )}
              </div>
            )

            const renderCard = (item: Item, ringClass: string, badgeEl: React.ReactNode, stepLabel?: string, stepColor?: string, onStep?: () => void, dimmed = false) => {
              const nome = item.kind === 'app' ? item.label : (item.clienteNome || 'Ordine online')
              const tipoBadge = (
                <span className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${item.isDelivery ? 'bg-teal-100 text-teal-700' : 'bg-violet-100 text-violet-700'}`}>
                  {item.isDelivery ? 'Delivery' : 'Asporto'}
                </span>
              )
              return (
                <div key={item.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${ringClass} ${dimmed ? 'opacity-60' : ''}`}>
                  {/* Header: tipo badge a sinistra, status badge a destra */}
                  <div className="px-4 py-3 border-b border-ink-navy/8">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {tipoBadge}
                        <p className="font-bold text-ink-navy truncate">{nome}</p>
                      </div>
                      <div className="shrink-0">{badgeEl}</div>
                    </div>
                    <p className="text-xs text-ink-navy/35 mt-1">{item.ora}</p>
                  </div>
                  <div className="px-4 py-3 space-y-1.5">
                    {item.kind === 'app'
                      ? <>{item.note && <p className="text-sm text-ink-navy/70">{item.note}</p>}</>
                      : <>
                          {item.clienteOra && <p className="text-xs text-ink-navy/50 font-medium">Ritiro/consegna: {item.clienteOra}</p>}
                          {item.clienteTelefono && <p className="text-xs text-ink-navy/50">{item.clienteTelefono}</p>}
                          {item.clienteIndirizzo && <p className="text-xs text-ink-navy/50">{item.clienteIndirizzo}</p>}
                          {item.righe.map(r => (
                            <div key={r.id} className="flex justify-between text-sm">
                              <span className="text-ink-navy/70">{r.quantita}× {r.nome}</span>
                              <span className="text-ink-navy/50 font-medium">€{(r.prezzo * r.quantita).toFixed(2)}</span>
                            </div>
                          ))}
                          {item.note && <p className="text-xs text-ink-navy/35 pt-1 italic">{item.note}</p>}
                          <p className="text-sm font-bold text-ink-navy pt-1">€{item.totale.toFixed(2)}</p>
                        </>
                    }
                  </div>
                  <CardFooter item={item} stepLabel={stepLabel} stepColor={stepColor} onStep={onStep} />
                </div>
              )
            }

            return (
              <div className="rounded-2xl border border-ink-navy/10 overflow-hidden shadow-sm">
                <div className="bg-violet-50 border-b border-violet-200 px-5 py-3 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-violet-400" />
                  <h2 className="text-sm font-bold text-violet-800 uppercase tracking-wider">Asporto & Delivery</h2>
                </div>
                <div className="p-5 space-y-6">
                  {daPrepItems.length > 0 && (
                    <div>
                      <h3 className="text-base font-bold text-ink-navy mb-3 flex items-center gap-2">
                        Da preparare <span className="text-xs font-semibold bg-mist text-ink-navy/60 px-2 py-0.5 rounded-full">{daPrepItems.length}</span>
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {daPrepItems.map(item => renderCard(item,
                          'border-amber-200 ring-2 ring-amber-100',
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-amber-100 text-amber-700 border-amber-200">Da preparare</span>,
                          'Pronto', 'bg-electric-blue hover:bg-electric-blue/90',
                          () => item.kind === 'app' ? aggiornaStatusAppuntamento(item.id, 'pronto') : avanzaStatus(item.id, 'pronto'),
                        ))}
                      </div>
                    </div>
                  )}
                  {prontiItems.length > 0 && (
                    <div>
                      <h3 className="text-base font-bold text-ink-navy mb-3 flex items-center gap-2">
                        Pronti <span className="text-xs font-semibold bg-mist text-ink-navy/60 px-2 py-0.5 rounded-full">{prontiItems.length}</span>
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {prontiItems.map(item => {
                          const stepLabel = item.kind === 'app' ? (item.isDelivery ? 'Consegnato' : 'Ritirato') : 'Consegnato'
                          return renderCard(item,
                            'border-green-200 ring-2 ring-green-100',
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-green-100 text-green-700 border-green-200">Pronto</span>,
                            stepLabel, 'bg-green-600 hover:bg-green-700',
                            () => item.kind === 'app' ? aggiornaStatusAppuntamento(item.id, 'completato') : avanzaStatus(item.id, 'consegnato'),
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )

          })()}

          {/* ── STORICO DI OGGI (collassabile) ── */}
          {(() => {
            const asportoSection = (() => {
              type ItemApp = { kind: 'app'; id: string; isDelivery: boolean; label: string; ora: string; note: string }
              type ItemOrdine = { kind: 'ordine'; id: string; isDelivery: boolean; righe: RigaOrdine[]; totale: number; note: string | null; ora: string; clienteNome: string | null; clienteTelefono: string | null; clienteIndirizzo: string | null; clienteOra: string | null }
              type Item = ItemApp | ItemOrdine
              const toApp = (a: AppuntamentoOrdine): ItemApp => {
                const isDelivery = inferTipoOrdine(a.servizio) === 'delivery'
                const ora = new Date(a.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                const [desc] = (a.note ?? '').split('\n')
                return { kind: 'app', id: a.id, isDelivery, label: a.clienteNome || 'Cliente', ora, note: (desc ?? '').replace(/^Da richiesta #\d+$/, '').trim() }
              }
              const toOrdineEvaso = (o: Ordine): ItemOrdine => {
                let ci: { nome?: string; telefono?: string; indirizzo?: string; ora?: string } = {}
                try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
                return {
                  kind: 'ordine', id: o.id, isDelivery: o.tipo === 'delivery',
                  righe: o.righe, totale: o.totale, note: o.note,
                  ora: new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                  clienteNome: ci.nome ?? null, clienteTelefono: ci.telefono ?? null,
                  clienteIndirizzo: ci.indirizzo ?? null, clienteOra: ci.ora ?? null,
                }
              }
              return {
                evasiItems: [
                  ...appCompletati.map(toApp),
                  ...ordiniAsportoWeb.filter(o => o.status === 'consegnato').map(toOrdineEvaso),
                ] as Item[],
              }
            })()

            const totaleStorico = ordiniConsegnati.length + asportoSection.evasiItems.length
            if (totaleStorico === 0) return null

            return (
              <div>
                <button
                  onClick={() => setStoricoAperto(v => !v)}
                  className="w-full flex items-center gap-3 text-left group"
                >
                  <div className="h-px flex-1 bg-ink-navy/8" />
                  <span className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider group-hover:text-ink-navy/60 transition-colors flex items-center gap-1.5">
                    Storico di oggi
                    <span className="bg-mist text-ink-navy/40 px-2 py-0.5 rounded-full normal-case tracking-normal">{totaleStorico}</span>
                    <span className="text-ink-navy/30">{storicoAperto ? '▲' : '▼'}</span>
                  </span>
                  <div className="h-px flex-1 bg-ink-navy/8" />
                </button>

                {storicoAperto && (
                  <div className="mt-4 space-y-4">

                    {/* Storico tavolo */}
                    {ordiniConsegnati.length > 0 && (
                      <div className="rounded-2xl border border-ink-navy/10 overflow-hidden shadow-sm opacity-70">
                        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-amber-400" />
                          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Tavolo · Consegnati</p>
                          <span className="text-xs font-medium bg-amber-100 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">{ordiniConsegnati.length}</span>
                        </div>
                        <div className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {ordiniConsegnati.map(o => {
                            const ora = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                            const tavoloAssegnato = tavoli.find(t => t.id === o.tavoloId)
                            const labelTavolo = tavoloAssegnato ? (tavoloAssegnato.etichetta ?? `Tavolo ${tavoloAssegnato.numero}`) : `Tavolo ${o.tavolo}`
                            return (
                              <div key={o.id} className="bg-white rounded-xl border border-ink-navy/10 shadow-sm overflow-hidden">
                                <div className="flex items-start justify-between px-4 py-3 border-b border-ink-navy/8">
                                  <div>
                                    <p className="font-bold text-ink-navy">{labelTavolo}</p>
                                    <p className="text-xs text-ink-navy/35 mt-0.5">{ora}</p>
                                  </div>
                                  <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border bg-mist text-ink-navy/50 border-ink-navy/10">Consegnato</span>
                                </div>
                                <div className="px-4 py-3 space-y-1.5">
                                  {o.righe.map(r => (
                                    <div key={r.id} className="flex justify-between text-sm">
                                      <span className="text-ink-navy/50">{r.quantita}× {r.nome}</span>
                                      <span className="text-ink-navy/35 font-medium">€{(r.prezzo * r.quantita).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="px-4 py-3 border-t border-ink-navy/8 flex items-center justify-between">
                                  <p className="font-bold text-ink-navy/50">€{o.totale.toFixed(2)}</p>
                                  <button onClick={() => cancellaOrdine(o.id)} className="text-xs px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">Elimina</button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Storico asporto/delivery */}
                    {asportoSection.evasiItems.length > 0 && (
                      <div className="rounded-2xl border border-ink-navy/10 overflow-hidden shadow-sm opacity-70">
                        <div className="bg-violet-50 border-b border-violet-200 px-5 py-2.5 flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-violet-400" />
                          <p className="text-xs font-bold text-violet-800 uppercase tracking-wider">Asporto & Delivery · Completati</p>
                          <span className="text-xs font-medium bg-violet-100 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-full">{asportoSection.evasiItems.length}</span>
                        </div>
                        <div className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {asportoSection.evasiItems.map(item => {
                            const nome = item.kind === 'app' ? item.label : (item.clienteNome || 'Ordine online')
                            return (
                              <div key={item.id} className="bg-white rounded-xl border border-ink-navy/10 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-ink-navy/8">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${item.isDelivery ? 'bg-teal-100 text-teal-700' : 'bg-violet-100 text-violet-700'}`}>
                                        {item.isDelivery ? 'Delivery' : 'Asporto'}
                                      </span>
                                      <p className="font-bold text-ink-navy truncate">{nome}</p>
                                    </div>
                                    <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border bg-mist text-ink-navy/50 border-ink-navy/10">Completato</span>
                                  </div>
                                  <p className="text-xs text-ink-navy/35 mt-1">{item.ora}</p>
                                </div>
                                <div className="px-4 py-3 space-y-1.5">
                                  {item.kind === 'app'
                                    ? <>{item.note && <p className="text-sm text-ink-navy/50">{item.note}</p>}</>
                                    : <>{item.righe.map(r => (
                                        <div key={r.id} className="flex justify-between text-sm">
                                          <span className="text-ink-navy/50">{r.quantita}× {r.nome}</span>
                                          <span className="text-ink-navy/35 font-medium">€{(r.prezzo * r.quantita).toFixed(2)}</span>
                                        </div>
                                      ))}
                                      <p className="text-sm font-bold text-ink-navy/50 pt-1">€{item.totale.toFixed(2)}</p>
                                    </>
                                  }
                                </div>
                                <div className="px-4 py-3 border-t border-ink-navy/8 flex justify-end">
                                  <button onClick={() => {
                                    item.kind === 'app' ? eliminaAppuntamento(item.id) : cancellaOrdine(item.id)
                                  }} className="text-xs px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">Elimina</button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

        </div>
      )}
    </div>
  )
}

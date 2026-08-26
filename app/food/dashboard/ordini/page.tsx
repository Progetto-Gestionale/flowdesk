'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { IconReceipt } from '@/app/components/icons'
import { serataOggi, serataOrdine, serataKey } from '@/lib/serata'
import { getCache, setCache } from '@/lib/pageCache'
import { Skeleton, SkeletonCards } from '@/app/components/Skeleton'

interface RigaOrdine {
  id: string
  nome: string
  prezzo: number
  quantita: number
  note: string
  mandata: number
  reparto: string | null
  prontaAt: string | null
}

// Portate/coursing: 1ª, 2ª, 3ª. Le righe con la stessa mandata escono e si segnano pronte insieme.
const MANDATA_LABEL: Record<number, string> = { 1: '1ª', 2: '2ª', 3: '3ª' }

// Reparti / centri di produzione. La board può filtrare per reparto (la cucina vede i piatti, il bar le bevande).
const DEFAULT_REPARTI = ['Cucina', 'Bar']
function parseReparti(json?: string | null): string[] {
  if (!json) return [...DEFAULT_REPARTI]
  try { const a = JSON.parse(json); const l = Array.isArray(a) ? a.map((x: unknown) => String(x).trim()).filter(Boolean) : []; return l.length ? l : [...DEFAULT_REPARTI] } catch { return [...DEFAULT_REPARTI] }
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
  closedAt: string | null
  notatoNuovo: boolean
  notatoReparti: string | null // JSON dei reparti che hanno notato l'ordine (pulse rosso per-reparto)
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

// Cache navigazione (stale-while-revalidate): al ritorno mostra subito l'ultimo dato noto.
const ORDINI_CACHE_KEY = 'food:ordini'
type OrdiniCache = { ordini: Ordine[]; tavoli: TavoloDb[]; appuntamenti: AppuntamentoOrdine[]; blockAsporto: boolean; blockDelivery: boolean }

export default function OrdiniPage() {
  const [ordini, setOrdini] = useState<Ordine[]>([])
  const [tavoli, setTavoli] = useState<TavoloDb[]>([])
  const [appuntamenti, setAppuntamenti] = useState<AppuntamentoOrdine[]>([])
  const [loading, setLoading] = useState(true)
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null)
  const [vista, setVista] = useState<'attuali' | 'passati'>('attuali')
  const [filtroStorico, setFiltroStorico] = useState<'tavolo' | 'asporto' | 'delivery'>('tavolo')
  // Instradamento per reparto: 'tutti' = tutto insieme, oppure un reparto specifico (Cucina/Bar/…).
  const [reparti, setReparti] = useState<string[]>(DEFAULT_REPARTI)
  // La scelta del reparto è PER-DISPOSITIVO (localStorage), non sincronizzata: così in sala tengono
  // "Bar" e in cucina "Cucina", e resta impostata anche cambiando pagina e tornando.
  const [repartoAttivo, setRepartoAttivo] = useState<string>('tutti')
  function cambiaReparto(r: string) {
    setRepartoAttivo(r)
    try { localStorage.setItem('food:ordini-reparto', r) } catch {}
  }
  const [blockAsporto, setBlockAsporto] = useState(false)
  const [blockDelivery, setBlockDelivery] = useState(false)
  const [savingBlocco, setSavingBlocco] = useState(false)
  // Acknowledgment del pulse "nuovo ordine" PER REPARTO (segnaVisto / nuovoDaNotare): definiti più
  // sotto, dove sono noti i reparti (repartoDiRiga, repartoAttivo). Se la cucina nota l'ordine, il
  // pulse resta acceso sulla parte del bar finché non lo nota anche lui.

  async function fetchOrdini() {
    const res = await fetch('/api/ordini?oggi=1&futuri=1', { credentials: 'include' })
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
    // Ripristina la scelta salvata su QUESTO dispositivo (se ancora valida rispetto ai reparti attuali).
    let salvato: string | null = null
    try { salvato = localStorage.getItem('food:ordini-reparto') } catch {}
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).then(s => {
      const list = parseReparti(s.reparti)
      setReparti(list)
      if (salvato && (salvato === 'tutti' || list.includes(salvato))) setRepartoAttivo(salvato)
    }).catch(() => { if (salvato) setRepartoAttivo(salvato) })
  }, [])

  useEffect(() => {
    // Idrata subito dall'ultimo dato in cache (se c'è): niente "Caricamento…" al ritorno.
    const cached = getCache<OrdiniCache>(ORDINI_CACHE_KEY)
    if (cached) {
      setOrdini(cached.ordini)
      setTavoli(cached.tavoli)
      setAppuntamenti(cached.appuntamenti)
      setBlockAsporto(cached.blockAsporto)
      setBlockDelivery(cached.blockDelivery)
      setLoading(false)
    }
    Promise.all([fetchOrdini(), fetchTavoli(), fetchAppuntamenti(), fetchBlocchi()]).finally(() => setLoading(false))
    const interval = setInterval(() => { fetchOrdini(); fetchAppuntamenti() }, 15000)
    return () => clearInterval(interval)
  }, [])

  // Write-through: tiene la cache allineata all'ultimo stato mostrato (incluse le modifiche ottimistiche).
  useEffect(() => {
    if (loading) return
    setCache<OrdiniCache>(ORDINI_CACHE_KEY, { ordini, tavoli, appuntamenti, blockAsporto, blockDelivery })
  }, [loading, ordini, tavoli, appuntamenti, blockAsporto, blockDelivery])

  // La cucina segna l'ordine come "pronto".
  // - delivery: diventa 'pronto', poi il fattorino lo segnerà 'consegnato' (auto-chiusura conto).
  // - asporto: diventa 'pronto' e il conto NON viene chiuso: lo chiude il cameriere con "Chiudi conto".
  // - tavolo: va 'consegnato' (servito in sala; il conto del tavolo si gestisce dai Conti).
  function avanzaOrdine(o: Ordine) {
    const isTavolo = o.tipo === 'tavolo' || o.tavoloId != null || o.gruppoId != null
    const nuovoStatus = isTavolo ? 'consegnato' : 'pronto'
    // Update ottimistico: la card si sposta subito. API in background, niente refetch (il polling riconcilia).
    setOrdini(prev => prev.map(x => x.id === o.id ? { ...x, status: nuovoStatus } : x))
    fetch(`/api/ordini/${o.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nuovoStatus }),
    })
  }

  // Coursing: segna pronta (o annulla) una singola mandata di un ordine.
  // Se dopo l'update tutte le righe sono pronte, l'ordine si conclude (esce dagli attivi).
  function marcaMandata(o: Ordine, mandata: number, annulla: boolean) {
    const now = new Date().toISOString()
    setOrdini(prev => prev.map(x => {
      if (x.id !== o.id) return x
      const righe = x.righe.map(r => r.mandata === mandata ? { ...r, prontaAt: annulla ? null : now } : r)
      const tuttePronte = righe.length > 0 && righe.every(r => r.prontaAt != null)
      const status = tuttePronte ? 'consegnato' : (annulla && x.status === 'consegnato' ? 'aperto' : x.status)
      return { ...x, righe, status }
    }))
    fetch(`/api/ordini/${o.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mandataPronta: mandata, annulla }),
    })
  }

  // Instradamento per reparto: segna pronte (o annulla) un insieme di righe (quelle visibili nella
  // vista reparto attiva). Quando tutte le righe dell'ordine sono pronte, l'ordine si conclude.
  function marcaRighe(o: Ordine, rigaIds: string[], annulla: boolean) {
    const now = new Date().toISOString()
    const idset = new Set(rigaIds)
    setOrdini(prev => prev.map(x => {
      if (x.id !== o.id) return x
      const righe = x.righe.map(r => idset.has(r.id) ? { ...r, prontaAt: annulla ? null : now } : r)
      const tuttePronte = righe.length > 0 && righe.every(r => r.prontaAt != null)
      const isTav = x.tipo === 'tavolo' || x.tavoloId != null || x.gruppoId != null
      const status = tuttePronte ? (isTav ? 'consegnato' : 'pronto')
        : (annulla && (x.status === 'consegnato' || x.status === 'pronto') ? 'aperto' : x.status)
      return { ...x, righe, status }
    }))
    fetch(`/api/ordini/${o.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ righePronte: rigaIds, annulla }),
    })
  }


  function cancellaOrdine(id: string) {
    setOrdini(prev => prev.filter(o => o.id !== id)) // ottimistico
    setConfermaElimina(null)
    fetch(`/api/ordini/${id}`, { method: 'DELETE', credentials: 'include' })
  }

  function segnaAppCompletato(id: string) {
    setAppuntamenti(prev => prev.map(a => a.id === id ? { ...a, status: 'completato' } : a)) // ottimistico
    fetch(`/api/appuntamenti/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completato' }),
    })
  }

  function eliminaAppuntamento(id: string) {
    setAppuntamenti(prev => prev.filter(a => a.id !== id)) // ottimistico
    fetch(`/api/appuntamenti/${id}`, { method: 'DELETE', credentials: 'include' })
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

  // Un ordine asporto/delivery per una data futura NON entra nella board Ordini: resta nella
  // pagina Asporto & Delivery finché non arriva la sua serata. I tavoli sono sempre "oggi".
  const serataDiOrdine = (o: Ordine): string | null => {
    if (o.tipo === 'tavolo' || o.tavoloId != null || o.gruppoId != null) return serataOggi()
    let ci: { data?: string; ora?: string } = {}
    try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
    return ci.data ? serataOrdine(ci.data, ci.ora) : serataKey(new Date(o.createdAt))
  }
  const oggi = serataOggi()
  // Solo gli ordini della serata corrente arrivano in board (i futuri sono altrove, i passati già gestiti/scaduti).
  const ordiniBoard = ordini.filter(o => serataDiOrdine(o) === oggi)

  // Instradamento per reparto. Le righe senza reparto (ordini vecchi) ricadono nel reparto principale,
  // così gli ordini passati restano coerenti. Il filtro vale sia per "Attuali" sia per "Passati".
  const repartoPrincipale = reparti[0] ?? 'Cucina'
  const repartoDiRiga = (r: RigaOrdine) => r.reparto || repartoPrincipale
  const filtroReparto = repartoAttivo !== 'tutti'
  const ordineNelReparto = (o: Ordine) => !filtroReparto || o.righe.some(r => repartoDiRiga(r) === repartoAttivo)
  // Totale mostrato secondo la vista: in "Tutti" è il totale dell'ordine; in vista reparto è solo
  // la somma delle voci di quel reparto (es. al Bar solo le bevande di quell'ordine). Usato sia dalle
  // celle dei singoli ordini sia dai totali di intestazione delle righe (tavolo/asporto/delivery).
  const totaleVista = (o: Ordine): number => filtroReparto
    ? o.righe.filter(r => repartoDiRiga(r) === repartoAttivo).reduce((s, r) => s + r.prezzo * r.quantita, 0)
    : o.totale

  // ── Pulse "nuovo ordine" per reparto ────────────────────────────────────────
  // Un ordine appena arrivato (status 'nuovo' o 'aperto') pulsa in rosso finché non lo si nota.
  // L'acknowledgment è PER REPARTO e sul server (campo notatoReparti, JSON): se la cucina nota
  // l'ordine, il pulse si spegne solo per la cucina; la parte del bar continua a pulsare finché
  // non lo nota anche il bar. In vista "Tutti" il pulse resta finché TUTTI i reparti coinvolti
  // hanno notato; cliccando in "Tutti" si notano tutti insieme.
  const isNuovoStatus = (o: Ordine) => o.status === 'nuovo' || o.status === 'aperto'
  const repartiNotati = (o: Ordine): Set<string> => {
    try { const a = JSON.parse(o.notatoReparti ?? '[]'); return new Set(Array.isArray(a) ? a.map(String) : []) } catch { return new Set() }
  }
  const repartiCoinvolti = (o: Ordine): string[] => [...new Set(o.righe.map(repartoDiRiga))]
  // Reparti che, nella vista corrente, devono ancora notare l'ordine (in vista reparto: solo quello attivo).
  const repartiDaNotare = (o: Ordine): string[] => {
    if (!isNuovoStatus(o)) return []
    const notati = repartiNotati(o)
    // Retrocompatibilità: ordini già notati con il vecchio booleano (notatoReparti ancora vuoto)
    // valgono come notati da tutti → non ripulsano dopo il deploy.
    if (notati.size === 0 && o.notatoNuovo) return []
    const rilevanti = filtroReparto ? [repartoAttivo] : repartiCoinvolti(o)
    return rilevanti.filter(r => !notati.has(r))
  }
  const isNuovoDaNotare = (o: Ordine) => repartiDaNotare(o).length > 0
  // Nota l'ordine per i reparti rilevanti nella vista corrente (merge additivo lato server).
  function segnaVisto(o: Ordine) {
    const reparti = repartiDaNotare(o)
    if (reparti.length === 0) return
    const merged = [...new Set([...repartiNotati(o), ...reparti])]
    setOrdini(prev => prev.map(x => x.id === o.id ? { ...x, notatoReparti: JSON.stringify(merged), notatoNuovo: true } : x)) // ottimistico
    fetch(`/api/ordini/${o.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notaReparti: reparti }),
    })
  }

  const ordiniAttivi = ordiniBoard.filter(o => !isDoneOrdine(o) && ordineNelReparto(o))
  const ordiniStorico = ordiniBoard.filter(o => isDoneOrdine(o) && ordineNelReparto(o))
  // Le prenotazioni online non hanno voci/reparto: con un reparto specifico attivo non si mostrano.
  const appAttivi = (filtroReparto ? [] : appOggi).filter(a => !isDoneApp(a))
  const appStorico = (filtroReparto ? [] : appOggi).filter(a => isDoneApp(a))

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
  const chiusuraTime = (o: Ordine) => o.closedAt ? +new Date(o.closedAt) : +new Date(o.createdAt)
  const tavoloLabel = (o: Ordine) => {
    const t = tavoli.find(tv => tv.id === o.tavoloId)
    // gruppo → o.tavolo è già "T2+3"; tavolo singolo → etichetta o "Tavolo N"; senza tavolo → "Da assegnare"
    return o.gruppoId ? o.tavolo : t ? (t.etichetta ?? `Tavolo ${t.numero}`) : o.tavoloId ? o.tavolo : 'Da assegnare'
  }

  // ATTIVI: una riga per tavolo, tavolo che aspetta da più tempo in cima.
  function raggruppaPerTavolo(list: Ordine[]) {
    const map = new Map<string, { key: string; label: string; ordini: Ordine[] }>()
    for (const o of list) {
      const key = o.gruppoId ? `g:${o.gruppoId}` : o.tavoloId ? `t:${o.tavoloId}` : 'none'
      if (!map.has(key)) map.set(key, { key, label: tavoloLabel(o), ordini: [] })
      map.get(key)!.ordini.push(o)
    }
    const gruppi = [...map.values()]
    // Ordini dello stesso tavolo: i più RECENTI a sinistra (si notano subito), i vecchi scorrono a destra.
    for (const g of gruppi) g.ordini.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    // Ordine delle righe: per prima occupazione del tavolo (ordine più vecchio), così non saltano quando arriva un nuovo ordine.
    const primaOccupazione = (g: { ordini: Ordine[] }) => Math.min(...g.ordini.map(o => +new Date(o.createdAt)))
    gruppi.sort((a, b) => primaOccupazione(a) - primaOccupazione(b))
    return gruppi
  }

  // CONCLUSI: ogni "sessione" del tavolo è una riga a sé. Un nuovo ordine creato DOPO la
  // chiusura del conto (status 'chiuso') apre una nuova sessione → se il tavolo viene chiuso
  // e poi rioccupato i nuovi ordini finiscono su una riga separata. Righe chiuse più di
  // recente in cima, più vecchie in basso.
  function raggruppaStoricoPerTavolo(list: Ordine[]) {
    const perTavolo = new Map<string, Ordine[]>()
    for (const o of list) {
      const key = o.gruppoId ? `g:${o.gruppoId}` : o.tavoloId ? `t:${o.tavoloId}` : 'none'
      if (!perTavolo.has(key)) perTavolo.set(key, [])
      perTavolo.get(key)!.push(o)
    }
    const righe: { key: string; label: string; ordini: Ordine[]; fine: number }[] = []
    for (const [key, ords] of perTavolo) {
      const label = tavoloLabel(ords[0])
      const sorted = [...ords].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
      let sessione: Ordine[] = []
      let chiusuraConto = 0 // closedAt dell'ultimo ordine 'chiuso' (fine conto) della sessione
      const chiudi = () => {
        if (!sessione.length) return
        righe.push({ key: `${key}-${righe.length}`, label, ordini: sessione, fine: Math.max(...sessione.map(chiusuraTime)) })
      }
      for (const o of sorted) {
        if (sessione.length && chiusuraConto && +new Date(o.createdAt) > chiusuraConto) {
          chiudi(); sessione = []; chiusuraConto = 0
        }
        sessione.push(o)
        if (o.status === 'chiuso' && o.closedAt) chiusuraConto = Math.max(chiusuraConto, +new Date(o.closedAt))
      }
      chiudi()
    }
    righe.sort((a, b) => b.fine - a.fine)
    return righe
  }

  const ordiniAttiviTavolo = ordiniAttivi.filter(isTavoloOrdine)
  const gruppiTavoloAttivi = raggruppaPerTavolo(ordiniAttiviTavolo)
  const gruppiTavoloStorico = raggruppaStoricoPerTavolo(ordiniStoricoFiltrati)
  // asporto/delivery conclusi: i più recenti (chiusi per ultimi) per primi
  const ordiniStoricoFiltratiSorted = [...ordiniStoricoFiltrati].sort((a, b) => chiusuraTime(b) - chiusuraTime(a))
  const appStoricoFiltratiSorted = [...appStoricoFiltrati].sort((a, b) => +new Date(b.data) - +new Date(a.data))

  // Asporto e delivery: ogni tipo è una riga con dentro sia gli ordini (Ordine) sia le
  // prenotazioni online (AppuntamentoOrdine), ordinati per ORARIO DI CONSEGNA/RITIRO (non
  // di arrivo): a sinistra chi va servito prima, a destra chi va servito dopo.
  const oraServizioOrdine = (o: Ordine): number => {
    let ci: { data?: string; ora?: string } = {}
    try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
    if (ci.ora) {
      const giorno = ci.data ?? new Date(o.createdAt).toISOString().slice(0, 10)
      const t = new Date(`${giorno}T${ci.ora}:00`).getTime()
      if (!Number.isNaN(t)) return t
    }
    return new Date(o.createdAt).getTime() // fallback: orario di arrivo se manca l'ora
  }
  const oraServizioApp = (a: AppuntamentoOrdine): number => new Date(a.data).getTime()

  type ServeItem = { key: string; time: number; ord?: Ordine; app?: AppuntamentoOrdine }
  const mergeServe = (ords: Ordine[], apps: AppuntamentoOrdine[]): ServeItem[] => [
    ...ords.map(o => ({ key: o.id, time: oraServizioOrdine(o), ord: o })),
    ...apps.map(a => ({ key: a.id, time: oraServizioApp(a), app: a })),
  ].sort((x, y) => x.time - y.time)

  const asportoAttivi = mergeServe(
    ordiniAttivi.filter(o => !isTavoloOrdine(o) && o.tipo !== 'delivery'),
    appAttivi.filter(a => inferTipoOrdine(a.servizio) !== 'delivery'),
  )
  const deliveryAttivi = mergeServe(
    ordiniAttivi.filter(o => !isTavoloOrdine(o) && o.tipo === 'delivery'),
    appAttivi.filter(a => inferTipoOrdine(a.servizio) === 'delivery'),
  )
  const nAsportoAttivi = asportoAttivi.length
  const nDeliveryAttivi = deliveryAttivi.length
  const totAsportoAttivi = asportoAttivi.reduce((s, i) => s + (i.ord ? totaleVista(i.ord) : 0), 0)
  const totDeliveryAttivi = deliveryAttivi.reduce((s, i) => s + (i.ord ? totaleVista(i.ord) : 0), 0)

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
    const nuovo = isNuovoDaNotare(o)

    // Con un reparto attivo mostro SOLO le sue voci (instradamento: la cucina vede i piatti, il bar le bevande).
    const righeVisibili = filtroReparto ? o.righe.filter(r => repartoDiRiga(r) === repartoAttivo) : o.righe
    // Nella vista reparto: il reparto è "pronto" quando tutte le sue voci visibili sono segnate pronte.
    const repartoPronto = filtroReparto && righeVisibili.length > 0 && righeVisibili.every(r => r.prontaAt != null)
    // In vista reparto il totale mostrato è solo quello delle voci di quel reparto
    // (es. al Bar solo le bevande di questo ordine), non il totale dell'intero ordine.
    const totaleMostrato = totaleVista(o)

    // Coursing: la vista a mandate si usa se ci sono più mandate OPPURE se l'unica mandata non è la 1ª
    // (così anche un singolo piatto messo in 2ª/3ª mostra la sua mandata).
    const mandate = [...new Set(righeVisibili.map(r => r.mandata ?? 1))].sort((a, b) => a - b)
    const isMulti = mandate.length > 1 || (mandate[0] ?? 1) > 1

    // Riga singola (riusata da vista normale e per-mandata)
    const RigaVoce = ({ r, spenta }: { r: RigaOrdine; spenta?: boolean }) => (
      <div className={`flex items-start gap-1.5 px-3 py-1.5 ${spenta ? 'opacity-40' : ''}`}>
        <span className="text-sm font-extrabold text-ink-navy shrink-0">{r.quantita}×</span>
        <div className="min-w-0">
          <span className={`text-sm font-bold text-ink-navy break-words ${spenta ? 'line-through' : ''}`}>{r.nome}</span>
          {r.note && <span className="ml-1.5 text-[11px] font-semibold text-red-600 break-words">— {r.note}</span>}
        </div>
      </div>
    )

    return (
      <div
        onClick={nuovo ? () => segnaVisto(o) : undefined}
        className={`shrink-0 w-56 rounded-lg border flex flex-col overflow-hidden ${nuovo ? 'ring-2 ring-red-400 cursor-pointer' : ''} ${nonConsegnato ? 'border-red-300 bg-red-50/40' : `${cell.border} ${cell.bg}`} ${isDone ? 'opacity-60' : ''}`}>
        {nuovo && (
          <p className="px-3 py-1 bg-red-500 text-white text-[10px] font-bold uppercase tracking-wide text-center animate-pulse">
            ● Nuovo ordine
          </p>
        )}
        {nonConsegnato && (
          <p className="px-3 py-1 bg-red-500 text-white text-[10px] font-bold uppercase tracking-wide text-center">
            {tipoKey === 'delivery' ? 'Non consegnato' : 'Non ritirato'}
          </p>
        )}
        <div className="px-3 py-2 border-b border-black/5 bg-white/50">
          <div className="flex items-center justify-between gap-2">
            {isTavolo
              ? <span className="text-xs font-semibold text-ink-navy/50 truncate">{oraArrivo} · €{totaleMostrato.toFixed(2)}</span>
              : <span className="text-sm font-bold text-ink-navy truncate">{nome}</span>}
            {/* Multi-mandata attivo: niente "Pronto" globale, comandano i tasti per mandata.
                Concluso: AzioneOrdine mostra "Elimina". i tasti azione non contano come "notato" (stopPropagation). */}
            {(!isMulti || isDone) && !filtroReparto && (
              <span onClick={e => e.stopPropagation()} className="shrink-0"><AzioneOrdine o={o} /></span>
            )}
            {/* Vista reparto: "Pronto" che segna pronte SOLO le voci di questo reparto. */}
            {filtroReparto && !isDone && (
              <button onClick={e => { e.stopPropagation(); marcaRighe(o, righeVisibili.map(r => r.id), repartoPronto) }}
                className={`text-xs font-bold rounded-lg transition-colors shrink-0 ${repartoPronto
                  ? 'text-green-600 hover:text-green-700 px-1.5 py-1'
                  : 'px-2.5 py-1 bg-ink-navy text-white hover:bg-ink-navy/80'}`}>
                {repartoPronto ? '✓ Pronto' : 'Pronto'}
              </button>
            )}
          </div>
          {!isTavolo && (
            <>
              {ci.ora && (
                <p className="mt-0.5 text-sm font-bold text-ink-navy">
                  {tipoKey === 'delivery' ? 'Consegna' : 'Ritiro'} alle {ci.ora}
                </p>
              )}
              {/* telefono e indirizzo NON qui: si vedono nella pagina Asporto/Delivery */}
              <p className="text-xs text-ink-navy/45">€{totaleMostrato.toFixed(2)}</p>
            </>
          )}
        </div>
        {filtroReparto ? (
          /* Vista reparto: lista piatta delle sole voci del reparto; le pronte barrate. */
          <div className="divide-y divide-ink-navy/6 flex-1">
            {righeVisibili.map(r => <RigaVoce key={r.id} r={r} spenta={r.prontaAt != null} />)}
            {righeVisibili.length === 0 && <p className="px-3 py-2 text-xs text-ink-navy/30">Nessuna voce</p>}
          </div>
        ) : isMulti ? (
          /* Coursing: una sezione impilata per ogni mandata (1ª sopra, poi 2ª, poi 3ª) */
          <div className="flex-1">
            {mandate.map(m => {
              const righeM = righeVisibili.filter(r => (r.mandata ?? 1) === m)
              const prontaM = righeM.every(r => r.prontaAt != null)
              return (
                <div key={m} className="border-b border-ink-navy/8 last:border-0">
                  <div className={`flex items-center justify-between gap-2 px-3 py-1 ${prontaM ? 'bg-green-50' : 'bg-ink-navy/[0.04]'}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${prontaM ? 'text-green-600' : 'text-ink-navy/55'}`}>
                      {MANDATA_LABEL[m] ?? `${m}ª`} mandata
                    </span>
                    {!isDone && !filtroReparto && (
                      <button
                        onClick={e => { e.stopPropagation(); marcaMandata(o, m, prontaM) }}
                        className={`text-[11px] font-bold rounded-lg transition-colors shrink-0 ${prontaM
                          ? 'text-green-600 hover:text-green-700 px-1.5 py-0.5'
                          : 'px-2 py-0.5 bg-ink-navy text-white hover:bg-ink-navy/80'}`}>
                        {prontaM ? '✓ Pronta' : 'Pronta'}
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-ink-navy/6">
                    {/* Ogni voce si barra in base alla SUA prontaAt: così una voce già
                        segnata pronta in un reparto (es. Bar) risulta pronta anche qui
                        in "Tutti", anche se il resto della mandata non lo è ancora. */}
                    {righeM.map(r => <RigaVoce key={r.id} r={r} spenta={r.prontaAt != null} />)}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="divide-y divide-ink-navy/6 flex-1">
            {righeVisibili.map(r => <RigaVoce key={r.id} r={r} spenta={r.prontaAt != null} />)}
            {righeVisibili.length === 0 && <p className="px-3 py-2 text-xs text-ink-navy/30">Nessuna voce</p>}
          </div>
        )}
        {o.note && <p className="px-3 py-1.5 text-xs font-bold text-red-600 break-words border-t border-red-200 bg-red-50/60">{o.note}</p>}
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

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-3"><SkeletonCards count={5} /></div>
    </div>
  )

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

      {/* Filtro reparto (instradamento): mostra solo le voci del reparto scelto. Solo se ci sono più reparti. */}
      {reparti.length > 1 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-mist rounded-xl p-1">
            {(['tutti', ...reparti]).map(r => (
              <button key={r} onClick={() => cambiaReparto(r)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${repartoAttivo === r ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                {r === 'tutti' ? 'Tutti' : r}
              </button>
            ))}
          </div>
          {filtroReparto && (
            <span className="text-xs text-ink-navy/45">Vista <b className="text-ink-navy/70">{repartoAttivo}</b>: solo le sue voci · “Pronto” segna pronte solo queste; l'ordine si chiude quando tutti i reparti sono pronti.</span>
          )}
        </div>
      )}

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
                totale={g.ordini.reduce((s, o) => s + totaleVista(o), 0)}>
                {g.ordini.map(o => <OrderCell key={o.id} o={o} />)}
              </OrdiniRow>
            ))}
            {/* Asporto: ordini + prenotazioni online, ordinati per orario di ritiro (prima a sinistra) */}
            {nAsportoAttivi > 0 && (
              <OrdiniRow label="Asporto" tipoKey="asporto" count={nAsportoAttivi} totale={totAsportoAttivi}>
                {asportoAttivi.map(i => i.ord ? <OrderCell key={i.key} o={i.ord} /> : <AppCell key={i.key} a={i.app!} />)}
              </OrdiniRow>
            )}
            {/* Delivery: ordini + prenotazioni online, ordinati per orario di consegna (prima a sinistra) */}
            {nDeliveryAttivi > 0 && (
              <OrdiniRow label="Delivery" tipoKey="delivery" count={nDeliveryAttivi} totale={totDeliveryAttivi}>
                {deliveryAttivi.map(i => i.ord ? <OrderCell key={i.key} o={i.ord} /> : <AppCell key={i.key} a={i.app!} />)}
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
                    totale={g.ordini.reduce((s, o) => s + totaleVista(o), 0)}>
                    {g.ordini.map(o => <OrderCell key={o.id} o={o} />)}
                  </OrdiniRow>
                ))}
              </div>
            ) : (
              <OrdiniRow label={filtroStorico === 'delivery' ? 'Delivery' : 'Asporto'} tipoKey={filtroStorico}
                count={ordiniStoricoFiltrati.length + appStoricoFiltrati.length}
                totale={ordiniStoricoFiltrati.reduce((s, o) => s + totaleVista(o), 0)}>
                {ordiniStoricoFiltratiSorted.map(o => <OrderCell key={o.id} o={o} />)}
                {appStoricoFiltratiSorted.map(a => <AppCell key={a.id} a={a} />)}
              </OrdiniRow>
            )}
          </div>
        )
      )}
    </div>
  )
}

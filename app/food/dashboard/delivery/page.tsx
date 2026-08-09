'use client'
import { useEffect, useState, useCallback } from 'react'
import { serataOggi, serataOrdine, serataKey } from '@/lib/serata'
import OrarioSelect from '@/app/components/OrarioSelect'
import { getCache, setCache } from '@/lib/pageCache'
import { Skeleton, SkeletonCards } from '@/app/components/Skeleton'

const DELIVERY_CACHE_KEY = 'food:delivery' // cache navigazione (stale-while-revalidate)

function formatDataLunga(s: string) {
  const d = new Date(`${s}T12:00:00`)
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' })
}

interface RigaOrdine { id: string; nome: string; prezzo: number; quantita: number; note?: string }
interface Ordine {
  id: string
  tavolo: string
  tipo: string
  clienteInfo: string | null
  status: string
  totale: number
  note: string | null
  createdAt: string
  righe: RigaOrdine[]
}

type Stato = 'in_preparazione' | 'pronto' | 'consegnato'
type Tipo = 'delivery' | 'asporto'

function statoOrdine(o: Ordine): Stato {
  // 'non_consegnato' finisce comunque tra i conclusi (storico serata) ma con banner.
  if (o.status === 'consegnato' || o.status === 'chiuso' || o.status === 'non_consegnato') return 'consegnato'
  if (o.status === 'pronto') return 'pronto'
  return 'in_preparazione'
}

// Etichette e colori dipendono dal tipo selezionato (delivery = consegna/teal, asporto = ritiro/violet).
function testi(tipo: Tipo) {
  const isDelivery = tipo === 'delivery'
  return {
    isDelivery,
    badge: isDelivery ? 'Delivery' : 'Asporto',
    quando: isDelivery ? 'Consegna' : 'Ritiro',
    sezioni: [
      { key: 'in_preparazione' as Stato, label: 'In preparazione' },
      { key: 'pronto' as Stato, label: isDelivery ? 'Pronto — da consegnare' : 'Pronto — da ritirare' },
      { key: 'consegnato' as Stato, label: isDelivery ? 'Consegnati' : 'Ritirati' },
    ],
    segna: isDelivery ? 'Segna consegnato' : 'Segna ritirato',
    non: isDelivery ? 'Non consegnato' : 'Non ritirato',
    theme: isDelivery
      ? { border: 'border-teal-300', headBg: 'bg-teal-50', text: 'text-teal-800', textSoft: 'text-teal-800/60', badge: 'bg-teal-200/60 text-teal-700', btn: 'bg-teal-600 hover:bg-teal-700', dot: 'bg-teal-600' }
      : { border: 'border-violet-300', headBg: 'bg-violet-50', text: 'text-violet-800', textSoft: 'text-violet-800/60', badge: 'bg-violet-200/60 text-violet-700', btn: 'bg-violet-600 hover:bg-violet-700', dot: 'bg-violet-600' },
  }
}

export default function AsportoDeliveryPage() {
  const [ordini, setOrdini] = useState<Ordine[]>([])
  const [tipoSel, setTipoSel] = useState<Tipo>('delivery')
  const [loading, setLoading] = useState(true)
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null)
  const [showNuovo, setShowNuovo] = useState(false)

  const fetchOrdini = useCallback(async () => {
    // futuri=1 → include anche gli ordini prenotati per giorni successivi
    const res = await fetch('/api/ordini?oggi=1&futuri=1', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setOrdini((data.ordini ?? []).filter((o: Ordine) => o.tipo === 'delivery' || o.tipo === 'asporto'))
  }, [])

  useEffect(() => {
    // Idrata subito dall'ultimo dato in cache (se c'è): niente "Caricamento…" al ritorno.
    const cached = getCache<Ordine[]>(DELIVERY_CACHE_KEY)
    if (cached) { setOrdini(cached); setLoading(false) }
    fetchOrdini().finally(() => setLoading(false)) // revalidate in background
    const iv = setInterval(fetchOrdini, 15000)
    return () => clearInterval(iv)
  }, [fetchOrdini])

  // Write-through: mantiene la cache allineata all'ultimo stato mostrato.
  useEffect(() => {
    if (!loading) setCache<Ordine[]>(DELIVERY_CACHE_KEY, ordini)
  }, [loading, ordini])

  function setStato(id: string, status: string) {
    setOrdini(prev => prev.map(o => o.id === id ? { ...o, status } : o)) // ottimistico
    fetch(`/api/ordini/${id}`, { // background, niente refetch (il polling a 15s riconcilia)
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  function elimina(id: string) {
    setOrdini(prev => prev.filter(o => o.id !== id)) // ottimistico
    setConfermaElimina(null)
    fetch(`/api/ordini/${id}`, { method: 'DELETE', credentials: 'include' })
  }

  const t = testi(tipoSel)

  function Card({ o, futuro }: { o: Ordine; futuro?: boolean }) {
    const stato = statoOrdine(o)
    const isDone = stato === 'consegnato'
    const nonConsegnato = o.status === 'non_consegnato'
    let ci: { nome?: string; telefono?: string; indirizzo?: string; ora?: string; data?: string } = {}
    try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
    const label = ci.nome || 'Ordine online'
    const oraArrivo = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

    return (
      <div className={`bg-white border rounded-xl overflow-hidden shadow-sm ${futuro ? 'border-amber-300' : nonConsegnato ? 'border-red-300' : isDone ? 'border-ink-navy/10' : t.theme.border}`}>
        {futuro && ci.data && (
          <div className="px-4 py-2 bg-amber-100 text-amber-800 text-center">
            <p className="text-xs font-bold">📅 Prenotato per {formatDataLunga(ci.data)} — non è di oggi</p>
          </div>
        )}
        {nonConsegnato && (
          <div className="px-4 py-2 bg-red-500 text-white text-center">
            <p className="text-xs font-bold uppercase tracking-wide">{t.non}</p>
          </div>
        )}
        {/* Header */}
        <div className={`px-4 py-3 border-b ${isDone ? 'bg-mist border-ink-navy/10' : `${t.theme.headBg} ${t.theme.border}`}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className={`block text-sm font-bold truncate ${isDone ? 'text-ink-navy/50' : t.theme.text}`}>{label}</span>
              {ci.ora && (
                <p className={`mt-0.5 text-sm font-bold ${isDone ? 'text-ink-navy/40' : 'text-ink-navy'}`}>
                  {t.quando} alle {ci.ora}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.theme.badge}`}>{t.badge}</span>
              <span className={`text-xs ${isDone ? 'text-ink-navy/35' : t.theme.textSoft}`}>ordine {oraArrivo}</span>
            </div>
          </div>
        </div>

        {/* Info cliente: indirizzo (solo delivery) + telefono — qui SÌ, in Ordini no */}
        {(ci.indirizzo || ci.telefono) && (
          <div className="px-4 py-2.5 bg-white border-b border-ink-navy/6 space-y-0.5">
            {ci.indirizzo && <p className="text-sm font-semibold text-ink-navy">{ci.indirizzo}</p>}
            {ci.telefono && <p className="text-xs text-ink-navy/50">{ci.telefono}</p>}
          </div>
        )}

        {/* Righe */}
        <div className={`divide-y divide-ink-navy/6 ${isDone ? 'opacity-60' : ''}`}>
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
          {o.note && <p className="px-4 py-2 text-xs text-ink-navy/35 italic">{o.note}</p>}
        </div>

        {/* Azioni */}
        <div className="px-4 py-3 border-t border-ink-navy/8 flex items-center justify-between gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${isDone ? 'text-ink-navy/40' : 'text-ink-navy/70'}`}>€{o.totale.toFixed(2)}</span>
          <div className="flex items-center gap-2">
            {futuro && (
              <>
                <span className="text-xs font-semibold text-amber-700">In arrivo</span>
                {confermaElimina === o.id ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setConfermaElimina(null)} className="text-xs px-2 py-1 rounded-lg border border-ink-navy/15 text-ink-navy/50">No</button>
                    <button onClick={() => elimina(o.id)} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-semibold">Sì</button>
                  </div>
                ) : (
                  <button onClick={() => setConfermaElimina(o.id)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors">
                    Elimina
                  </button>
                )}
              </>
            )}
            {!futuro && stato === 'in_preparazione' && (
              <span className="text-xs text-ink-navy/35">In cucina</span>
            )}
            {stato === 'pronto' && (
              <>
                <button onClick={() => setStato(o.id, 'non_consegnato')}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                  {t.non}
                </button>
                <button onClick={() => setStato(o.id, 'consegnato')}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors ${t.theme.btn}`}>
                  {t.segna}
                </button>
              </>
            )}
            {isDone && (
              confermaElimina === o.id ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setConfermaElimina(null)} className="text-xs px-2 py-1 rounded-lg border border-ink-navy/15 text-ink-navy/50">No</button>
                  <button onClick={() => elimina(o.id)} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-semibold">Sì</button>
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
      </div>
    )
  }

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start"><SkeletonCards count={6} /></div>
    </div>
  )

  // Serata di riferimento dell'ordine (data prenotata, o serata di creazione se assente).
  const serataDi = (o: Ordine): string | null => {
    let ci: { data?: string; ora?: string } = {}
    try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
    return ci.data ? serataOrdine(ci.data, ci.ora) : serataKey(new Date(o.createdAt))
  }
  const oggiKey = serataOggi()
  const isFuturo = (o: Ordine) => { const s = serataDi(o); return !!s && s > oggiKey }
  const isOggi = (o: Ordine) => { const s = serataDi(o); return !s || s === oggiKey } // i passati (scaduti) restano esclusi

  // Orario di consegna/ritiro come numero, per ordinare le colonne (prima in alto).
  const oraServizio = (o: Ordine): number => {
    let ci: { data?: string; ora?: string } = {}
    try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
    if (ci.ora) {
      const giorno = ci.data ?? new Date(o.createdAt).toISOString().slice(0, 10)
      const t = new Date(`${giorno}T${ci.ora}:00`).getTime()
      if (!Number.isNaN(t)) return t
    }
    return new Date(o.createdAt).getTime()
  }

  const attivi = (tipo: Tipo) => ordini.filter(o => o.tipo === tipo && isOggi(o) && statoOrdine(o) !== 'consegnato').length
  // Colonne ordinate per orario di consegna/ritiro: chi va servito prima sta in alto.
  const perStato = (s: Stato) => ordini
    .filter(o => o.tipo === tipoSel && isOggi(o) && statoOrdine(o) === s)
    .sort((a, b) => oraServizio(a) - oraServizio(b))
  const futuri = ordini
    .filter(o => o.tipo === tipoSel && isFuturo(o))
    .sort((a, b) => oraServizio(a) - oraServizio(b))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-ink-navy">Asporto &amp; Delivery</h1>
          <div className="flex gap-1 bg-mist rounded-xl p-1">
            {([
              { key: 'delivery' as Tipo, label: 'Delivery' },
              { key: 'asporto' as Tipo, label: 'Asporto' },
            ]).map(({ key, label }) => {
              const n = attivi(key)
              return (
                <button key={key} onClick={() => setTipoSel(key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${tipoSel === key ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                  {label}
                  {n > 0 && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${tipoSel === key ? 'bg-electric-blue text-white' : 'bg-ink-navy/10 text-ink-navy/50'}`}>{n}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNuovo(true)}
            className="text-sm text-white font-semibold bg-electric-blue px-4 py-1.5 rounded-lg hover:bg-electric-blue/90 transition-colors">
            + Nuovo ordine
          </button>
          <button onClick={fetchOrdini}
            className="text-sm text-electric-blue hover:text-ink-navy font-medium border border-electric-blue/25 px-3 py-1.5 rounded-lg hover:bg-electric-blue/10 transition-colors">
            ↻ Aggiorna
          </button>
        </div>
      </div>

      {/* Tre colonne sempre visibili: preparazione · pronti · conclusi (restano per tutta la giornata) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {t.sezioni.map(sez => {
          const lista = perStato(sez.key)
          return (
            <div key={sez.key} className="bg-mist/40 rounded-2xl border border-ink-navy/8 p-3">
              <h2 className="text-sm font-semibold text-ink-navy/60 uppercase tracking-wider flex items-center gap-2 mb-3 px-1">
                {sez.label}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${sez.key === 'pronto' ? `${t.theme.dot} text-white` : 'bg-white text-ink-navy/50 border border-ink-navy/10'}`}>{lista.length}</span>
              </h2>
              <div className="space-y-3">
                {lista.length === 0
                  ? <p className="text-xs text-ink-navy/30 text-center py-8">Nessun ordine</p>
                  : lista.map(o => <Card key={o.id} o={o} />)}
              </div>
            </div>
          )
        })}
      </div>

      {/* In arrivo: ordini prenotati per giorni futuri (non ancora nella board Ordini) */}
      {futuri.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-ink-navy/60 uppercase tracking-wider flex items-center gap-2 mb-3">
            In arrivo · prenotati
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{futuri.length}</span>
          </h2>
          <p className="text-xs text-ink-navy/45 mb-3">
            Questi ordini sono per una data futura: compariranno nella sezione Ordini il giorno indicato.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {futuri.map(o => <Card key={o.id} o={o} futuro />)}
          </div>
        </div>
      )}

      {showNuovo && (
        <NuovoOrdineModal
          tipoIniziale={tipoSel}
          onClose={() => setShowNuovo(false)}
          onCreated={() => { setShowNuovo(false); fetchOrdini() }}
        />
      )}
    </div>
  )
}

// ── Modal "Nuovo ordine" ──────────────────────────────────────────────────
// Il titolare compila un ordine asporto/delivery a mano (es. preso al telefono):
// sceglie il servizio, aggiunge i piatti dal menù digitale (stesso menù 'asporto'
// che vedono i clienti online), mette eventuali note e invia. L'ordine va in cucina.
interface PiattoMenu { id: string; nome: string; prezzo: number; descrizione?: string | null; disponibile?: boolean }
interface CategoriaMenu { id: string; nome: string; piatti: PiattoMenu[] }
interface RigaCarrello { piattoId: string; nome: string; prezzo: number; quantita: number; note: string }

function NuovoOrdineModal({ tipoIniziale, onClose, onCreated }: {
  tipoIniziale: Tipo; onClose: () => void; onCreated: () => void
}) {
  const oggiISO = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const [tipo, setTipo] = useState<Tipo>(tipoIniziale)
  const [categorie, setCategorie] = useState<CategoriaMenu[]>([])
  const [caricandoMenu, setCaricandoMenu] = useState(true)
  const [carrello, setCarrello] = useState<RigaCarrello[]>([])
  const [nome, setNome] = useState('')
  const [telefono, setTelefono] = useState('')
  const [indirizzo, setIndirizzo] = useState('')
  const [data, setData] = useState(oggiISO)
  const [ora, setOra] = useState('')
  const [note, setNote] = useState('')
  const [inviando, setInviando] = useState(false)
  const [errore, setErrore] = useState('')

  useEffect(() => {
    let attivo = true
    ;(async () => {
      try {
        // Menù 'asporto' — lo stesso da cui ordinano i clienti online (asporto e delivery).
        let r = await fetch('/api/menu/categorie?tipo=asporto', { credentials: 'include' })
        let d = await r.json().catch(() => ({}))
        let cats: CategoriaMenu[] = d.categorie ?? []
        // Fallback: se non è stato configurato un menù asporto, uso quello del locale.
        if (cats.length === 0) {
          r = await fetch('/api/menu/categorie?tipo=locale', { credentials: 'include' })
          d = await r.json().catch(() => ({}))
          cats = d.categorie ?? []
        }
        if (attivo) setCategorie(cats)
      } finally {
        if (attivo) setCaricandoMenu(false)
      }
    })()
    return () => { attivo = false }
  }, [])

  function aggiungi(p: PiattoMenu) {
    setCarrello(prev => {
      const e = prev.find(r => r.piattoId === p.id)
      if (e) return prev.map(r => r.piattoId === p.id ? { ...r, quantita: r.quantita + 1 } : r)
      return [...prev, { piattoId: p.id, nome: p.nome, prezzo: p.prezzo, quantita: 1, note: '' }]
    })
  }
  function rimuovi(piattoId: string) {
    setCarrello(prev => {
      const riga = prev.find(r => r.piattoId === piattoId)
      if (!riga) return prev
      if (riga.quantita === 1) return prev.filter(r => r.piattoId !== piattoId)
      return prev.map(r => r.piattoId === piattoId ? { ...r, quantita: r.quantita - 1 } : r)
    })
  }
  function setNota(piattoId: string, nota: string) {
    setCarrello(prev => prev.map(r => r.piattoId === piattoId ? { ...r, note: nota } : r))
  }
  const qty = (id: string) => carrello.find(r => r.piattoId === id)?.quantita ?? 0
  const totale = carrello.reduce((s, r) => s + r.prezzo * r.quantita, 0)
  const totaleArticoli = carrello.reduce((s, r) => s + r.quantita, 0)

  async function invia() {
    if (carrello.length === 0) { setErrore('Aggiungi almeno un piatto.'); return }
    setInviando(true); setErrore('')
    try {
      const res = await fetch('/api/ordini', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, nome, telefono, indirizzo, data, ora, note, righe: carrello }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setErrore(err.error ?? "Errore nell'invio dell'ordine.")
        return
      }
      onCreated()
    } catch {
      setErrore('Errore di connessione. Riprova.')
    } finally {
      setInviando(false)
    }
  }

  const isDelivery = tipo === 'delivery'
  const inp = 'w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-navy/8 shrink-0">
          <h2 className="text-lg font-bold text-ink-navy">Nuovo ordine</h2>
          <button onClick={onClose} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Servizio */}
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'asporto' as Tipo, label: '🛍 Asporto' },
              { key: 'delivery' as Tipo, label: '🛵 Delivery' },
            ]).map(({ key, label }) => (
              <button key={key} onClick={() => setTipo(key)}
                className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${tipo === key ? 'border-electric-blue bg-electric-blue/10 text-electric-blue' : 'border-ink-navy/10 text-ink-navy/50 hover:border-ink-navy/20'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Dati cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-navy/60 mb-1">Nome cliente</label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Mario Rossi" className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-navy/60 mb-1">Telefono</label>
              <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="333…" className={inp} />
            </div>
          </div>
          {isDelivery && (
            <div>
              <label className="block text-xs font-medium text-ink-navy/60 mb-1">Indirizzo di consegna</label>
              <input type="text" value={indirizzo} onChange={e => setIndirizzo(e.target.value)} placeholder="Via, numero, città" className={inp} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-navy/60 mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-navy/60 mb-1">{isDelivery ? 'Ora consegna' : 'Ora ritiro'}</label>
              <OrarioSelect value={ora} onChange={setOra} className={inp} />
            </div>
          </div>

          {/* Menù */}
          <div>
            <p className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wider mb-2">Menù</p>
            {caricandoMenu ? (
              <p className="text-sm text-ink-navy/35 py-4 text-center">Caricamento menù…</p>
            ) : categorie.length === 0 ? (
              <p className="text-sm text-ink-navy/35 py-4 text-center">Nessun piatto nel menù. Aggiungine dalla sezione Menù.</p>
            ) : (
              <div className="space-y-4">
                {categorie.map(cat => (
                  <div key={cat.id}>
                    <h3 className="text-sm font-bold text-ink-navy mb-2">{cat.nome}</h3>
                    <div className="space-y-2">
                      {cat.piatti.filter(p => p.disponibile !== false).map(p => {
                        const q = qty(p.id)
                        return (
                          <div key={p.id} className="border border-ink-navy/8 rounded-xl p-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-ink-navy truncate">{p.nome}</p>
                                <p className="text-xs font-bold text-electric-blue">€{p.prezzo.toFixed(2)}</p>
                              </div>
                              {q === 0 ? (
                                <button onClick={() => aggiungi(p)}
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0 bg-electric-blue">+</button>
                              ) : (
                                <div className="flex items-center gap-2 shrink-0">
                                  <button onClick={() => rimuovi(p.id)}
                                    className="w-8 h-8 rounded-full border-2 border-electric-blue text-electric-blue flex items-center justify-center font-bold text-lg">−</button>
                                  <span className="font-bold text-ink-navy w-4 text-center">{q}</span>
                                  <button onClick={() => aggiungi(p)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-lg bg-electric-blue">+</button>
                                </div>
                              )}
                            </div>
                            {q > 0 && (
                              <input type="text" value={carrello.find(r => r.piattoId === p.id)?.note ?? ''}
                                onChange={e => setNota(p.id, e.target.value)}
                                placeholder="Nota per questo piatto (es. senza cipolla)…"
                                className="mt-2 w-full border border-ink-navy/12 rounded-lg px-2.5 py-1.5 text-xs text-ink-navy/80 placeholder:text-ink-navy/35 focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Note generali */}
          <div>
            <label className="block text-xs font-medium text-ink-navy/60 mb-1">Note per la cucina</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Allergie, richieste speciali…"
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
          </div>

          {errore && <p className="text-sm text-red-500">{errore}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ink-navy/8 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-ink-navy/70">{totaleArticoli} {totaleArticoli === 1 ? 'articolo' : 'articoli'}</span>
            <span className="text-xl font-bold text-ink-navy">€{totale.toFixed(2)}</span>
          </div>
          <button onClick={invia} disabled={inviando || carrello.length === 0}
            className="w-full py-3 rounded-xl bg-electric-blue text-white font-bold disabled:opacity-40 transition-opacity">
            {inviando ? 'Invio in corso…' : '🍽️ Invia ordine in cucina'}
          </button>
        </div>
      </div>
    </div>
  )
}

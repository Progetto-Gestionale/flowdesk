'use client'
import { useEffect, useState, useCallback } from 'react'

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

  const fetchOrdini = useCallback(async () => {
    const res = await fetch('/api/ordini?oggi=1', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setOrdini((data.ordini ?? []).filter((o: Ordine) => o.tipo === 'delivery' || o.tipo === 'asporto'))
  }, [])

  useEffect(() => {
    fetchOrdini().finally(() => setLoading(false))
    const iv = setInterval(fetchOrdini, 15000)
    return () => clearInterval(iv)
  }, [fetchOrdini])

  async function setStato(id: string, status: string) {
    setOrdini(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    await fetch(`/api/ordini/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchOrdini()
  }

  async function elimina(id: string) {
    setOrdini(prev => prev.filter(o => o.id !== id))
    setConfermaElimina(null)
    await fetch(`/api/ordini/${id}`, { method: 'DELETE', credentials: 'include' })
    fetchOrdini()
  }

  const t = testi(tipoSel)

  function Card({ o }: { o: Ordine }) {
    const stato = statoOrdine(o)
    const isDone = stato === 'consegnato'
    const nonConsegnato = o.status === 'non_consegnato'
    let ci: { nome?: string; telefono?: string; indirizzo?: string; ora?: string } = {}
    try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
    const label = ci.nome || 'Ordine online'
    const oraArrivo = new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

    return (
      <div className={`bg-white border rounded-xl overflow-hidden shadow-sm ${nonConsegnato ? 'border-red-300' : isDone ? 'border-ink-navy/10' : t.theme.border}`}>
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
            {stato === 'in_preparazione' && (
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

  if (loading) return <p className="text-ink-navy/35 text-sm p-8">Caricamento...</p>

  const attivi = (tipo: Tipo) => ordini.filter(o => o.tipo === tipo && statoOrdine(o) !== 'consegnato').length
  const perStato = (s: Stato) => ordini.filter(o => o.tipo === tipoSel && statoOrdine(o) === s)

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
        <button onClick={fetchOrdini}
          className="text-sm text-electric-blue hover:text-ink-navy font-medium border border-electric-blue/25 px-3 py-1.5 rounded-lg hover:bg-electric-blue/10 transition-colors">
          ↻ Aggiorna
        </button>
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
    </div>
  )
}

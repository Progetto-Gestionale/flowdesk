'use client'
import { useEffect, useState } from 'react'
import { getCache, setCache } from '@/lib/pageCache'

const STAFF_SERVIZIO_CACHE_KEY = 'food:staff-in-servizio' // cache navigazione (stale-while-revalidate)

interface Timbratura {
  tipo: 'entrata' | 'uscita'
  timestamp: string
  dipendente: { nome: string; ruolo: string | null }
}

const fmtOra = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

// Copia "in sola lettura" del box presenze "In servizio ora" della sezione staff.
// Riusa la stessa route (/api/qr-timbratura/storico) senza toccare staff né le sue route.
export default function StaffInServizio() {
  const [timbrature, setTimbrature] = useState<Timbratura[] | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const oggi = new Date()
    const oggiStr = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`
    let attivo = true
    // Idrata subito dall'ultimo dato in cache (se c'è): niente flash al ritorno sulla pagina.
    const cached = getCache<Timbratura[]>(STAFF_SERVIZIO_CACHE_KEY)
    if (cached) setTimbrature(cached)
    const carica = () => {
      fetch(`/api/qr-timbratura/storico?data=${oggiStr}`, { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (!attivo) return; const list = d?.timbrature ?? []; setTimbrature(list); setCache(STAFF_SERVIZIO_CACHE_KEY, list) })
        .catch(() => {})
    }
    carica()
    const iRefetch = setInterval(carica, 60000)       // aggiorna le presenze ogni minuto
    const iTick = setInterval(() => setTick(t => t + 1), 60000) // aggiorna le durate
    return () => { attivo = false; clearInterval(iRefetch); clearInterval(iTick) }
  }, [])

  // Raggruppa per dipendente e ricava chi è attualmente in servizio (ultima entrata senza uscita successiva).
  const perDip = (timbrature ?? []).reduce<Record<string, { nome: string; ruolo: string | null; entrate: string[]; uscite: string[] }>>((acc, t) => {
    const k = t.dipendente.nome
    if (!acc[k]) acc[k] = { nome: t.dipendente.nome, ruolo: t.dipendente.ruolo, entrate: [], uscite: [] }
    if (t.tipo === 'entrata') acc[k].entrate.push(t.timestamp)
    else acc[k].uscite.push(t.timestamp)
    return acc
  }, {})
  const presenti = Object.values(perDip).filter(d => {
    const ul = [...d.entrate].sort().pop()
    const uu = [...d.uscite].sort().pop()
    return ul && (!uu || uu < ul)
  })

  return (
    <aside className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-ink-navy/8 flex items-center gap-2 shrink-0">
        <div className={`w-2 h-2 rounded-full shrink-0 ${presenti.length > 0 ? 'bg-green-400 animate-pulse' : 'bg-ink-navy/15'}`} />
        <p className="text-xs font-semibold text-ink-navy/60 uppercase tracking-wide">In servizio ora</p>
        {presenti.length > 0 && (
          <span className="ml-auto text-xs font-bold text-electric-blue bg-electric-blue/10 px-2 py-0.5 rounded-full">{presenti.length}</span>
        )}
      </div>
      {timbrature === null ? (
        <div className="px-4 py-6 text-center"><p className="text-xs text-ink-navy/25 font-mono">…</p></div>
      ) : presenti.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <p className="text-xs text-ink-navy/30">Nessuno in servizio</p>
        </div>
      ) : (
        <div className="divide-y divide-ink-navy/6 overflow-y-auto">
          {presenti.map(d => {
            const entrata = [...d.entrate].sort().pop()!
            const ms = Date.now() - new Date(entrata).getTime()
            const h = Math.floor(ms / 3600000)
            const m = Math.floor((ms % 3600000) / 60000)
            return (
              <div key={d.nome} className="px-4 py-3">
                <p className="text-sm font-semibold text-ink-navy truncate">
                  {d.nome.split(' ')[0]}
                  {d.ruolo && <span className="text-xs font-normal text-ink-navy/35"> · {d.ruolo}</span>}
                </p>
                <p className="text-xs text-ink-navy/40 mt-0.5">
                  dalle {fmtOra(entrata)} · {h > 0 ? `${h}h ` : ''}{m}m
                </p>
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}

'use client'
import { useState } from 'react'
import { parseInfoOrdine, buildNoteOrdine } from '@/lib/ordineInfo'

// Una richiesta = un Preventivo tipo asporto/delivery in attesa di accettazione dal ristoratore.
// Stesso flusso delle prenotazioni tavolo: Accetta (crea l'ordine + mail conferma) / Rifiuta (mail) /
// Proponi modifiche (mail con link; il cliente risponde e all'accettazione l'ordine viene creato).
export interface Richiesta {
  id: string
  numero: number
  tipo: string
  clienteName: string
  clienteEmail: string | null
  items: string
  totale: number
  status: string
  note: string | null
  createdAt: string
}

interface RigaItem { nome: string; quantita: number; prezzo: number }

const fmt = (n: number) => `€${n.toFixed(2)}`
function fmtData(d?: string) {
  if (!d) return ''
  const dt = new Date(`${d}T12:00:00`)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function RichiesteInEntrata({ richieste, onRefetch }: { richieste: Richiesta[]; onRefetch: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [proposta, setProposta] = useState<Richiesta | null>(null)

  async function azione(r: Richiesta, body: object, key: string) {
    setBusy(key)
    try {
      await fetch(`/api/preventivi/${r.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      onRefetch()
    } finally { setBusy(null) }
  }

  // Ordino: prima le nuove da verificare, poi quelle in attesa di risposta; più recenti in cima.
  const ordinate = [...richieste].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'da_verificare' ? -1 : 1
    return +new Date(b.createdAt) - +new Date(a.createdAt)
  })

  if (ordinate.length === 0) return (
    <div className="bg-white rounded-2xl border border-ink-navy/10 p-16 text-center shadow-sm">
      <p className="text-ink-navy/50 text-sm">Nessuna richiesta in attesa</p>
      <p className="text-ink-navy/35 text-xs mt-1">Le richieste di asporto e delivery dal menu online compaiono qui in attesa di conferma.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {ordinate.map(r => {
        const isDelivery = r.tipo === 'delivery'
        const info = parseInfoOrdine(r.note)
        let items: RigaItem[] = []
        try { const a = JSON.parse(r.items ?? '[]'); if (Array.isArray(a)) items = a } catch {}
        const inAttesa = r.status === 'inviato' // proposta inviata, aspetta risposta cliente
        const theme = isDelivery ? 'bg-teal-100 text-teal-700' : 'bg-violet-100 text-violet-700'
        return (
          <div key={r.id} className={`bg-white border rounded-xl overflow-hidden shadow-sm ${inAttesa ? 'border-amber-300' : 'border-ink-navy/10'}`}>
            <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-ink-navy/8 bg-mist/50 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-sm font-bold text-ink-navy truncate">{r.clienteName || 'Cliente'}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${theme}`}>{isDelivery ? 'Delivery' : 'Asporto'}</span>
                <span className="text-xs text-ink-navy/40">#{String(r.numero).padStart(3, '0')}</span>
                {inAttesa && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">In attesa di risposta</span>}
              </div>
              <span className="text-sm font-bold text-ink-navy">{fmt(r.totale)}</span>
            </div>

            <div className="px-4 py-3 grid sm:grid-cols-2 gap-3">
              <div className="text-xs text-ink-navy/60 space-y-1">
                <p><span className="text-ink-navy/40">{isDelivery ? 'Consegna' : 'Ritiro'}:</span> <b className="text-ink-navy">{fmtData(info.data)}{info.ora ? ` alle ${info.ora}` : ''}</b></p>
                {isDelivery && info.indirizzo && <p><span className="text-ink-navy/40">Indirizzo:</span> <b className="text-ink-navy">{info.indirizzo}</b></p>}
                {info.telefono && <p><span className="text-ink-navy/40">Tel:</span> {info.telefono}</p>}
                {r.clienteEmail && <p className="truncate"><span className="text-ink-navy/40">Email:</span> {r.clienteEmail}</p>}
                {info.noteCliente && <p className="text-red-600"><span className="text-ink-navy/40">Nota:</span> {info.noteCliente}</p>}
              </div>
              <div className="text-xs">
                <div className="divide-y divide-ink-navy/6">
                  {items.map((it, i) => (
                    <div key={i} className="flex justify-between py-1 gap-2">
                      <span className="text-ink-navy"><b>{it.quantita}×</b> {it.nome}</span>
                      <span className="text-ink-navy/50 shrink-0">{fmt(it.prezzo * it.quantita)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-ink-navy/8 flex items-center justify-end gap-2 flex-wrap">
              <button onClick={() => azione(r, { status: 'rifiutato' }, r.id + ':rif')} disabled={!!busy}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors">
                {busy === r.id + ':rif' ? '…' : 'Rifiuta'}
              </button>
              <button onClick={() => setProposta(r)} disabled={!!busy}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/70 hover:bg-mist disabled:opacity-40 transition-colors">
                Proponi modifiche
              </button>
              <button onClick={() => azione(r, { status: 'accettato' }, r.id + ':acc')} disabled={!!busy}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-navy text-white hover:bg-ink-navy/80 disabled:opacity-40 transition-colors">
                {busy === r.id + ':acc' ? '…' : 'Accetta'}
              </button>
            </div>
          </div>
        )
      })}

      {proposta && (
        <PropostaModal
          richiesta={proposta}
          busy={!!busy}
          onClose={() => setProposta(null)}
          onInvia={async (messaggio, data, ora) => {
            const info = parseInfoOrdine(proposta.note)
            const note = buildNoteOrdine({ ...info, data, ora }, data, ora)
            await azione(proposta, { _azione: 'proposta', messaggio, note }, proposta.id + ':prop')
            setProposta(null)
          }}
        />
      )}
    </div>
  )
}

// Modale "Proponi modifiche": messaggio al cliente + eventuale nuovo giorno/orario proposto.
function PropostaModal({ richiesta, busy, onClose, onInvia }: {
  richiesta: Richiesta
  busy: boolean
  onClose: () => void
  onInvia: (messaggio: string, data: string, ora: string) => void
}) {
  const info = parseInfoOrdine(richiesta.note)
  const [messaggio, setMessaggio] = useState('')
  const [data, setData] = useState(info.data ?? '')
  const [ora, setOra] = useState(info.ora ?? '')
  const isDelivery = richiesta.tipo === 'delivery'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-ink-navy/8 flex items-center justify-between">
          <h3 className="text-base font-bold text-ink-navy">Proponi modifiche — {richiesta.clienteName}</h3>
          <button onClick={onClose} className="text-ink-navy/30 hover:text-ink-navy/60 text-xl font-bold leading-none">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-ink-navy/50">Il cliente riceve una email con la tua proposta e i pulsanti Accetto / Rifiuto. Se accetta, l&apos;ordine viene creato automaticamente.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-navy/50 uppercase tracking-wide mb-1">{isDelivery ? 'Consegna' : 'Ritiro'} — giorno</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue/30" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-navy/50 uppercase tracking-wide mb-1">Orario</label>
              <input type="time" value={ora} onChange={e => setOra(e.target.value)}
                className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue/30" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-navy/50 uppercase tracking-wide mb-1">Messaggio al cliente</label>
            <textarea value={messaggio} onChange={e => setMessaggio(e.target.value)} rows={3}
              placeholder="Es. Possiamo consegnare alle 20:30 anziché alle 20:00, va bene?"
              className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-electric-blue/30" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-ink-navy/8 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm font-semibold px-4 py-2 rounded-xl border border-ink-navy/15 text-ink-navy/60 hover:bg-mist">Annulla</button>
          <button onClick={() => onInvia(messaggio.trim(), data, ora)} disabled={busy || !data || !ora}
            className="text-sm font-semibold px-4 py-2 rounded-xl bg-electric-blue text-white hover:bg-electric-blue/90 disabled:opacity-40">
            {busy ? 'Invio…' : 'Invia proposta'}
          </button>
        </div>
      </div>
    </div>
  )
}

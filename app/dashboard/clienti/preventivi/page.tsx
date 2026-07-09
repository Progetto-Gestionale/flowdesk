'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { IconClipboard } from '../../../components/icons'

interface Item {
  descrizione: string
  quantita: number
  prezzo: number
}

interface Richiesta {
  id: string
  numero: number
  tipo: string
  clienteName: string
  clienteEmail?: string
  items: string
  totale: number
  status: string
  note?: string
  createdAt: string
  leadId?: string
}

interface ItemExt extends Item {
  coperti?: number
  allergie?: string
  occasione?: string
}

interface StoricoProfilo {
  totaleRichieste: number
  spesaTotale: number
  ultimaVisita: string | null
  noShow: number
}

function SintesiRichiesta({ items, note }: { items: ItemExt[]; note?: string }) {
  const righe = items.filter(i => i.descrizione).map(i =>
    i.quantita > 1 ? `${i.descrizione} × ${i.quantita}` : i.descrizione
  )
  const dataMatch = note?.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)
  const oraMatch = note?.match(/ORA_ISO:(\d{2}:\d{2})/)
  // Estrai anche da note testuale (es: "Coperti: 4")
  const copertiNote = note?.match(/Coperti:\s*(\d+)/)
  const allergieNote = note?.match(/Allergie:\s*([^.]+)/)
  const occasioneNote = note?.match(/Occasione:\s*([^.]+)/)

  const coperti = items[0]?.coperti ?? (copertiNote ? parseInt(copertiNote[1]) : null)
  const allergie = items[0]?.allergie ?? allergieNote?.[1]?.trim()
  const occasione = items[0]?.occasione ?? occasioneNote?.[1]?.trim()
  const noteClean = note?.replace(/DATA_ISO:\S+|ORA_ISO:\S+|Coperti:\s*\d+\.|Allergie:[^.]+\.|Occasione:[^.]+\.|Generato automaticamente via chat\./g, '').trim()

  return (
    <div className="bg-electric-blue/10 border border-electric-blue/15 rounded-xl px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-electric-blue uppercase tracking-wider">Cosa ha chiesto</p>
      <p className="text-sm font-medium text-ink-navy">{righe.join(' · ') || 'Nessuna descrizione'}</p>
      <div className="flex flex-wrap gap-1.5">
        {dataMatch && (
          <span className="inline-flex items-center gap-1 bg-electric-blue/15 text-electric-blue text-xs font-semibold px-2 py-0.5 rounded-full">
            {new Date(dataMatch[1]).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        )}
        {oraMatch && (
          <span className="inline-flex items-center gap-1 bg-electric-blue/15 text-electric-blue text-xs font-semibold px-2 py-0.5 rounded-full">
            {oraMatch[1]}
          </span>
        )}
        {coperti != null && coperti > 0 && (
          <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {coperti} {coperti === 1 ? 'persona' : 'persone'}
          </span>
        )}
        {allergie && allergie.toLowerCase() !== 'nessuna' && (
          <span className="inline-flex items-center gap-1 bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">
            {allergie}
          </span>
        )}
        {occasione && (
          <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-600 text-xs font-semibold px-2 py-0.5 rounded-full">
            {occasione}
          </span>
        )}
      </div>
      {noteClean && noteClean.length > 3 && <p className="text-xs text-electric-blue">{noteClean}</p>}
    </div>
  )
}

const TIPI: { id: string; label: string; color: string }[] = [
  { id: 'tutti', label: 'Tutte', color: 'bg-mist text-ink-navy/70' },
  { id: 'tavolo', label: 'Tavolo', color: 'bg-orange-100 text-orange-700' },
  { id: 'ordine', label: 'Ordine / Asporto', color: 'bg-amber-100 text-amber-700' },
  { id: 'delivery', label: 'Delivery', color: 'bg-teal-100 text-teal-700' },
  { id: 'servizio', label: 'Servizio', color: 'bg-teal-100 text-teal-700' },
]

const STATUS_COLORS: Record<string, string> = {
  da_verificare: 'bg-amber-100 text-amber-700',
  lista_attesa: 'bg-orange-100 text-orange-700',
  lista_attesa_contattato: 'bg-blue-100 text-blue-700',
  bozza: 'bg-mist text-ink-navy/60',
  inviato: 'bg-blue-100 text-blue-700',
  accettato: 'bg-green-100 text-green-700',
  rifiutato: 'bg-red-100 text-red-600',
  cliente_eliminato: 'bg-red-50 text-red-400',
}

const STATUS_LABELS: Record<string, string> = {
  da_verificare: 'Da verificare',
  lista_attesa: 'Lista d\'attesa',
  lista_attesa_contattato: 'Contattato',
  bozza: 'Bozza',
  inviato: 'Inviato',
  accettato: 'Accettato',
  rifiutato: 'Rifiutato',
  cliente_eliminato: 'Cliente eliminato',
}

function NuovaRichiestaModal({ onClose, onSave, initial }: {
  onClose: () => void
  onSave: (data: object) => void
  initial?: Richiesta | null
}) {
  const [clienteName, setClienteName] = useState(initial?.clienteName ?? '')
  const [clienteEmail, setClienteEmail] = useState(initial?.clienteEmail ?? '')
  const [tipo, setTipo] = useState(initial?.tipo ?? 'preventivo')
  const [note, setNote] = useState(initial?.note ?? '')
  const [items, setItems] = useState<Item[]>(
    initial ? JSON.parse(initial.items) : [{ descrizione: '', quantita: 1, prezzo: 0 }]
  )

  function addItem() { setItems([...items, { descrizione: '', quantita: 1, prezzo: 0 }]) }
  function updateItem(i: number, field: keyof Item, value: string | number) {
    setItems(items.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)) }
  const totale = items.reduce((sum, i) => sum + i.quantita * i.prezzo, 0)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-5 my-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-navy">{initial ? 'Gestisci richiesta' : 'Nuova richiesta'}</h2>
          <button onClick={onClose} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
        </div>

        {/* Sintesi originale (solo in modifica) */}
        {initial && (
          <SintesiRichiesta items={JSON.parse(initial.items) as Item[]} note={initial.note} />
        )}

        {/* Tipo */}
        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-2">Tipo richiesta</label>
          <div className="flex flex-wrap gap-2">
            {TIPI.filter(t => t.id !== 'tutti').map(t => (
              <button key={t.id} onClick={() => setTipo(t.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${tipo === t.id ? t.color : 'bg-mist text-ink-navy/50 hover:bg-ink-navy/10'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome cliente *</label>
            <input type="text" value={clienteName} onChange={e => setClienteName(e.target.value)} placeholder="Mario Rossi"
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-navy/70 mb-1">Email cliente</label>
            <input type="email" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="mario@email.com"
              className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-2">Dettagli</label>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs text-ink-navy/35 px-1">
              <span className="col-span-6">Descrizione</span>
              <span className="col-span-2 text-center">Qtà</span>
              <span className="col-span-3 text-center">Prezzo €</span>
              <span className="col-span-1"></span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input type="text" value={item.descrizione} onChange={e => updateItem(i, 'descrizione', e.target.value)} placeholder="Descrizione"
                  className="col-span-6 border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                <input type="number" value={item.quantita} onChange={e => updateItem(i, 'quantita', Number(e.target.value))} min={1}
                  className="col-span-2 border border-ink-navy/15 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                <input type="number" value={item.prezzo} onChange={e => updateItem(i, 'prezzo', Number(e.target.value))} min={0} step={0.01}
                  className="col-span-3 border border-ink-navy/15 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                <button onClick={() => removeItem(i)} disabled={items.length === 1}
                  className="col-span-1 text-ink-navy/25 hover:text-red-400 disabled:opacity-30 text-center">✕</button>
              </div>
            ))}
            <button onClick={addItem} className="text-sm text-electric-blue hover:text-ink-navy font-medium">+ Aggiungi voce</button>
          </div>
        </div>

        {totale > 0 && (
          <div className="flex justify-end">
            <div className="bg-mist rounded-lg px-4 py-2 text-right">
              <p className="text-xs text-ink-navy/35">Totale</p>
              <p className="text-xl font-bold text-ink-navy">€ {totale.toFixed(2)}</p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Annulla</button>
          <button onClick={() => onSave({ clienteName, clienteEmail, tipo, items, note })}
            disabled={!clienteName.trim() || items.every(i => !i.descrizione)}
            className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 disabled:opacity-40">
            Salva richiesta
          </button>
        </div>
      </div>
    </div>
  )
}

function PropostaModificaModal({ richiesta, onClose, onInvia }: {
  richiesta: Richiesta
  onClose: () => void
  onInvia: (messaggio: string, note: string) => void
}) {
  const [messaggio, setMessaggio] = useState('')
  const [note, setNote] = useState(richiesta.note ?? '')

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-navy">Proponi modifica</h2>
            <p className="text-xs text-ink-navy/50 mt-0.5">Il cliente riceverà una email con la proposta e potrà accettare o rifiutare</p>
          </div>
          <button onClick={onClose} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
          Richiesta di: <strong>{richiesta.clienteName}</strong>
          {richiesta.clienteEmail && <span className="text-amber-600"> · {richiesta.clienteEmail}</span>}
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-1">Messaggio per il cliente *</label>
          <textarea
            value={messaggio}
            onChange={e => setMessaggio(e.target.value)}
            rows={3}
            placeholder="Es: L'orario delle 20:00 non è disponibile, possiamo offrirti le 19:30 o le 21:00. Il tavolo sarebbe in sala interna."
            className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
          />
          <p className="text-xs text-ink-navy/35 mt-1">Spiega cosa cambia rispetto alla richiesta originale.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-1">Note interne (non visibili al cliente)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Note per uso interno..."
            className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">
            Annulla
          </button>
          <button
            onClick={() => onInvia(messaggio, note)}
            disabled={!messaggio.trim()}
            className="flex-1 bg-amber-500 text-white font-semibold py-2.5 rounded-lg hover:bg-amber-600 disabled:opacity-40">
            Invia proposta
          </button>
        </div>
      </div>
    </div>
  )
}

interface TavoloBasic { id: string; numero: number; posti: number; note: string | null }
interface AppBasic { id: string; data: string; durata: number; status: string; tavoloId?: string | null; tavoliIds?: string | null; note?: string | null }

function ConfermaAppuntamentoModal({ richiesta, onClose, onConferma }: {
  richiesta: Richiesta
  onClose: () => void
  onConferma: (data: string, ora: string, servizio: string, durata: number, coperti?: number, allergie?: string, occasione?: string, tavoliIds?: string[]) => void
}) {
  const isTavolo = richiesta.tipo === 'tavolo'
  const items = JSON.parse(richiesta.items) as ItemExt[]
  const servizioDefault = isTavolo ? 'Prenotazione tavolo'
    : richiesta.tipo === 'delivery' ? 'Delivery'
    : richiesta.tipo === 'ordine' ? 'Ordine asporto'
    : (items[0]?.descrizione ?? '')
  const dataMatch = richiesta.note?.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)
  const oraMatch = richiesta.note?.match(/ORA_ISO:(\d{2}:\d{2})/)
  const copertiNote = richiesta.note?.match(/Coperti:\s*(\d+)/)
  const allergieNote = richiesta.note?.match(/Allergie:\s*([^.]+)/)
  const occasioneNote = richiesta.note?.match(/Occasione:\s*([^.]+)/)

  const [data, setData] = useState(dataMatch?.[1] ?? '')
  const [ora, setOra] = useState(oraMatch?.[1] ?? '19:30')
  const [servizio, setServizio] = useState(servizioDefault)
  const [durata, setDurata] = useState(isTavolo ? 90 : 15)
  const [coperti, setCoperti] = useState(String(items[0]?.coperti ?? copertiNote?.[1] ?? '2'))
  const [allergie, setAllergie] = useState(items[0]?.allergie ?? allergieNote?.[1]?.trim() ?? '')
  const [occasione, setOccasione] = useState(items[0]?.occasione ?? occasioneNote?.[1]?.trim() ?? '')
  const [tavoli, setTavoli] = useState<TavoloBasic[]>([])
  const [selectedTavoliIds, setSelectedTavoliIds] = useState<string[]>([])
  const [appuntamenti, setAppuntamenti] = useState<AppBasic[]>([])

  useEffect(() => {
    fetch('/api/tavoli', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setTavoli(d.tavoli ?? []))
    fetch('/api/appuntamenti', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setAppuntamenti(d.appuntamenti ?? []))
  }, [])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-navy">
              {isTavolo ? 'Conferma prenotazione tavolo' : 'Conferma appuntamento'}
            </h2>
            <p className="text-xs text-ink-navy/50 mt-0.5">Richiesta accettata — aggiungi al calendario</p>
          </div>
          <button onClick={onClose} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl">✕</button>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
          Cliente: <strong>{richiesta.clienteName}</strong>
        </div>
        <div className="space-y-3">
          {!isTavolo && (
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Servizio</label>
              <input type="text" value={servizio} onChange={e => setServizio(e.target.value)}
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Data *</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Ora *</label>
              <input type="time" value={ora} onChange={e => setOra(e.target.value)}
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            </div>
          </div>
          {isTavolo ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Coperti</label>
                  <input type="number" min={1} value={coperti} onChange={e => setCoperti(e.target.value)}
                    className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Durata stimata</label>
                  <select value={durata} onChange={e => setDurata(Number(e.target.value))}
                    className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
                    {[60, 90, 120, 150, 180].map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
              </div>
              {allergie && allergie.toLowerCase() !== 'nessuna' && (
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Allergie / intolleranze</label>
                  <input type="text" value={allergie} onChange={e => setAllergie(e.target.value)}
                    className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                </div>
              )}
              {occasione && (
                <div>
                  <label className="block text-sm font-medium text-ink-navy/70 mb-1">Occasione</label>
                  <input type="text" value={occasione} onChange={e => setOccasione(e.target.value)}
                    className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-ink-navy/70 mb-1">Durata</label>
              <select value={durata} onChange={e => setDurata(Number(e.target.value))}
                className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue">
                {[30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} minuti</option>)}
              </select>
            </div>
          )}
        </div>
        {isTavolo && tavoli.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-ink-navy/70">Tavoli (opzionale)</label>
              {selectedTavoliIds.length >= 2 && (
                <span className="text-xs font-bold text-orange-600">
                  T{tavoli.filter(t => selectedTavoliIds.includes(t.id)).sort((a,b)=>a.numero-b.numero).map(t=>t.numero).join('+')} — verranno fusi
                </span>
              )}
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {tavoli.map(t => {
                const checked = selectedTavoliIds.includes(t.id)
                const selStart = data && ora ? new Date(`${data}T${ora}`).getTime() : null
                const selEnd = selStart ? selStart + durata * 60000 : null
                const occupato = !checked && selStart !== null && selEnd !== null && appuntamenti.some(a => {
                  if (a.status === 'cancellato') return false
                  const usaTavolo = a.tavoloId === t.id || (() => { try { return (JSON.parse(a.tavoliIds ?? '[]') as string[]).includes(t.id) } catch { return false } })()
                  if (!usaTavolo) return false
                  const aStart = new Date(a.data).getTime()
                  const aEnd = aStart + a.durata * 60000
                  return aStart < selEnd! && selStart! < aEnd
                })
                return (
                  <label key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                    occupato ? 'border-red-200 bg-red-50 cursor-not-allowed opacity-60' : checked ? 'border-electric-blue/40 bg-electric-blue/10 cursor-pointer' : 'border-ink-navy/10 hover:bg-mist cursor-pointer'
                  }`}>
                    <input type="checkbox" checked={checked} disabled={occupato}
                      onChange={e => setSelectedTavoliIds(prev => e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id))}
                      className="accent-electric-blue w-4 h-4 shrink-0" />
                    <span className="text-sm text-ink-navy/70 flex-1">
                      <span className="font-semibold">T{t.numero}</span>
                      <span className="text-ink-navy/35"> · {t.posti} posti{t.note ? ` · ${t.note}` : ''}</span>
                    </span>
                    {occupato && <span className="text-xs text-red-500 font-medium">occupato</span>}
                  </label>
                )
              })}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">Salta</button>
          <button onClick={() => onConferma(data, ora, servizio, durata, parseInt(coperti) || undefined, allergie || undefined, occasione || undefined, selectedTavoliIds.length > 0 ? selectedTavoliIds : undefined)}
            disabled={!data}
            className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-40">
            Aggiungi al calendario
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return <Suspense><Richieste /></Suspense>
}

function Richieste() {
  const searchParams = useSearchParams()
  const [richieste, setRichieste] = useState<Richiesta[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingRichiesta, setEditingRichiesta] = useState<Richiesta | null>(null)
  const [selected, setSelected] = useState<Richiesta | null>(null)
  const [confermaApp, setConfermaApp] = useState<Richiesta | null>(null)
  const [proposta, setProposta] = useState<Richiesta | null>(null)
  const [tipoAttivo, setTipoAttivo] = useState('tutti')
  const [clienteStorico, setClienteStorico] = useState<StoricoProfilo | null>(null)
  const [allergieMemoriate, setAllergieMemoriate] = useState<string[]>([])
  const [preferenzeMemoriate, setPreferenzeMemoriate] = useState<string[]>([])
  const [tavoli, setTavoli] = useState<TavoloBasic[]>([])
  const [appuntamenti, setAppuntamenti] = useState<AppBasic[]>([])
  const [assegnaTavoliIds, setAssegnaTavoliIds] = useState<string[]>([])
  const [assegnaLoading, setAssegnaLoading] = useState(false)

  async function fetchRichieste() {
    const res = await fetch('/api/preventivi', { credentials: 'include', cache: 'no-store' })
    const data = await res.json()
    const lista: Richiesta[] = data.preventivi ?? []
    setRichieste(lista)
    setLoading(false)

    // Apri automaticamente la richiesta indicata da query param
    const richiestaId = searchParams.get('richiesta')
    const leadId = searchParams.get('leadId')
    if (richiestaId) {
      const trovata = lista.find(r => r.id === richiestaId)
      if (trovata) setSelected(trovata)
    } else if (leadId) {
      const trovata = lista.find(r => r.leadId === leadId)
      if (trovata) setSelected(trovata)
    }
  }

  useEffect(() => {
    fetchRichieste()
    const interval = setInterval(fetchRichieste, 15000)
    fetch('/api/tavoli', { credentials: 'include' }).then(r => r.json()).then(d => setTavoli(d.tavoli ?? []))
    fetch('/api/appuntamenti', { credentials: 'include' }).then(r => r.json()).then(d => setAppuntamenti(d.appuntamenti ?? []))
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { setAssegnaTavoliIds([]) }, [selected?.id])

  // Carica storico e memoria del cliente quando si apre una richiesta
  useEffect(() => {
    if (!selected?.leadId) {
      setClienteStorico(null)
      setAllergieMemoriate([])
      setPreferenzeMemoriate([])
      return
    }
    const leadId = selected.leadId
    const currentId = selected.id
    Promise.all([
      fetch(`/api/leads/${leadId}/storico`, { credentials: 'include', cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/preventivi?leadId=${leadId}`, { credentials: 'include', cache: 'no-store' }).then(r => r.json()),
    ]).then(([storico, prevData]) => {
      setClienteStorico(storico)
      // Estrai allergie e occasioni dalle richieste passate (escludi quella corrente)
      const passate: Richiesta[] = (prevData.preventivi ?? []).filter((p: Richiesta) => p.id !== currentId)
      const allergie = new Set<string>()
      const preferenze = new Set<string>()
      passate.forEach((r: Richiesta) => {
        const items = JSON.parse(r.items) as ItemExt[]
        items.forEach(item => {
          if (item.allergie && item.allergie.toLowerCase() !== 'nessuna') allergie.add(item.allergie.trim())
          if (item.occasione) preferenze.add(item.occasione.trim())
        })
        const allergieNote = r.note?.match(/Allergie:\s*([^.\n]+)/)
        if (allergieNote) allergie.add(allergieNote[1].trim())
        const occasioneNote = r.note?.match(/Occasione:\s*([^.\n]+)/)
        if (occasioneNote) preferenze.add(occasioneNote[1].trim())
      })
      setAllergieMemoriate([...allergie])
      setPreferenzeMemoriate([...preferenze])
    }).catch(() => {})
  }, [selected?.id])

  async function handleSave(form: object) {
    try {
      if (editingRichiesta) {
        const items = (form as { items: Item[] }).items
        const totale = items.reduce((sum, i) => sum + i.quantita * i.prezzo, 0)
        const nuovoStatus = editingRichiesta.status === 'da_verificare' && totale > 0 ? 'inviato' : undefined
        await fetch(`/api/preventivi/${editingRichiesta.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, items: JSON.stringify(items), totale, ...(nuovoStatus ? { status: nuovoStatus } : {}) }),
        })
      } else {
        await fetch('/api/preventivi', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
    } finally {
      setShowModal(false)
      setEditingRichiesta(null)
      await fetchRichieste()
    }
  }

  async function handleStatusChange(id: string, status: string) {
    const corrente = selected

    await fetch(`/api/preventivi/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })

    // Propaga sul lead (pipeline) e sugli appuntamenti (calendario)
    if (corrente) {
      if (status === 'rifiutato' || status === 'cliente_eliminato') {
        // Cancella il lead e gli appuntamenti collegati
        await fetch('/api/leads/cancella', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: corrente.leadId, email: corrente.clienteEmail }),
        })
      } else if (status === 'accettato') {
        // Sposta il lead in "chiuso" (acquisito)
        if (corrente.leadId) {
          await fetch(`/api/leads/${corrente.leadId}`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'chiuso', cancellato: false }),
          })
        }

        const isTavolo = corrente.tipo === 'tavolo'
        const dataMatch = corrente.note?.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)
        const oraMatch = corrente.note?.match(/ORA_ISO:(\d{2}:\d{2})/)

        // Per tipi non-tavolo con data già catturata dal bot → crea appuntamento automaticamente
        if (!isTavolo && dataMatch?.[1]) {
          const items = (() => { try { return JSON.parse(corrente.items) } catch { return [] } })()
          const ora = oraMatch?.[1] ?? '12:00'
          const copertiMatch = corrente.note?.match(/Coperti:\s*(\d+)/)
          await fetch('/api/appuntamenti', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clienteNome: corrente.clienteName,
              clienteEmail: corrente.clienteEmail,
              servizio: corrente.tipo === 'delivery' ? 'Delivery' : corrente.tipo === 'ordine' ? 'Ordine asporto' : (items[0]?.descrizione ?? corrente.tipo),
              data: new Date(`${dataMatch[1]}T${ora}`).toISOString(),
              durata: 15,
              coperti: items[0]?.coperti ?? (copertiMatch ? Number(copertiMatch[1]) : 1),
              note: [items[0]?.descrizione, `Da richiesta #${String(corrente.numero).padStart(3, '0')}`].filter(Boolean).join('\n'),
            }),
          })
          setSelected(null)
          await fetchRichieste()
          window.dispatchEvent(new Event('refresh-richieste-count'))
          return
        }

        // Tavolo, o non-tavolo senza data → apri modal per raccogliere i dati mancanti
        setSelected(null)
        setConfermaApp(corrente)
        await fetchRichieste()
        window.dispatchEvent(new Event('refresh-richieste-count'))
        return
      }
    }

    await fetchRichieste()
    window.dispatchEvent(new Event('refresh-richieste-count'))
    setSelected(prev => prev ? { ...prev, status } : null)
  }

  async function handleConfermaAppuntamento(data: string, ora: string, servizio: string, durata: number, coperti?: number, allergie?: string, occasione?: string, tavoliIds?: string[]) {
    if (!confermaApp) return
    const res = await fetch('/api/appuntamenti', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteNome: confermaApp.clienteName,
        clienteEmail: confermaApp.clienteEmail,
        servizio,
        data: new Date(`${data}T${ora}`).toISOString(),
        durata,
        note: `Da richiesta #${String(confermaApp.numero).padStart(3, '0')}`,
        coperti,
        allergie,
        occasione,
      }),
    })
    if (tavoliIds && tavoliIds.length > 0 && res.ok) {
      const newApp = await res.json()
      const appId = newApp.appuntamento?.id
      if (appId) {
        await fetch(`/api/appuntamenti/${appId}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tavoliIds }),
        })
      }
    }
    setConfermaApp(null)
  }

  async function handleInviaProposta(messaggio: string, note: string) {
    if (!proposta) return
    await fetch(`/api/preventivi/${proposta.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _azione: 'proposta', messaggio, note }),
    })
    setProposta(null)
    await fetchRichieste()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/preventivi/${id}`, { method: 'DELETE', credentials: 'include' })
    await fetchRichieste()
    setSelected(null)
  }

  async function handleCancellaCliente(richiesta: Richiesta) {
    await fetch('/api/leads/cancella', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: richiesta.leadId, email: richiesta.clienteEmail }),
    })
    await fetchRichieste()
    setSelected(null)
  }

  const daVerificare = richieste.filter(r => r.status === 'da_verificare')
  const inListaAttesa = richieste.filter(r => r.status === 'lista_attesa' || r.status === 'lista_attesa_contattato')
  const tipoInfo = (tipo: string) => TIPI.find(t => t.id === tipo) ?? TIPI[0]

  const isListaAttesa = (s: string) => s === 'lista_attesa' || s === 'lista_attesa_contattato'
  const richiesteVisibili = tipoAttivo === 'tutti'
    ? richieste.filter(r => r.status !== 'da_verificare' && !isListaAttesa(r.status))
    : richieste.filter(r => r.tipo === tipoAttivo && r.status !== 'da_verificare' && !isListaAttesa(r.status))

  const conteggioPerTipo = (tipo: string) =>
    tipo === 'tutti'
      ? richieste.filter(r => r.status !== 'da_verificare' && r.status !== 'lista_attesa').length
      : richieste.filter(r => r.tipo === tipo && r.status !== 'da_verificare' && r.status !== 'lista_attesa').length

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-navy">Richieste</h1>
          <p className="text-ink-navy/50 mt-0.5">
            {richieste.length} richieste totali{daVerificare.length > 0 && ` · `}
            {daVerificare.length > 0 && <span className="text-amber-600 font-medium">{daVerificare.length} da verificare</span>}
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90 transition-colors">
          + Nuova richiesta
        </button>
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : (
        <div className="space-y-6">
          {/* Da verificare */}
          {daVerificare.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Da verificare</span>
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{daVerificare.length}</span>
              </div>
              <div className="bg-white border-2 border-amber-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50 border-b border-amber-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider">N°</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider">Tipo</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider">Cliente</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider">Richiesta</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {daVerificare.map(r => {
                      const t = tipoInfo(r.tipo)
                      return (
                        <tr key={r.id} onClick={() => setSelected(r)} className="hover:bg-amber-50 cursor-pointer transition-colors">
                          <td className="px-4 py-3 font-medium text-ink-navy">#{String(r.numero).padStart(3, '0')}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-ink-navy">{r.clienteName}</p>
                            {r.clienteEmail && <p className="text-xs text-ink-navy/35">{r.clienteEmail}</p>}
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            {(() => {
                              const items = JSON.parse(r.items) as Item[]
                              const desc = items.map(i => i.descrizione).filter(Boolean).join(', ')
                              return <p className="text-sm text-ink-navy/60 truncate">{desc || '—'}</p>
                            })()}
                          </td>
                          <td className="px-4 py-3 text-ink-navy/50">{new Date(r.createdAt).toLocaleDateString('it-IT')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lista d'attesa */}
          {inListaAttesa.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-orange-700 uppercase tracking-wider">Lista d&apos;attesa</span>
                <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{inListaAttesa.length}</span>
              </div>
              <div className="bg-white border-2 border-orange-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-orange-50 border-b border-orange-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-orange-600 uppercase tracking-wider">N°</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-orange-600 uppercase tracking-wider">Cliente</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-orange-600 uppercase tracking-wider">Richiesta</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-orange-600 uppercase tracking-wider">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-100">
                    {inListaAttesa.map(r => (
                      <tr key={r.id} onClick={() => setSelected(r)} className="hover:bg-orange-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3 font-medium text-ink-navy">#{String(r.numero).padStart(3, '0')}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink-navy">{r.clienteName}</p>
                          {r.clienteEmail && <p className="text-xs text-ink-navy/35">{r.clienteEmail}</p>}
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          {(() => {
                            const items = JSON.parse(r.items) as Item[]
                            const desc = items.map(i => i.descrizione).filter(Boolean).join(', ')
                            return <p className="text-sm text-ink-navy/60 truncate">{desc || '—'}</p>
                          })()}
                        </td>
                        <td className="px-4 py-3 text-ink-navy/50">{new Date(r.createdAt).toLocaleDateString('it-IT')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab per tipo */}
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {TIPI.map(t => {
                const count = conteggioPerTipo(t.id)
                return (
                  <button key={t.id} onClick={() => setTipoAttivo(t.id)}
                    className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                      tipoAttivo === t.id
                        ? 'bg-electric-blue text-white border-electric-blue'
                        : 'bg-white border-ink-navy/10 text-ink-navy/60 hover:border-electric-blue'
                    }`}>
                    <span>{t.label}</span>
                    {count > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tipoAttivo === t.id ? 'bg-white/20 text-white' : 'bg-mist text-ink-navy/50'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {richiesteVisibili.length === 0 ? (
              <div className="bg-white border border-dashed border-ink-navy/15 rounded-xl p-12 text-center text-ink-navy/35">
                <div className="w-11 h-11 rounded-xl bg-mist flex items-center justify-center p-2.5 mx-auto mb-4">
                  <IconClipboard />
                </div>
                <p className="font-medium">
                  {tipoAttivo === 'tutti' ? 'Nessuna richiesta ancora' : `Nessuna richiesta di tipo "${tipoInfo(tipoAttivo).label}"`}
                </p>
                <p className="text-sm mt-1">Le richieste arrivano dal chatbot o puoi crearne una manualmente</p>
                <button onClick={() => setShowModal(true)}
                  className="mt-4 bg-electric-blue text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-electric-blue/90">
                  + Nuova richiesta
                </button>
              </div>
            ) : (
              <div className="bg-white border border-ink-navy/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-mist border-b border-ink-navy/10">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">N°</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Tipo</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Cliente</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Richiesta</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Data</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Importo</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Stato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {richiesteVisibili.map(r => {
                      const t = tipoInfo(r.tipo)
                      return (
                        <tr key={r.id} onClick={() => setSelected(r)} className="hover:bg-mist cursor-pointer transition-colors">
                          <td className="px-4 py-3 font-medium text-ink-navy">#{String(r.numero).padStart(3, '0')}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-ink-navy">{r.clienteName}</p>
                            {r.clienteEmail && <p className="text-xs text-ink-navy/35">{r.clienteEmail}</p>}
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            {(() => {
                              const items = JSON.parse(r.items) as Item[]
                              const desc = items.map(i => i.descrizione).filter(Boolean).join(', ')
                              return <p className="text-sm text-ink-navy/60 truncate">{desc || '—'}</p>
                            })()}
                          </td>
                          <td className="px-4 py-3 text-ink-navy/50">{new Date(r.createdAt).toLocaleDateString('it-IT')}</td>
                          <td className="px-4 py-3 text-right font-semibold text-ink-navy">
                            {r.totale > 0 ? `€ ${r.totale.toFixed(2)}` : <span className="text-ink-navy/35 italic text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[r.status] ?? 'bg-mist text-ink-navy/60'}`}>
                              {STATUS_LABELS[r.status] ?? r.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <NuovaRichiestaModal
          onClose={() => { setShowModal(false); setEditingRichiesta(null) }}
          onSave={handleSave}
          initial={editingRichiesta}
        />
      )}

      {/* Dettaglio richiesta */}
      {selected && (() => {
        const t = tipoInfo(selected.tipo)
        const items = JSON.parse(selected.items) as Item[]
        const sintesi = items.map(i => i.descrizione).filter(Boolean).join(', ')
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>

              {/* Header */}
              <div className="px-5 py-4 border-b border-ink-navy/8 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
                    <span className="text-xs text-ink-navy/35">#{String(selected.numero).padStart(3, '0')}</span>
                  </div>
                  <h2 className="text-base font-bold text-ink-navy">{selected.clienteName}</h2>
                  {selected.clienteEmail && <p className="text-xs text-ink-navy/35">{selected.clienteEmail}</p>}
                </div>
                <button onClick={() => setSelected(null)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl mt-1">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                {/* Profilo cliente — mostrato solo se cliente già conosciuto */}
                {clienteStorico && clienteStorico.totaleRichieste > 1 && (
                  <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-violet-700 uppercase tracking-wider">Cliente abituale</span>
                      <span className="bg-violet-100 text-violet-700 text-xs font-bold px-2 py-0.5 rounded-full">
                        {clienteStorico.totaleRichieste - 1} {clienteStorico.totaleRichieste - 1 === 1 ? 'visita precedente' : 'visite precedenti'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {clienteStorico.spesaTotale > 0 && (
                        <span className="text-xs bg-violet-100 text-violet-700 font-semibold px-2 py-0.5 rounded-full">
                          €{clienteStorico.spesaTotale.toFixed(0)} spesi in totale
                        </span>
                      )}
                      {clienteStorico.ultimaVisita && (
                        <span className="text-xs bg-violet-100 text-violet-700 font-semibold px-2 py-0.5 rounded-full">
                          Ultima visita: {new Date(clienteStorico.ultimaVisita).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      {clienteStorico.noShow > 0 && (
                        <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">
                          {clienteStorico.noShow} no-show
                        </span>
                      )}
                    </div>
                    {(allergieMemoriate.length > 0 || preferenzeMemoriate.length > 0) && (
                      <div className="border-t border-violet-200 pt-2 space-y-1">
                        {allergieMemoriate.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-semibold text-violet-500 shrink-0 mt-0.5">Allergie note:</span>
                            <div className="flex flex-wrap gap-1">
                              {allergieMemoriate.map(a => (
                                <span key={a} className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">{a}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {preferenzeMemoriate.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-semibold text-violet-500 shrink-0 mt-0.5">Preferenze:</span>
                            <div className="flex flex-wrap gap-1">
                              {preferenzeMemoriate.map(p => (
                                <span key={p} className="text-xs bg-purple-100 text-purple-600 font-semibold px-2 py-0.5 rounded-full">{p}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Sintesi richiesta — in evidenza */}
                <SintesiRichiesta items={items} note={selected.note} />

                {/* Voci e importo */}
                {items.length > 1 || items[0]?.prezzo > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">Dettagli</p>
                    <div className="space-y-1">
                      {items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm bg-mist rounded-lg px-3 py-1.5">
                          <span className="text-ink-navy/70">{item.descrizione}{item.quantita > 1 ? ` × ${item.quantita}` : ''}</span>
                          <span className="font-medium">
                            {item.prezzo > 0 ? `€ ${(item.quantita * item.prezzo).toFixed(2)}` : <span className="text-ink-navy/35 italic text-xs">da definire</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                    {selected.totale > 0 && (
                      <div className="flex justify-end mt-2">
                        <span className="text-sm font-bold text-ink-navy">Totale: € {selected.totale.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Stato */}
                <div>
                  <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">
                    {selected.status === 'da_verificare' ? 'Azioni rapide' : 'Aggiorna stato'}
                  </p>
                  {selected.status === 'da_verificare' ? (
                    <div className="space-y-2">
                      <button onClick={() => { handleStatusChange(selected.id, 'accettato') }}
                        className="w-full bg-green-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2">
                        Accetta
                      </button>
                      <button onClick={() => { setProposta(selected); setSelected(null) }}
                        className="w-full bg-amber-500 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-amber-600 flex items-center justify-center gap-2">
                        Proponi modifica
                      </button>
                      <button onClick={() => { handleStatusChange(selected.id, 'rifiutato') }}
                        className="w-full border border-red-200 text-red-500 text-sm font-semibold py-2.5 rounded-lg hover:bg-red-50 flex items-center justify-center gap-2">
                        ✕ Rifiuta
                      </button>
                    </div>
                  ) : selected.status === 'inviato' ? (
                    <div className="space-y-2">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 text-center">
                        In attesa di risposta dal cliente
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleStatusChange(selected.id, 'accettato')}
                          className="flex-1 bg-green-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-green-700">
                          Forza accetta
                        </button>
                        <button onClick={() => handleStatusChange(selected.id, 'rifiutato')}
                          className="flex-1 border border-red-200 text-red-500 text-sm font-semibold py-2 rounded-lg hover:bg-red-50">
                          ✕ Forza rifiuta
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(['bozza', 'inviato', 'accettato', 'rifiutato'] as const).map(key => (
                        <button key={key} onClick={() => handleStatusChange(selected.id, key)}
                          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${selected.status === key ? STATUS_COLORS[key] : 'bg-mist text-ink-navy/60 hover:bg-ink-navy/10'}`}>
                          {STATUS_LABELS[key]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Assegna tavolo — solo per tavoli accettati senza tavolo ancora assegnato */}
              {selected.status === 'accettato' && selected.tipo === 'tavolo' && (() => {
                const numStr = `#${String(selected.numero).padStart(3, '0')}`
                const appCollegato = appuntamenti.find(a => a.note?.includes(numStr) || a.note?.includes(`Da richiesta ${numStr}`))
                if (!appCollegato) return null
                const hasTavolo = appCollegato.tavoloId || (appCollegato.tavoliIds && appCollegato.tavoliIds !== '[]')
                const dataApp = new Date(appCollegato.data)
                const fineApp = new Date(dataApp.getTime() + appCollegato.durata * 60000)
                return (
                  <div className="border-t border-ink-navy/8 pt-4">
                    <p className="text-xs font-semibold text-ink-navy/35 uppercase tracking-wider mb-2">
                      {hasTavolo ? 'Tavolo assegnato' : 'Assegna tavolo'}
                    </p>
                    {hasTavolo ? (
                      <p className="text-sm text-ink-navy/60">
                        {tavoli.filter(t => {
                          try { return (JSON.parse(appCollegato.tavoliIds ?? '[]') as string[]).includes(t.id) } catch { return t.id === appCollegato.tavoloId }
                        }).sort((a,b)=>a.numero-b.numero).map(t=>`T${t.numero} (${t.posti}p)`).join(' + ') || '—'}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {tavoli.map(t => {
                            const checked = assegnaTavoliIds.includes(t.id)
                            const occupato = !checked && appuntamenti.some(a => {
                              if (a.id === appCollegato.id || a.status === 'cancellato') return false
                              const usaTavolo = a.tavoloId === t.id || (() => { try { return (JSON.parse(a.tavoliIds ?? '[]') as string[]).includes(t.id) } catch { return false } })()
                              if (!usaTavolo) return false
                              const aStart = new Date(a.data).getTime()
                              return aStart < fineApp.getTime() && aStart + a.durata * 60000 > dataApp.getTime()
                            })
                            return (
                              <label key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                                occupato ? 'border-red-200 bg-red-50 cursor-not-allowed opacity-60'
                                : checked ? 'border-electric-blue/40 bg-electric-blue/10 cursor-pointer'
                                : 'border-ink-navy/10 hover:bg-mist cursor-pointer'
                              }`}>
                                <input type="checkbox" checked={checked} disabled={occupato}
                                  onChange={e => setAssegnaTavoliIds(prev => e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id))}
                                  className="accent-electric-blue w-4 h-4 shrink-0" />
                                <span className="text-sm text-ink-navy/70 flex-1">
                                  <span className="font-semibold">T{t.numero}</span>
                                  <span className="text-ink-navy/35"> · {t.posti} posti{t.note ? ` · ${t.note}` : ''}</span>
                                </span>
                                {occupato && <span className="text-xs text-red-500 font-medium">occupato</span>}
                              </label>
                            )
                          })}
                        </div>
                        {assegnaTavoliIds.length > 0 && (
                          <button
                            disabled={assegnaLoading}
                            onClick={async () => {
                              setAssegnaLoading(true)
                              await fetch(`/api/appuntamenti/${appCollegato.id}`, {
                                method: 'PATCH', credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ tavoliIds: assegnaTavoliIds }),
                              })
                              const d = await fetch('/api/appuntamenti', { credentials: 'include' }).then(r => r.json())
                              setAppuntamenti(d.appuntamenti ?? [])
                              setAssegnaTavoliIds([])
                              setAssegnaLoading(false)
                            }}
                            className="w-full bg-electric-blue text-white text-sm font-semibold py-2 rounded-lg hover:bg-electric-blue/90 disabled:opacity-50">
                            {assegnaLoading ? 'Salvataggio...' : `Assegna ${assegnaTavoliIds.length > 1 ? assegnaTavoliIds.length + ' tavoli' : 'tavolo'}`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Footer */}
              <div className="px-5 py-3 border-t border-ink-navy/8 flex gap-2">
                <button onClick={() => { setEditingRichiesta(selected); setSelected(null); setShowModal(true) }}
                  className="flex-1 text-sm text-electric-blue font-medium py-2 border border-electric-blue/25 rounded-lg hover:bg-electric-blue/10">
                  Gestisci
                </button>
                {selected.leadId && selected.status !== 'cliente_eliminato' && (
                  <button onClick={() => handleCancellaCliente(selected)}
                    className="flex-1 text-sm text-red-500 font-medium py-2 border border-red-200 rounded-lg hover:bg-red-50">
                    ✕ Cancella
                  </button>
                )}
                <button onClick={() => handleDelete(selected.id)}
                  className="text-sm text-ink-navy/40 font-medium py-2 px-3 border border-ink-navy/10 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors" title="Elimina definitivamente">
                  Elimina
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {proposta && <PropostaModificaModal richiesta={proposta} onClose={() => setProposta(null)} onInvia={handleInviaProposta} />}

      {confermaApp && (
        <ConfermaAppuntamentoModal
          richiesta={confermaApp}
          onClose={() => setConfermaApp(null)}
          onConferma={(d, o, s, dur, cop, all, occ, tids) => handleConfermaAppuntamento(d, o, s, dur, cop, all, occ, tids)}
        />
      )}
    </div>
  )
}

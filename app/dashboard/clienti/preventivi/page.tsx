'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

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
  tavoliIds?: string | null
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
  const dataMatch = note?.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)
  const oraMatch = note?.match(/DATA_ISO:\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/) ?? note?.match(/ORA_ISO:(\d{2}:\d{2})/)
  const copertiNote = note?.match(/Coperti:\s*(\d+)/)
  const allergieNote = note?.match(/Allergie:\s*([^.]+)/)
  const occasioneNote = note?.match(/Occasione:\s*([^.]+)/)
  const coperti = items[0]?.coperti ?? (copertiNote ? parseInt(copertiNote[1]) : null)
  const allergie = items[0]?.allergie ?? allergieNote?.[1]?.trim()
  const occasione = items[0]?.occasione ?? occasioneNote?.[1]?.trim()
  const noteClean = note?.replace(/DATA_ISO:\S+|ORA_ISO:\S+|Coperti:\s*\d+\.|Allergie:[^.]+\.|Occasione:[^.]+\.|Generato automaticamente via chat\.|Prenotazione[^.]+via[^.]+\.|Telefono:[^.]+\./g, '').trim()

  const dataFmt = dataMatch
    ? new Date(dataMatch[1] + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div className="divide-y divide-ink-navy/6">
      {/* Coperti — in evidenza */}
      {coperti != null && coperti > 0 && (
        <div className="flex gap-3 py-2.5">
          <span className="text-xs text-ink-navy/40 w-20 shrink-0 pt-0.5">Coperti</span>
          <span className="text-sm font-bold text-ink-navy">{coperti} {coperti === 1 ? 'persona' : 'persone'}</span>
        </div>
      )}
      {/* Data — bold */}
      {dataFmt && (
        <div className="flex gap-3 py-2.5">
          <span className="text-xs text-ink-navy/40 w-20 shrink-0 pt-0.5">Data</span>
          <span className="text-sm font-bold text-ink-navy capitalize">{dataFmt}</span>
        </div>
      )}
      {/* Orario — voce separata, in nero */}
      {oraMatch && (
        <div className="flex gap-3 py-2.5">
          <span className="text-xs text-ink-navy/40 w-20 shrink-0 pt-0.5">Orario</span>
          <span className="text-sm font-bold text-ink-navy">{oraMatch[1]}</span>
        </div>
      )}
      {/* Allergie */}
      {allergie && allergie.toLowerCase() !== 'nessuna' && (
        <div className="flex gap-3 py-2.5">
          <span className="text-xs text-ink-navy/40 w-20 shrink-0 pt-0.5">Allergie</span>
          <span className="text-sm font-medium text-red-600">{allergie}</span>
        </div>
      )}
      {/* Occasione */}
      {occasione && (
        <div className="flex gap-3 py-2.5">
          <span className="text-xs text-ink-navy/40 w-20 shrink-0 pt-0.5">Occasione</span>
          <span className="text-sm font-medium text-ink-navy">{occasione}</span>
        </div>
      )}
      {/* Note */}
      {noteClean && noteClean.length > 3 && (
        <div className="flex gap-3 py-2.5">
          <span className="text-xs text-ink-navy/40 w-20 shrink-0 pt-0.5">Note</span>
          <span className="text-sm font-medium text-ink-navy">{noteClean}</span>
        </div>
      )}
    </div>
  )
}

const TIPI: { id: string; label: string; color: string }[] = [
  { id: 'tutti', label: 'Tutte', color: 'bg-mist text-ink-navy/70' },
  { id: 'tavolo', label: 'Tavolo', color: 'bg-electric-blue/10 text-electric-blue' },
  { id: 'servizio', label: 'Servizio / Altro', color: 'bg-teal-100 text-teal-700' },
]

const STATUS_COLORS: Record<string, string> = {
  da_verificare: 'bg-amber-100 text-amber-700',
  lista_attesa: 'bg-orange-100 text-orange-700',
  lista_attesa_contattato: 'bg-blue-100 text-blue-700',
  bozza: 'bg-mist text-ink-navy/60',
  inviato: 'bg-blue-100 text-blue-700',
  accettato: 'bg-electric-blue/10 text-electric-blue',
  rifiutato: 'bg-red-100 text-red-600',
  cliente_eliminato: 'bg-red-50 text-red-400',
  concluso_completato: 'bg-emerald-100 text-emerald-700',
  concluso_cancellato: 'bg-red-100 text-red-600',
  concluso_no_show: 'bg-orange-100 text-orange-600',
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
  concluso_completato: 'Completato',
  concluso_cancellato: 'Cancellato',
  concluso_no_show: 'No-show',
}

const STATI_CONCLUSI = ['concluso_completato', 'concluso_cancellato', 'concluso_no_show']

function NuovaRichiestaModal({ onClose, onSave, initial, onAssegnaTavolo }: {
  onClose: () => void
  onSave: (data: object) => void
  initial?: Richiesta | null
  onAssegnaTavolo?: () => void
}) {
  const [clienteName, setClienteName] = useState(initial?.clienteName ?? '')
  const [clienteEmail, setClienteEmail] = useState(initial?.clienteEmail ?? '')
  const [tipo, setTipo] = useState(initial?.tipo ?? 'preventivo')
  const [note, setNote] = useState(initial?.note ?? '')
  const [items, setItems] = useState<Item[]>(
    initial ? JSON.parse(initial.items) : [{ descrizione: '', quantita: 1, prezzo: 0 }]
  )

  const isTavolo = initial?.tipo === 'tavolo'

  function addItem() { setItems([...items, { descrizione: '', quantita: 1, prezzo: 0 }]) }
  function updateItem(i: number, field: keyof Item, value: string | number) {
    setItems(items.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)) }
  const totale = items.reduce((sum, i) => sum + i.quantita * i.prezzo, 0)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-5 my-4 max-h-[90vh] overflow-y-auto">
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
          <button
            disabled={!clienteName.trim() || items.every(i => !i.descrizione)}
            onClick={() => {
              onSave({ clienteName, clienteEmail, tipo, items, note })
            }}
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

function ConfermaAppuntamentoModal({ richiesta, onClose, onConferma, initialTavoliIds }: {
  richiesta: Richiesta
  onClose: () => void
  onConferma: (data: string, ora: string, servizio: string, durata: number, coperti?: number, allergie?: string, occasione?: string, tavoliIds?: string[]) => void
  initialTavoliIds?: string[]
}) {
  const isTavolo = richiesta.tipo === 'tavolo'
  const items = JSON.parse(richiesta.items) as ItemExt[]
  const servizioDefault = isTavolo ? 'Prenotazione tavolo'
    : (items[0]?.descrizione ?? '')
  const dataMatch = richiesta.note?.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)
  const oraMatch = richiesta.note?.match(/DATA_ISO:\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/) ?? richiesta.note?.match(/ORA_ISO:(\d{2}:\d{2})/)
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
  const [selectedTavoliIds, setSelectedTavoliIds] = useState<string[]>(initialTavoliIds ?? [])
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

function MiniCalPrev({ value, max, onChange, onClose }: {
  value: string; max: string; onChange: (d: string) => void; onClose: () => void
}) {
  const [viewYear, setViewYear] = useState(() => parseInt(value.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => parseInt(value.slice(5, 7)) - 1)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  const mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
  const giorni = ['L','M','M','G','V','S','D']
  const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1))
  const lastDay = new Date(Date.UTC(viewYear, viewMonth + 1, 0))
  let startDow = firstDay.getUTCDay() - 1; if (startDow < 0) startDow = 6
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= lastDay.getUTCDate(); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  function prevM() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1) } else setViewMonth(m => m-1) }
  function nextM() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1) } else setViewMonth(m => m+1) }
  return (
    <div ref={ref} className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 bg-white rounded-2xl border border-ink-navy/10 shadow-xl p-3 w-64">
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevM} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-sm">‹</button>
        <span className="text-xs font-bold text-ink-navy">{mesi[viewMonth]} {viewYear}</span>
        <button onClick={nextM} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mist text-ink-navy/50 text-sm">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">{giorni.map((g,i) => <span key={i} className="text-center text-[10px] font-semibold text-ink-navy/30 py-0.5">{g}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />
          const k = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const isSel = k === value
          const isToday = k === new Date().toISOString().slice(0,10)
          return (
            <button key={i} onClick={() => { onChange(k); onClose() }}
              className={`h-8 w-full rounded-lg text-xs font-medium transition-colors ${isSel ? 'bg-electric-blue text-white font-bold' : isToday ? 'bg-electric-blue/10 text-electric-blue font-bold' : 'hover:bg-mist text-ink-navy'}`}>
              {day}
            </button>
          )
        })}
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
  const [prenotazioniAperte, setPrenotazioniAperte] = useState(true)
  const [dataFiltroAcc, setDataFiltroAcc] = useState(() => new Date().toISOString().slice(0, 10))
  const [calOpenAcc, setCalOpenAcc] = useState(false)
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
        const f = form as { items: Item[]; tavoliIds?: string; tipo?: string }
        const items = f.items
        const totale = items.reduce((sum, i) => sum + i.quantita * i.prezzo, 0)
        const nuovoStatus = editingRichiesta.status === 'da_verificare' && totale > 0 ? 'inviato' : undefined
        await fetch(`/api/preventivi/${editingRichiesta.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, items: JSON.stringify(items), totale, ...(nuovoStatus ? { status: nuovoStatus } : {}) }),
        })
        // Se è una richiesta tavolo con tavoliIds, delega tutto al server
        if (editingRichiesta.tipo === 'tavolo' && f.tavoliIds !== undefined) {
          const nuoviIds: string[] = (() => { try { return JSON.parse(f.tavoliIds ?? '[]') } catch { return [] } })()
          await fetch(`/api/preventivi/${editingRichiesta.id}/assegna-tavolo`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tavoliIds: nuoviIds }),
          })
        }
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
      await Promise.all([
        fetchRichieste(),
        fetch('/api/appuntamenti', { credentials: 'include' }).then(r => r.json()).then(d => setAppuntamenti(d.appuntamenti ?? [])),
      ])
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
          const indirizzoMatch = corrente.note?.match(/Indirizzo:\s*([^.]+)/)
          await fetch('/api/appuntamenti', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clienteNome: corrente.clienteName,
              clienteEmail: corrente.clienteEmail,
              servizio: items[0]?.descrizione ?? corrente.tipo,
              data: new Date(`${dataMatch[1]}T${ora}`).toISOString(),
              durata: 15,
              coperti: items[0]?.coperti ?? (copertiMatch ? Number(copertiMatch[1]) : 1),
              note: [items[0]?.descrizione, `Da richiesta #${String(corrente.numero).padStart(3, '0')}`].filter(Boolean).join('\n'),
              allergie: indirizzoMatch?.[1]?.trim() ?? null,
            }),
          })
          setSelected(null)
          await fetchRichieste()
          window.dispatchEvent(new Event('refresh-richieste-count'))
          return
        }

        // Tavolo con data già nota → pre-crea l'appuntamento senza tavolo
        // così appare subito in calendario (colonna "Non assegnati")
        if (isTavolo && dataMatch?.[1]) {
          const items = (() => { try { return JSON.parse(corrente.items) } catch { return [] } })()
          const ora = oraMatch?.[1] ?? '20:00'
          const copertiMatch = corrente.note?.match(/Coperti:\s*(\d+)/)
          await fetch('/api/appuntamenti', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clienteNome: corrente.clienteName,
              clienteEmail: corrente.clienteEmail,
              servizio: 'Prenotazione tavolo',
              data: new Date(`${dataMatch[1]}T${ora}`).toISOString(),
              durata: items[0]?.durata ?? 90,
              coperti: items[0]?.coperti ?? (copertiMatch ? Number(copertiMatch[1]) : 1),
              note: `Da richiesta #${String(corrente.numero).padStart(3, '0')}`,
            }),
          })
          const updated = await fetch('/api/appuntamenti', { credentials: 'include' }).then(r => r.json())
          setAppuntamenti(updated.appuntamenti ?? [])
        }

        // Apri modal per (eventuale) assegnazione tavolo
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
    const numStr = `#${String(confermaApp.numero).padStart(3, '0')}`

    // Se esiste già un appuntamento collegato, usa quello (evita duplicati)
    const appEsistente = appuntamenti.find(a => a.note?.includes(numStr))
    let appId: string | null = appEsistente?.id ?? null

    if (!appEsistente) {
      const res = await fetch('/api/appuntamenti', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNome: confermaApp.clienteName,
          clienteEmail: confermaApp.clienteEmail,
          servizio,
          data: new Date(`${data}T${ora}`).toISOString(),
          durata,
          note: `Da richiesta ${numStr}`,
          coperti,
          allergie,
          occasione,
        }),
      })
      if (res.ok) appId = (await res.json()).appuntamento?.id ?? null
    } else {
      // Aggiorna i campi del pre-created appuntamento con i dati confermati nel modal
      await fetch(`/api/appuntamenti/${appEsistente.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servizio,
          data: new Date(`${data}T${ora}`).toISOString(),
          durata,
          coperti,
          allergie,
          occasione,
        }),
      })
    }

    if (appId && tavoliIds && tavoliIds.length > 0) {
      const patchRes = await fetch(`/api/appuntamenti/${appId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tavoliIds }),
      })
      if (!patchRes.ok) console.error('[tavolo] PATCH fallito', await patchRes.text())
      else console.log('[tavolo] PATCH ok, appId:', appId, 'tavoliIds:', tavoliIds)
    } else {
      console.warn('[tavolo] PATCH saltato — appId:', appId, 'tavoliIds:', tavoliIds)
    }
    setConfermaApp(null)
    fetch('/api/appuntamenti', { credentials: 'include' }).then(r => r.json()).then(d => setAppuntamenti(d.appuntamenti ?? []))
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

  const isConcluso = (s: string) => STATI_CONCLUSI.includes(s)

  function getDataRichiesta(r: Richiesta): string | null {
    return r.note?.match(/DATA_ISO:(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  }
  function prevDay(k: string) { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10) }
  function nextDay(k: string) { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10) }
  function fmtGiorno(k: string) {
    const today = new Date().toISOString().slice(0,10)
    if (k === today) return 'Oggi'
    if (k === prevDay(today)) return 'Ieri'
    if (k === nextDay(today)) return 'Domani'
    return new Date(k + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const daVerificare = richieste.filter(r => r.status === 'da_verificare')
  const accettate = richieste.filter(r => r.status === 'accettato')
  const tutteNonDaVerificare = richieste.filter(r => r.status !== 'da_verificare')
  const tutteDelGiorno = tutteNonDaVerificare.filter(r => getDataRichiesta(r) === dataFiltroAcc)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-navy">Prenotazioni tavoli</h1>
        </div>
        <button onClick={() => setShowModal(true)}
          className="bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-electric-blue/90 transition-colors">
          + Nuova
        </button>
      </div>

      {loading ? (
        <div className="text-center text-ink-navy/35 py-12">Caricamento...</div>
      ) : (
        <div className="space-y-6">

          {/* ── DA VERIFICARE ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-electric-blue uppercase tracking-wider">Da verificare</span>
              {daVerificare.length > 0 && <span className="bg-electric-blue/10 text-electric-blue text-xs font-bold px-2 py-0.5 rounded-full">{daVerificare.length}</span>}
            </div>
            {daVerificare.length === 0 ? (
              <p className="text-sm text-ink-navy/30 py-3">Nessuna richiesta da verificare</p>
            ) : (
              <div className="bg-white border-2 border-electric-blue/25 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-electric-blue/5 border-b border-electric-blue/15">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-electric-blue uppercase tracking-wider">Cliente</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-electric-blue uppercase tracking-wider">Data</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-electric-blue uppercase tracking-wider">Orario</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-electric-blue uppercase tracking-wider">Coperti</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-electric-blue/10">
                    {daVerificare.map(r => {
                      const dataRes = getDataRichiesta(r)
                      const oraM = r.note?.match(/DATA_ISO:\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/) ?? r.note?.match(/ORA_ISO:(\d{2}:\d{2})/)
                      const copertiM = r.note?.match(/Coperti:\s*(\d+)/)
                      return (
                        <tr key={r.id} onClick={() => setSelected(r)} className="hover:bg-electric-blue/5 cursor-pointer transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-ink-navy">{r.clienteName}</p>
                            {r.clienteEmail && <p className="text-xs text-ink-navy/40">{r.clienteEmail}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {dataRes
                              ? <span className="text-base font-bold text-ink-navy capitalize">{new Date(dataRes+'T12:00:00Z').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'})}</span>
                              : <span className="text-ink-navy/40">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {oraM ? <span className="text-base font-bold text-ink-navy">{oraM[1]}</span> : <span className="text-ink-navy/40">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {copertiM
                              ? <span className="text-base font-bold text-ink-navy">{copertiM[1]} <span className="text-xs font-normal text-ink-navy/50">coperti</span></span>
                              : <span className="text-ink-navy/40">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── TUTTE LE PRENOTAZIONI (accettate + concluse) ── */}
          {tutteNonDaVerificare.length > 0 && (
            <div>
              <button onClick={() => setPrenotazioniAperte(v => !v)} className="w-full flex items-center gap-3 py-2 text-left group">
                <div className="h-px flex-1 bg-ink-navy/8" />
                <span className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wider group-hover:text-ink-navy/60 transition-colors flex items-center gap-1.5">
                  Prenotazioni
                  <span className="bg-mist text-ink-navy/40 px-2 py-0.5 rounded-full normal-case tracking-normal">{tutteNonDaVerificare.length}</span>
                  <span className="text-ink-navy/30">{prenotazioniAperte ? '▲' : '▼'}</span>
                </span>
                <div className="h-px flex-1 bg-ink-navy/8" />
              </button>

              {prenotazioniAperte && (
                <div className="mt-3 space-y-3">
                  {/* Navigazione data */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => setDataFiltroAcc(prevDay(dataFiltroAcc))}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:bg-mist transition-colors text-sm">‹</button>
                    <div className="flex-1 flex justify-center relative">
                      <button onClick={() => setCalOpenAcc(v => !v)}
                        className="text-sm font-semibold text-ink-navy py-1 px-3 rounded-lg border border-ink-navy/10 bg-white hover:bg-mist transition-colors select-none whitespace-nowrap">
                        {fmtGiorno(dataFiltroAcc)}
                        <span className="ml-1.5 text-ink-navy/30 text-xs">▾</span>
                      </button>
                      {calOpenAcc && (
                        <MiniCalPrev
                          value={dataFiltroAcc}
                          max={new Date(Date.now() + 180*24*3600*1000).toISOString().slice(0,10)}
                          onChange={d => setDataFiltroAcc(d)}
                          onClose={() => setCalOpenAcc(false)}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {dataFiltroAcc !== today && (
                        <button onClick={() => setDataFiltroAcc(today)}
                          className="text-xs text-electric-blue font-semibold px-2.5 py-1.5 rounded-lg border border-electric-blue/25 hover:bg-electric-blue/10 transition-colors">
                          Oggi
                        </button>
                      )}
                      <button onClick={() => setDataFiltroAcc(nextDay(dataFiltroAcc))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-navy/15 text-ink-navy/50 hover:bg-mist transition-colors text-sm">›</button>
                    </div>
                  </div>

                  {tutteDelGiorno.length === 0 ? (
                    <p className="text-sm text-ink-navy/30 text-center py-4">Nessuna prenotazione per {fmtGiorno(dataFiltroAcc).toLowerCase()}</p>
                  ) : (
                    <div className="bg-white border border-ink-navy/10 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-mist border-b border-ink-navy/10">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Cliente</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Ora</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Coperti</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Stato</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {tutteDelGiorno.map(r => {
                            const oraM = r.note?.match(/DATA_ISO:\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/) ?? r.note?.match(/ORA_ISO:(\d{2}:\d{2})/)
                            const copertiM = r.note?.match(/Coperti:\s*(\d+)/)
                            return (
                              <tr key={r.id} onClick={() => setSelected(r)} className="hover:bg-mist cursor-pointer transition-colors">
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-ink-navy">{r.clienteName}</p>
                                  {r.clienteEmail && <p className="text-xs text-ink-navy/40">{r.clienteEmail}</p>}
                                </td>
                                <td className="px-4 py-3"><span className="text-base font-bold text-ink-navy">{oraM?.[1] ?? '—'}</span></td>
                                <td className="px-4 py-3">{copertiM ? <span className="text-base font-bold text-ink-navy">{copertiM[1]} <span className="text-xs font-normal text-ink-navy/50">pers.</span></span> : <span className="text-ink-navy/40">—</span>}</td>
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
              )}
            </div>
          )}

        </div>
      )}

      {showModal && (
        <NuovaRichiestaModal
          onClose={() => { setShowModal(false); setEditingRichiesta(null) }}
          onSave={handleSave}
          initial={editingRichiesta}
          onAssegnaTavolo={editingRichiesta?.tipo === 'tavolo' ? () => {
            setShowModal(false)
            setConfermaApp(editingRichiesta)
          } : undefined}
        />
      )}

      {/* Dettaglio richiesta */}
      {selected && (() => {
        const t = TIPI.find(x => x.id === selected.tipo) ?? TIPI[1]
        const items = JSON.parse(selected.items) as Item[]
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style={{ maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="px-6 pt-5 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${t.color}`}>{t.label}</span>
                    <span className="text-xs text-ink-navy/30 font-mono">#{String(selected.numero).padStart(3, '0')}</span>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-ink-navy/25 hover:text-ink-navy/60 transition-colors p-1 -mr-1 -mt-1">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
                <h2 className="text-xl font-bold text-ink-navy mt-3">{selected.clienteName}</h2>
                {selected.clienteEmail && <p className="text-sm text-ink-navy/40 mt-0.5">{selected.clienteEmail}</p>}
              </div>

              <div className="overflow-y-auto flex-1">


                {/* Dettagli richiesta */}
                <div className="px-6 pb-2">
                  <SintesiRichiesta items={items} note={selected.note} />
                </div>

                {/* Voci con prezzo */}
                {(items.length > 1 || items[0]?.prezzo > 0) && (
                  <div className="px-6 pb-4 mt-2">
                    <div className="border border-ink-navy/8 rounded-xl overflow-hidden">
                      {items.map((item, i) => (
                        <div key={i} className="flex justify-between items-center px-4 py-2.5 border-b border-ink-navy/6 last:border-b-0">
                          <span className="text-sm text-ink-navy/70">{item.descrizione}{item.quantita > 1 ? ` × ${item.quantita}` : ''}</span>
                          <span className="text-sm font-medium text-ink-navy">
                            {item.prezzo > 0 ? `€ ${(item.quantita * item.prezzo).toFixed(2)}` : <span className="text-ink-navy/30 text-xs">—</span>}
                          </span>
                        </div>
                      ))}
                      {selected.totale > 0 && (
                        <div className="flex justify-between items-center px-4 py-2.5 bg-mist">
                          <span className="text-sm font-semibold text-ink-navy">Totale</span>
                          <span className="text-sm font-bold text-ink-navy">€ {selected.totale.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Azioni stato */}
                <div className="px-6 pb-5">
                  {isConcluso(selected.status) ? (
                    <div className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-center ${STATUS_COLORS[selected.status] ?? 'bg-mist text-ink-navy/60'}`}>
                      {STATUS_LABELS[selected.status] ?? selected.status}
                    </div>
                  ) : selected.status === 'da_verificare' ? (
                    <div className="space-y-2">
                      <button onClick={() => handleStatusChange(selected.id, 'accettato')}
                        className="w-full bg-green-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-green-700 transition-colors">
                        Accetta
                      </button>
                      <button onClick={() => { setProposta(selected); setSelected(null) }}
                        className="w-full bg-ink-navy/5 text-ink-navy text-sm font-medium py-2.5 rounded-lg hover:bg-ink-navy/10 transition-colors">
                        Proponi modifica
                      </button>
                      <button onClick={() => handleStatusChange(selected.id, 'rifiutato')}
                        className="w-full text-red-500 text-sm font-medium py-2 rounded-lg hover:bg-red-50 transition-colors">
                        Rifiuta
                      </button>
                    </div>
                  ) : selected.status === 'inviato' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-ink-navy/40 text-center pb-1">In attesa di risposta dal cliente</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleStatusChange(selected.id, 'accettato')}
                          className="flex-1 bg-green-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-green-700 transition-colors">
                          Accetta
                        </button>
                        <button onClick={() => handleStatusChange(selected.id, 'rifiutato')}
                          className="flex-1 border border-ink-navy/10 text-ink-navy/50 text-sm font-medium py-2 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
                          Rifiuta
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 flex-wrap">
                      {(selected.status === 'accettato'
                        ? (['accettato', 'concluso_completato', 'concluso_cancellato'] as const)
                        : (['bozza', 'inviato', 'accettato', 'rifiutato'] as const)
                      ).map(key => (
                        <button key={key} onClick={() => handleStatusChange(selected.id, key)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${selected.status === key ? STATUS_COLORS[key] : 'bg-mist text-ink-navy/50 hover:bg-ink-navy/8'}`}>
                          {STATUS_LABELS[key]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer — solo "Assegna tavolo" quando pertinente */}
              {selected.tipo === 'tavolo' && selected.status === 'accettato' && (
                <div className="px-6 py-4 border-t border-ink-navy/8">
                  <button onClick={() => { setSelected(null); setConfermaApp(selected) }}
                    className="w-full text-sm font-medium text-ink-navy py-2.5 rounded-lg border border-ink-navy/12 hover:bg-mist transition-colors flex items-center justify-center gap-2">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="7" width="18" height="4.5" rx="1.5" />
                      <path d="M6 11.5v9M18 11.5v9" />
                    </svg>
                    Assegna tavolo
                  </button>
                </div>
              )}

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
          initialTavoliIds={(() => { try { return JSON.parse(confermaApp.tavoliIds ?? '[]') as string[] } catch { return [] } })()}
        />
      )}
    </div>
  )
}

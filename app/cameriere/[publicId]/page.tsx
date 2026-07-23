'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Piatto { id: string; nome: string; descrizione: string | null; prezzo: number; immagineUrl: string | null }
interface Categoria { id: string; nome: string; piatti: Piatto[] }
interface Sala { id: string; nome: string }
interface Tavolo { id: string; numero: number; etichetta: string | null; salaId: string | null; posti: number; occupato: boolean }
interface Gruppo { id: string; label: string; tavoliIds: string[] }
interface RigaCarrello { piattoId: string; nome: string; prezzo: number; quantita: number; note: string }

interface DatiLocale {
  nomeLocale: string
  menuLogoUrl: string | null
  menuColoreP: string
  pinAttivo: boolean
  categorie: Categoria[]
  sale: Sala[]
  tavoli: Tavolo[]
  gruppi: Gruppo[]
}

export default function CamerierePage() {
  const { publicId } = useParams<{ publicId: string }>()
  const storageKey = `flowdesk-cam-${publicId}`

  const [dati, setDati] = useState<DatiLocale | null>(null)
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')

  const [step, setStep] = useState<'pin' | 'tavoli' | 'menu' | 'ok'>('tavoli')
  const [pinInput, setPinInput] = useState('')
  const [pinErrore, setPinErrore] = useState(false)
  const [verificandoPin, setVerificandoPin] = useState(false)

  const [selezionati, setSelezionati] = useState<number[]>([]) // numeri tavolo
  const [carrello, setCarrello] = useState<RigaCarrello[]>([])
  const [noteOrdine, setNoteOrdine] = useState('')
  const [catAttiva, setCatAttiva] = useState<string | null>(null)
  const [vistaCarrello, setVistaCarrello] = useState(false)
  const [inviando, setInviando] = useState(false)

  const coloreP = dati?.menuColoreP ?? '#4f46e5'

  const caricaDati = useCallback(async () => {
    const r = await fetch(`/api/cameriere?publicId=${publicId}`, { cache: 'no-store' })
    const d = await r.json()
    if (d.error) { setErrore(d.error); return null }
    setDati(d)
    if (d.categorie?.length > 0) setCatAttiva(d.categorie[0].id)
    return d as DatiLocale
  }, [publicId])

  // Verifica il PIN salvato sul dispositivo (persiste dopo il blocco schermo)
  const verificaPinSalvato = useCallback(async (pin: string) => {
    try {
      const r = await fetch('/api/cameriere/verifica-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId, pin }),
      })
      return r.ok
    } catch { return false }
  }, [publicId])

  useEffect(() => {
    (async () => {
      const d = await caricaDati()
      if (!d) { setLoading(false); return }
      if (d.pinAttivo) {
        const salvato = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
        if (salvato && await verificaPinSalvato(salvato)) {
          setStep('tavoli')
        } else {
          localStorage.removeItem(storageKey)
          setStep('pin')
        }
      } else {
        setStep('tavoli')
      }
      setLoading(false)
    })()
  }, [caricaDati, verificaPinSalvato, storageKey])

  async function inviaPin() {
    if (!pinInput.trim()) return
    setVerificandoPin(true); setPinErrore(false)
    const ok = await verificaPinSalvato(pinInput.trim())
    setVerificandoPin(false)
    if (ok) {
      localStorage.setItem(storageKey, pinInput.trim()) // resta memorizzato: niente reinserimento dopo il blocco schermo
      setPinInput('')
      setStep('tavoli')
    } else {
      setPinErrore(true)
    }
  }

  // Selezione tavoli: toccando un tavolo di un gruppo si seleziona/deseleziona tutto il gruppo (conto unito)
  function toggleTavolo(t: Tavolo) {
    const gruppo = dati?.gruppi.find(g => g.tavoliIds.includes(t.id))
    const numeriDaTogglare = gruppo
      ? dati!.tavoli.filter(x => gruppo.tavoliIds.includes(x.id)).map(x => x.numero)
      : [t.numero]
    setSelezionati(prev => {
      const giaDentro = numeriDaTogglare.every(n => prev.includes(n))
      if (giaDentro) return prev.filter(n => !numeriDaTogglare.includes(n))
      return [...new Set([...prev, ...numeriDaTogglare])]
    })
  }

  function aggiungi(piatto: Piatto) {
    setCarrello(prev => {
      const e = prev.find(r => r.piattoId === piatto.id)
      if (e) return prev.map(r => r.piattoId === piatto.id ? { ...r, quantita: r.quantita + 1 } : r)
      return [...prev, { piattoId: piatto.id, nome: piatto.nome, prezzo: piatto.prezzo, quantita: 1, note: '' }]
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
  const qty = (id: string) => carrello.find(r => r.piattoId === id)?.quantita ?? 0
  const totale = carrello.reduce((s, r) => s + r.prezzo * r.quantita, 0)
  const totaleArticoli = carrello.reduce((s, r) => s + r.quantita, 0)
  const labelTavoli = [...selezionati].sort((a, b) => a - b).join('+')

  async function inviaOrdine() {
    setInviando(true)
    try {
      const res = await fetch('/api/cameriere/ordina', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId, tavoli: selezionati, righe: carrello, note: noteOrdine }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Errore: ${err.error ?? res.status}`)
        return
      }
      setCarrello([]); setNoteOrdine(''); setVistaCarrello(false); setStep('ok')
    } catch {
      alert('Errore di connessione. Riprova.')
    } finally {
      setInviando(false)
    }
  }

  // ── Schermate ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400">Caricamento...</p></div>
  )
  if (errore) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow"><div className="text-4xl mb-3">⚠️</div><p className="text-gray-600">{errore}</p></div>
    </div>
  )

  if (step === 'pin') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-8 shadow-lg max-w-xs w-full text-center">
        {dati?.menuLogoUrl && <img src={dati.menuLogoUrl} alt="logo" className="h-12 w-12 rounded-xl object-cover mx-auto mb-3" />}
        <h1 className="font-bold text-gray-900 text-lg">{dati?.nomeLocale}</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">Inserisci il PIN cameriere</p>
        <input type="password" inputMode="numeric" autoFocus value={pinInput}
          onChange={e => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8)); setPinErrore(false) }}
          onKeyDown={e => e.key === 'Enter' && inviaPin()}
          className={`w-full text-center tracking-[0.5em] text-xl border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 ${pinErrore ? 'border-red-300 focus:ring-red-300' : 'border-gray-300'}`}
          placeholder="••••" style={{ '--tw-ring-color': coloreP } as any} />
        {pinErrore && <p className="text-xs text-red-500 mt-2">PIN errato</p>}
        <button onClick={inviaPin} disabled={verificandoPin || !pinInput}
          className="mt-5 w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50" style={{ backgroundColor: coloreP }}>
          {verificandoPin ? 'Verifica...' : 'Entra'}
        </button>
      </div>
    </div>
  )

  if (step === 'ok') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-10 text-center shadow-lg max-w-sm w-full">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-900">Ordine inviato!</h2>
        <p className="text-gray-500 text-sm mt-2">Tavolo {labelTavoli} — inviato in cucina.</p>
        <button onClick={() => setStep('menu')} className="mt-6 w-full py-3 rounded-xl text-white font-semibold" style={{ backgroundColor: coloreP }}>
          Ordina ancora per il tavolo {labelTavoli}
        </button>
        <button onClick={async () => { setSelezionati([]); await caricaDati(); setStep('tavoli') }}
          className="mt-2 w-full py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold">
          Cambia tavolo
        </button>
      </div>
    </div>
  )

  // ── STEP TAVOLI ──
  if (step === 'tavoli') {
    const tavoli = dati?.tavoli ?? []
    const sale = dati?.sale ?? []
    const senzaSala = tavoli.filter(t => !t.salaId)
    const gruppiLabelById = new Map<string, string>()
    dati?.gruppi.forEach(g => g.tavoliIds.forEach(id => gruppiLabelById.set(id, g.label)))

    const renderTavolo = (t: Tavolo) => {
      const sel = selezionati.includes(t.numero)
      const grpLabel = gruppiLabelById.get(t.id)
      return (
        <button key={t.id} onClick={() => toggleTavolo(t)}
          className={`relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${sel ? 'text-white shadow-md' : 'bg-white text-gray-800'}`}
          style={sel ? { backgroundColor: coloreP, borderColor: coloreP } : { borderColor: t.occupato ? '#fca5a5' : '#e5e7eb' }}>
          <span className="text-xl font-bold">{t.numero}</span>
          {t.etichetta && <span className={`text-[10px] ${sel ? 'text-white/80' : 'text-gray-400'}`}>{t.etichetta}</span>}
          <span className={`text-[10px] mt-0.5 ${sel ? 'text-white/80' : t.occupato ? 'text-red-500' : 'text-gray-400'}`}>
            {t.occupato ? '● occupato' : `${t.posti} posti`}
          </span>
          {grpLabel && <span className={`absolute top-1 right-1 text-[9px] px-1 rounded ${sel ? 'bg-white/25' : 'bg-gray-100 text-gray-500'}`}>🔗{grpLabel}</span>}
        </button>
      )
    }

    return (
      <div className="min-h-screen bg-gray-50 pb-28">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            {dati?.menuLogoUrl && <img src={dati.menuLogoUrl} alt="logo" className="h-8 w-8 rounded-lg object-cover" />}
            <div className="flex-1">
              <h1 className="font-bold text-gray-900 text-base">{dati?.nomeLocale}</h1>
              <p className="text-xs text-gray-400">Seleziona uno o più tavoli</p>
            </div>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 py-4 space-y-6">
          {tavoli.length === 0 && <p className="text-gray-400 text-sm text-center py-10">Nessun tavolo configurato nel gestionale.</p>}
          {sale.map(s => {
            const tv = tavoli.filter(t => t.salaId === s.id)
            if (tv.length === 0) return null
            return (
              <div key={s.id}>
                <h2 className="text-sm font-bold text-gray-700 mb-2">{s.nome}</h2>
                <div className="grid grid-cols-4 gap-2">{tv.map(renderTavolo)}</div>
              </div>
            )
          })}
          {senzaSala.length > 0 && (
            <div>
              {sale.length > 0 && <h2 className="text-sm font-bold text-gray-700 mb-2">Altri tavoli</h2>}
              <div className="grid grid-cols-4 gap-2">{senzaSala.map(renderTavolo)}</div>
            </div>
          )}
        </div>

        {selezionati.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
            <div className="max-w-lg mx-auto">
              {selezionati.length > 1 && <p className="text-xs text-center text-gray-500 mb-2">🔗 {selezionati.length} tavoli — i conti verranno uniti</p>}
              <button onClick={() => setStep('menu')} className="w-full py-3.5 rounded-2xl text-white font-bold shadow-md" style={{ backgroundColor: coloreP }}>
                Prendi ordine — Tavolo {labelTavoli}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── STEP MENU (identico al cliente) ──
  const categorie = dati?.categorie ?? []
  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('tavoli')} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
          {dati?.menuLogoUrl && <img src={dati.menuLogoUrl} alt="logo" className="h-8 w-8 rounded-lg object-cover" />}
          <div className="flex-1">
            <h1 className="font-bold text-gray-900 text-base">{dati?.nomeLocale}</h1>
            <p className="text-xs text-gray-400">Tavolo {labelTavoli}</p>
          </div>
        </div>
        {categorie.length > 1 && (
          <div className="flex gap-1 px-4 pb-2 overflow-x-auto scrollbar-hide">
            {categorie.map(cat => (
              <button key={cat.id} onClick={() => { setCatAttiva(cat.id); document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${catAttiva === cat.id ? 'text-white' : 'bg-gray-100 text-gray-600'}`}
                style={catAttiva === cat.id ? { backgroundColor: coloreP } : {}}>
                {cat.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-8">
        {categorie.map(cat => (
          <div key={cat.id} id={`cat-${cat.id}`}>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{cat.nome}</h2>
            <div className="space-y-3">
              {cat.piatti.map(p => {
                const q = qty(p.id)
                return (
                  <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="flex gap-3 p-3">
                      {p.immagineUrl && <img src={p.immagineUrl} alt={p.nome} className="w-20 h-20 rounded-xl object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{p.nome}</p>
                        {p.descrizione && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{p.descrizione}</p>}
                        <div className="flex items-center justify-between mt-2">
                          <p className="font-bold text-base" style={{ color: coloreP }}>€{p.prezzo.toFixed(2)}</p>
                          {q === 0 ? (
                            <button onClick={() => aggiungi(p)} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm" style={{ backgroundColor: coloreP }}>+</button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => rimuovi(p.id)} className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-lg" style={{ borderColor: coloreP, color: coloreP }}>−</button>
                              <span className="font-bold text-gray-900 w-4 text-center">{q}</span>
                              <button onClick={() => aggiungi(p)} className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: coloreP }}>+</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {totaleArticoli > 0 && !vistaCarrello && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-lg mx-auto">
            <button onClick={() => setVistaCarrello(true)} className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-between px-5 shadow-md" style={{ backgroundColor: coloreP }}>
              <span className="bg-white/20 rounded-lg px-2 py-0.5 text-sm">{totaleArticoli}</span>
              <span>Vedi ordine</span>
              <span>€{totale.toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}

      {vistaCarrello && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end items-center bg-black/40">
          <div className="bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Ordine — Tavolo {labelTavoli}</h2>
              <button onClick={() => setVistaCarrello(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
              {carrello.map(r => (
                <div key={r.piattoId} className="flex items-center justify-between gap-3">
                  <div className="flex-1"><p className="font-medium text-gray-900 text-sm">{r.nome}</p><p className="text-gray-500 text-xs">€{r.prezzo.toFixed(2)} cad.</p></div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => rimuovi(r.piattoId)} className="w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold" style={{ borderColor: coloreP, color: coloreP }}>−</button>
                    <span className="font-bold text-gray-900 w-4 text-center text-sm">{r.quantita}</span>
                    <button onClick={() => aggiungi({ id: r.piattoId, nome: r.nome, prezzo: r.prezzo, descrizione: null, immagineUrl: null })} className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: coloreP }}>+</button>
                  </div>
                  <p className="font-bold text-gray-900 text-sm w-14 text-right">€{(r.prezzo * r.quantita).toFixed(2)}</p>
                </div>
              ))}
              <div className="pt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Note per la cucina</label>
                <textarea value={noteOrdine} onChange={e => setNoteOrdine(e.target.value)} placeholder="Allergie, preferenze, richieste speciali..." rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none" style={{ '--tw-ring-color': coloreP } as any} />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <div className="flex justify-between mb-3"><span className="font-semibold text-gray-700">Totale</span><span className="font-bold text-xl text-gray-900">€{totale.toFixed(2)}</span></div>
              <button onClick={inviaOrdine} disabled={inviando} className="w-full py-3.5 rounded-2xl text-white font-bold text-base disabled:opacity-50" style={{ backgroundColor: coloreP }}>
                {inviando ? 'Invio in corso...' : `🍽️ Invia ordine — Tavolo ${labelTavoli}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

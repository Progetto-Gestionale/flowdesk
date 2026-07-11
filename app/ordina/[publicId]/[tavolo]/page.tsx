'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Piatto {
  id: string
  nome: string
  descrizione: string | null
  prezzo: number
  immagineUrl: string | null
}

interface Categoria {
  id: string
  nome: string
  piatti: Piatto[]
}

interface RigaCarrello {
  piattoId: string
  nome: string
  prezzo: number
  quantita: number
  note: string
}

export default function OrdinaPage() {
  const { publicId, tavolo } = useParams<{ publicId: string; tavolo: string }>()
  const [nomeLocale, setNomeLocale] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [coloreP, setColoreP] = useState('#4f46e5')
  const [categorie, setCategorie] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')

  const [carrello, setCarrello] = useState<RigaCarrello[]>([])
  const [noteOrdine, setNoteOrdine] = useState('')
  const [vistaCarrello, setVistaCarrello] = useState(false)
  const [inviando, setInviando] = useState(false)
  const [ordinato, setOrdinato] = useState(false)
  const [cattivaId, setCattivaid] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/ordina?publicId=${publicId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrore(d.error); return }
        setNomeLocale(d.user.nomeLocale ?? 'Menu')
        setLogoUrl(d.user.menuLogoUrl)
        setColoreP(d.user.menuColoreP ?? '#4f46e5')
        setCategorie(d.user.menuCategorie ?? [])
        if (d.user.menuCategorie?.length > 0) setCattivaid(d.user.menuCategorie[0].id)
      })
      .catch(() => setErrore('Errore di connessione'))
      .finally(() => setLoading(false))
  }, [publicId])

  function aggiungiAlCarrello(piatto: Piatto) {
    setCarrello(prev => {
      const esiste = prev.find(r => r.piattoId === piatto.id)
      if (esiste) return prev.map(r => r.piattoId === piatto.id ? { ...r, quantita: r.quantita + 1 } : r)
      return [...prev, { piattoId: piatto.id, nome: piatto.nome, prezzo: piatto.prezzo, quantita: 1, note: '' }]
    })
  }

  function rimuoviDalCarrello(piattoId: string) {
    setCarrello(prev => {
      const riga = prev.find(r => r.piattoId === piattoId)
      if (!riga) return prev
      if (riga.quantita === 1) return prev.filter(r => r.piattoId !== piattoId)
      return prev.map(r => r.piattoId === piattoId ? { ...r, quantita: r.quantita - 1 } : r)
    })
  }

  function quantitaInCarrello(piattoId: string) {
    return carrello.find(r => r.piattoId === piattoId)?.quantita ?? 0
  }

  const totale = carrello.reduce((s, r) => s + r.prezzo * r.quantita, 0)
  const totaleArticoli = carrello.reduce((s, r) => s + r.quantita, 0)

  async function inviaOrdine() {
    setInviando(true)
    await fetch('/api/ordina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId, tavolo, righe: carrello, note: noteOrdine }),
    })
    setInviando(false)
    setOrdinato(true)
    setCarrello([])
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400">Caricamento menu...</p>
    </div>
  )

  if (errore) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-gray-600">{errore}</p>
      </div>
    </div>
  )

  if (ordinato) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-10 text-center shadow-lg max-w-sm w-full">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-900">Ordine inviato!</h2>
        <p className="text-gray-500 text-sm mt-2">Il tuo ordine è stato ricevuto.</p>
        <button onClick={() => { setOrdinato(false); setVistaCarrello(false); setNoteOrdine('') }}
          className="mt-6 w-full py-2.5 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: coloreP }}>
          Ordina ancora
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          {logoUrl && <img src={logoUrl} alt="logo" className="h-8 w-8 rounded-lg object-cover" />}
          <div className="flex-1">
            <h1 className="font-bold text-gray-900 text-base">{nomeLocale}</h1>
            <p className="text-xs text-gray-400">Tavolo {tavolo}</p>
          </div>
        </div>
        {/* Tab categorie */}
        {categorie.length > 1 && (
          <div className="flex gap-1 px-4 pb-2 overflow-x-auto scrollbar-hide">
            {categorie.map(cat => (
              <button key={cat.id} onClick={() => {
                setCattivaid(cat.id)
                document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${cattivaId === cat.id ? 'text-white' : 'bg-gray-100 text-gray-600'}`}
                style={cattivaId === cat.id ? { backgroundColor: coloreP } : {}}>
                {cat.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Menu */}
      <div className="max-w-lg mx-auto px-4 py-4 space-y-8">
        {categorie.map(cat => (
          <div key={cat.id} id={`cat-${cat.id}`}>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{cat.nome}</h2>
            <div className="space-y-3">
              {cat.piatti.map(p => {
                const qty = quantitaInCarrello(p.id)
                return (
                  <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="flex gap-3 p-3">
                      {p.immagineUrl && (
                        <img src={p.immagineUrl} alt={p.nome} className="w-20 h-20 rounded-xl object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{p.nome}</p>
                        {p.descrizione && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{p.descrizione}</p>}
                        <div className="flex items-center justify-between mt-2">
                          <p className="font-bold text-base" style={{ color: coloreP }}>€{p.prezzo.toFixed(2)}</p>
                          {qty === 0 ? (
                            <button onClick={() => aggiungiAlCarrello(p)}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm"
                              style={{ backgroundColor: coloreP }}>+</button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => rimuoviDalCarrello(p.id)}
                                className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-lg"
                                style={{ borderColor: coloreP, color: coloreP }}>−</button>
                              <span className="font-bold text-gray-900 w-4 text-center">{qty}</span>
                              <button onClick={() => aggiungiAlCarrello(p)}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-lg"
                                style={{ backgroundColor: coloreP }}>+</button>
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

      {/* Bottone carrello fisso in basso */}
      {totaleArticoli > 0 && !vistaCarrello && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-lg mx-auto">
            <button onClick={() => setVistaCarrello(true)}
              className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-between px-5 shadow-md"
              style={{ backgroundColor: coloreP }}>
              <span className="bg-white/20 rounded-lg px-2 py-0.5 text-sm">{totaleArticoli}</span>
              <span>Vedi ordine</span>
              <span>€{totale.toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Sheet carrello */}
      {vistaCarrello && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end items-center bg-black/40">
          <div className="bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Il tuo ordine</h2>
              <button onClick={() => setVistaCarrello(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
              {carrello.map(r => (
                <div key={r.piattoId} className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{r.nome}</p>
                    <p className="text-gray-500 text-xs">€{r.prezzo.toFixed(2)} cad.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => rimuoviDalCarrello(r.piattoId)}
                      className="w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold"
                      style={{ borderColor: coloreP, color: coloreP }}>−</button>
                    <span className="font-bold text-gray-900 w-4 text-center text-sm">{r.quantita}</span>
                    <button onClick={() => aggiungiAlCarrello({ id: r.piattoId, nome: r.nome, prezzo: r.prezzo, descrizione: null, immagineUrl: null })}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: coloreP }}>+</button>
                  </div>
                  <p className="font-bold text-gray-900 text-sm w-14 text-right">€{(r.prezzo * r.quantita).toFixed(2)}</p>
                </div>
              ))}
              <div className="pt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Note per la cucina</label>
                <textarea value={noteOrdine} onChange={e => setNoteOrdine(e.target.value)}
                  placeholder="Allergie, preferenze, richieste speciali..."
                  rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                  style={{ '--tw-ring-color': coloreP } as any} />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <div className="flex justify-between mb-3">
                <span className="font-semibold text-gray-700">Totale</span>
                <span className="font-bold text-xl text-gray-900">€{totale.toFixed(2)}</span>
              </div>
              <button onClick={inviaOrdine} disabled={inviando}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-base disabled:opacity-50"
                style={{ backgroundColor: coloreP }}>
                {inviando ? 'Invio in corso...' : '🍽️ Invia ordine al tavolo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

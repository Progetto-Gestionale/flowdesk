'use client'
import { useEffect, useRef, useState } from 'react'
import { use } from 'react'

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
}

interface DatiCheckout {
  tipo: 'asporto' | 'delivery'
  nome: string
  cognome: string
  email: string
  telefono: string
  data: string
  ora: string
  via: string
  cap: string
  citta: string
  noteCliente: string
}

export default function MenuAsportoPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = use(params)

  const [nomeLocale, setNomeLocale] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [coloreP, setColoreP] = useState('#4f46e5')
  const [categorie, setCategorie] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [cattivaId, setCattivaId] = useState<string | null>(null)
  const [blockAsporto, setBlockAsporto] = useState(false)
  const [blockDelivery, setBlockDelivery] = useState(false)
  const [orariApertura, setOrariApertura] = useState<Record<string, string>>({})
  const [turniServizio, setTurniServizio] = useState<{ id: string; nome: string; oraInizio: string; oraFine: string }[]>([])
  const [regole, setRegole] = useState<{ preavvisoOrdiniMinMinuti?: number; anticipoMaxGiorni?: number; fasceOrdini?: string }>({})

  const [carrello, setCarrello] = useState<RigaCarrello[]>([])
  const [step, setStep] = useState<'menu' | 'checkout' | 'inviato'>('menu')
  const [inviando, setInviando] = useState(false)
  const [numeroOrdine, setNumeroOrdine] = useState<number | null>(null)
  const [errIndirizzo, setErrIndirizzo] = useState('')
  const [suggerimenti, setSuggerimenti] = useState<any[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function cercaIndirizzo(via: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (via.length < 4) { setSuggerimenti([]); return }
    debounceRef.current = setTimeout(async () => {
      const q = encodeURIComponent(`${via}${dati.citta ? ', ' + dati.citta : ''}, Italia`)
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5&countrycodes=it&addressdetails=1`, {
        headers: { 'Accept-Language': 'it', 'User-Agent': 'Flowest/1.0' },
      }).catch(() => null)
      if (!res) return
      const data = await res.json().catch(() => [])
      setSuggerimenti(data ?? [])
    }, 400)
  }

  function selezionaSuggerimento(s: any) {
    const a = s.address ?? {}
    const strada = a.road ?? a.pedestrian ?? a.footway ?? a.residential ?? a.path ?? a.name ?? s.display_name.split(',')[0] ?? ''
    const via = [strada, a.house_number ?? ''].filter(Boolean).join(' ')
    const cap = (a.postcode ?? '').replace(/\s/g, '').slice(0, 5)
    const citta = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? ''
    setDati(d => ({ ...d, via, cap, citta }))
    setSuggerimenti([])
    setErrIndirizzo('')
  }

  const oggi = (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}` })()
  const [dati, setDati] = useState<DatiCheckout>({
    tipo: 'asporto',
    nome: '', cognome: '', email: '', telefono: '',
    data: oggi, ora: '', via: '', cap: '', citta: '', noteCliente: '',
  })

  useEffect(() => {
    fetch(`/api/public/menu?publicId=${publicId}&tipo=asporto`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrore(d.error); return }
        setNomeLocale(d.nomeLocale ?? 'Menu')
        setLogoUrl(d.menuLogoUrl ?? null)
        setColoreP(d.menuColoreP ?? '#4f46e5')
        setCategorie(d.categorie ?? [])
        if (d.categorie?.length > 0) setCattivaId(d.categorie[0].id)
        setBlockAsporto(d.blockAsporto ?? false)
        setBlockDelivery(d.blockDelivery ?? false)
      })
      .catch(() => setErrore('Errore di connessione'))
      .finally(() => setLoading(false))
    fetch(`/api/public/info?publicId=${publicId}`)
      .then(r => r.json())
      .then(d => {
        try { setOrariApertura(JSON.parse(d.orariApertura ?? '{}')) } catch {}
        try { setTurniServizio(JSON.parse(d.turniServizio ?? '[]')) } catch {}
        try {
          const r = JSON.parse(d.regolePrenotazione ?? '{}')
          setRegole({
            preavvisoOrdiniMinMinuti: r.preavvisoOrdiniMinMinuti ? Number(r.preavvisoOrdiniMinMinuti) : undefined,
            anticipoMaxGiorni: r.anticipoMaxGiorni ? Number(r.anticipoMaxGiorni) : undefined,
            fasceOrdini: r.fasceOrdini || undefined,
          })
        } catch {}
      }).catch(() => {})
  }, [publicId])

  function aggiungi(piatto: Piatto) {
    setCarrello(prev => {
      const e = prev.find(r => r.piattoId === piatto.id)
      if (e) return prev.map(r => r.piattoId === piatto.id ? { ...r, quantita: r.quantita + 1 } : r)
      return [...prev, { piattoId: piatto.id, nome: piatto.nome, prezzo: piatto.prezzo, quantita: 1 }]
    })
  }

  function rimuovi(piattoId: string) {
    setCarrello(prev => {
      const r = prev.find(r => r.piattoId === piattoId)
      if (!r) return prev
      if (r.quantita === 1) return prev.filter(r => r.piattoId !== piattoId)
      return prev.map(r => r.piattoId === piattoId ? { ...r, quantita: r.quantita - 1 } : r)
    })
  }

  const qty = (id: string) => carrello.find(r => r.piattoId === id)?.quantita ?? 0
  const totale = carrello.reduce((s, r) => s + r.prezzo * r.quantita, 0)
  const totArticoli = carrello.reduce((s, r) => s + r.quantita, 0)

  const capValido = dati.cap === '' || /^\d{5}$/.test(dati.cap)
  const checkoutValido = dati.nome && dati.email && dati.data && dati.ora &&
    (dati.tipo === 'asporto' || (dati.via && dati.cap && /^\d{5}$/.test(dati.cap) && dati.citta))

  const GIORNI_KEY = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

  function fascePer(dataStr: string): { inizio: string; fine: string }[] {
    if (!dataStr) return []
    const dow = new Date(dataStr + 'T12:00:00').getDay()
    const chiave = GIORNI_KEY[dow]
    if (turniServizio.length > 0) return turniServizio.map(t => ({ inizio: t.oraInizio, fine: t.oraFine }))
    const orarioGiorno = orariApertura[chiave]
    if (!orarioGiorno) return []
    return orarioGiorno.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const [inizio, fine] = s.split('-').map(t => t.trim())
      return { inizio: inizio ?? '', fine: fine ?? '' }
    }).filter(f => f.inizio && f.fine)
  }

  function oraInFasce(ora: string, fasce: { inizio: string; fine: string }[]): boolean {
    if (fasce.length === 0) return true
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const o = toMin(ora)
    return fasce.some(f => {
      const start = toMin(f.inizio)
      let end = toMin(f.fine)
      if (end === 0) end = 24 * 60 // "00:00" indica la mezzanotte di fine giornata
      if (end >= start) return o >= start && o <= end // fascia normale
      return o >= start || o <= end // fascia che scavalca la mezzanotte (es. 18:00–02:00)
    })
  }

  function minOraPerData(dataStr: string): string {
    if (dataStr !== oggi) return ''
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }

  function validaDataOra(dataStr: string, oraStr: string, preavvisoMinuti?: number, anticipoMaxGiorni?: number): string | null {
    const ora = new Date(`${dataStr}T${oraStr}:00`)
    const now = new Date()
    if (ora <= now) return "L'orario selezionato è già passato."
    if (preavvisoMinuti && preavvisoMinuti > 0) {
      const minConsentita = new Date(now.getTime() + preavvisoMinuti * 60000)
      if (ora < minConsentita) {
        const label = preavvisoMinuti < 60
          ? `${preavvisoMinuti} minuti`
          : preavvisoMinuti % 60 === 0
            ? `${preavvisoMinuti / 60} ${preavvisoMinuti / 60 === 1 ? 'ora' : 'ore'}`
            : `${Math.floor(preavvisoMinuti / 60)}h ${preavvisoMinuti % 60}min`
        return `Richiediamo almeno ${label} di preavviso.`
      }
    }
    if (anticipoMaxGiorni && anticipoMaxGiorni > 0) {
      const maxConsentita = new Date(now.getTime() + anticipoMaxGiorni * 86400000)
      if (ora > maxConsentita) return `Si può ordinare al massimo ${anticipoMaxGiorni} giorni in anticipo.`
    }
    return null
  }

  function fascePerOrdini(): { inizio: string; fine: string }[] {
    if (regole.fasceOrdini) {
      return regole.fasceOrdini.split(',').map(s => s.trim()).filter(Boolean).map(s => {
        const [inizio, fine] = s.split('-').map(t => t.trim())
        return { inizio: inizio ?? '', fine: fine ?? '' }
      }).filter(f => f.inizio && f.fine)
    }
    return fascePer(dati.data)
  }

  async function inviaOrdine() {
    if (!checkoutValido) return
    setErrIndirizzo('')
    // Blocca date/orari passati e fuori preavviso
    if (dati.data < oggi) { setErrIndirizzo('La data selezionata è già passata.'); return }
    const errDataOra = validaDataOra(dati.data, dati.ora, regole.preavvisoOrdiniMinMinuti, regole.anticipoMaxGiorni)
    if (errDataOra) { setErrIndirizzo(errDataOra); return }
    // Blocca orari fuori fasce ordini (o apertura come fallback)
    const fasceOrdine = fascePerOrdini()
    if (fasceOrdine.length > 0 && !oraInFasce(dati.ora, fasceOrdine)) {
      setErrIndirizzo(`Orario non disponibile. Ordini accettati: ${fasceOrdine.map(f => `${f.inizio}–${f.fine}`).join(', ')}.`)
      return
    }
    setInviando(true)
    try {
      if (dati.tipo === 'delivery') {
        const q = encodeURIComponent(`${dati.via}, ${dati.cap} ${dati.citta}, Italia`)
        const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=it&addressdetails=1`, {
          headers: { 'Accept-Language': 'it', 'User-Agent': 'Flowest/1.0' },
        }).then(r => r.json()).catch(() => [])
        if (!geo || geo.length === 0) {
          setErrIndirizzo('Indirizzo non trovato. Controlla via, CAP e città.')
          setInviando(false)
          return
        }
        const capRitornato = geo[0]?.address?.postcode?.replace(/\s/g, '')
        if (capRitornato && capRitornato !== dati.cap) {
          setErrIndirizzo(`CAP non corretto per questo indirizzo (CAP atteso: ${capRitornato}).`)
          setInviando(false)
          return
        }
      }
      const res = await fetch('/api/public/ordina', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId, ...dati, indirizzo: dati.via ? `${dati.via}, ${dati.cap} ${dati.citta}`.trim() : '', righe: carrello }),
      })
      const json = await res.json()
      if (res.ok) {
        setNumeroOrdine(json.numero)
        setStep('inviato')
        setCarrello([])
      }
    } finally {
      setInviando(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400">Caricamento menu...</p>
    </div>
  )

  if (errore) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow">
        <p className="text-gray-600">{errore}</p>
      </div>
    </div>
  )

  if (step === 'inviato') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-10 text-center shadow-lg max-w-sm w-full">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-900">Ordine ricevuto!</h2>
        <p className="text-gray-500 text-sm mt-3">Il tuo ordine è stato registrato. Lo troverai pronto all'orario indicato.</p>
        <button onClick={() => { setStep('menu'); setDati(d => ({ ...d, nome: '', cognome: '', email: '', telefono: '', noteCliente: '' })) }}
          className="mt-6 w-full py-2.5 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: coloreP }}>
          Fai un altro ordine
        </button>
      </div>
    </div>
  )

  const Header = () => (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
        {step === 'checkout' && (
          <button onClick={() => setStep('menu')} className="text-gray-400 hover:text-gray-600 text-xl mr-1">←</button>
        )}
        {logoUrl && <img src={logoUrl} alt="logo" className="h-8 w-8 rounded-lg object-cover" />}
        <div className="flex-1">
          <h1 className="font-bold text-gray-900 text-base">{nomeLocale}</h1>
          <p className="text-xs text-gray-400">{step === 'checkout' ? 'Completa il tuo ordine' : 'Asporto & Delivery'}</p>
        </div>
      </div>
      {step === 'menu' && categorie.length > 1 && (
        <div className="flex gap-1 px-4 pb-2 overflow-x-auto scrollbar-hide">
          {categorie.map(cat => (
            <button key={cat.id} onClick={() => {
              setCattivaId(cat.id)
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
  )

  const entrambiBloccati = blockAsporto && blockDelivery
  const soloAsportoBloccato = blockAsporto && !blockDelivery
  const soloDeliveryBloccato = !blockAsporto && blockDelivery

  // ── Step menu ──
  if (step === 'menu') return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <Header />
      {entrambiBloccati && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 text-center">
            <p className="text-2xl mb-1">🚫</p>
            <p className="font-semibold text-red-800 text-sm">Servizio non disponibile</p>
            <p className="text-red-600 text-xs mt-1">Asporto e delivery sono temporaneamente sospesi.</p>
          </div>
        </div>
      )}
      {soloAsportoBloccato && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <p className="text-orange-800 text-sm"><strong>Asporto sospeso.</strong> Puoi ordinare solo in delivery.</p>
          </div>
        </div>
      )}
      {soloDeliveryBloccato && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <p className="text-orange-800 text-sm"><strong>Delivery sospeso.</strong> Puoi ordinare solo in asporto.</p>
          </div>
        </div>
      )}
      <div className="max-w-lg mx-auto px-4 py-4 space-y-8">
        {categorie.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm">Menu non ancora disponibile</p>
          </div>
        ) : categorie.map(cat => (
          <div key={cat.id} id={`cat-${cat.id}`}>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{cat.nome}</h2>
            <div className="space-y-3">
              {cat.piatti.map(p => {
                const q = qty(p.id)
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
                          {q === 0 ? (
                            <button onClick={() => aggiungi(p)}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm"
                              style={{ backgroundColor: coloreP }}>+</button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => rimuovi(p.id)}
                                className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-lg"
                                style={{ borderColor: coloreP, color: coloreP }}>−</button>
                              <span className="font-bold text-gray-900 w-4 text-center">{q}</span>
                              <button onClick={() => aggiungi(p)}
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

      {totArticoli > 0 && !entrambiBloccati && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-lg mx-auto">
            <button onClick={() => setStep('checkout')}
              className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-between px-5 shadow-md"
              style={{ backgroundColor: coloreP }}>
              <span className="bg-white/20 rounded-lg px-2 py-0.5 text-sm">{totArticoli}</span>
              <span>Procedi con l'ordine</span>
              <span>€{totale.toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // ── Step checkout ──
  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-shadow'
  const inpFocus = `${inp} focus:ring-2`

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Riepilogo ordine */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700 mb-3">Il tuo ordine</p>
          {carrello.map(r => (
            <div key={r.piattoId} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <button onClick={() => rimuovi(r.piattoId)} className="w-6 h-6 rounded-full border flex items-center justify-center text-sm font-bold"
                    style={{ borderColor: coloreP, color: coloreP }}>−</button>
                  <span className="text-sm font-bold text-gray-900 w-5 text-center">{r.quantita}</span>
                  <button onClick={() => aggiungi({ id: r.piattoId, nome: r.nome, prezzo: r.prezzo, descrizione: null, immagineUrl: null })}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: coloreP }}>+</button>
                </div>
                <span className="text-sm text-gray-800 truncate">{r.nome}</span>
              </div>
              <span className="text-sm font-semibold text-gray-900 shrink-0">€{(r.prezzo * r.quantita).toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between">
            <span className="font-semibold text-gray-700 text-sm">Totale</span>
            <span className="font-bold text-base text-gray-900">€{totale.toFixed(2)}</span>
          </div>
        </div>

        {/* Tipo ordine */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Come vuoi ricevere l'ordine?</p>
          <div className="grid grid-cols-2 gap-3">
            {(['asporto', 'delivery'] as const).map(t => {
              const bloccato = t === 'asporto' ? blockAsporto : blockDelivery
              return (
                <button key={t} onClick={() => !bloccato && setDati(d => ({ ...d, tipo: t }))}
                  disabled={bloccato}
                  className={`py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${bloccato ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed' : dati.tipo === t ? 'border-transparent text-white' : 'border-gray-200 text-gray-600'}`}
                  style={!bloccato && dati.tipo === t ? { backgroundColor: coloreP } : {}}>
                  {t === 'asporto' ? '🛍 Ritiro in negozio' : '🛵 Delivery'}
                  {bloccato && <span className="block text-[10px] font-normal mt-0.5">Non disponibile</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Dati personali */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">I tuoi dati</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
              <input value={dati.nome} onChange={e => setDati(d => ({ ...d, nome: e.target.value }))}
                placeholder="Mario" className={inpFocus} style={{ '--tw-ring-color': coloreP } as React.CSSProperties} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Cognome</label>
              <input value={dati.cognome} onChange={e => setDati(d => ({ ...d, cognome: e.target.value }))}
                placeholder="Rossi" className={inpFocus} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
            <input type="email" value={dati.email} onChange={e => setDati(d => ({ ...d, email: e.target.value }))}
              placeholder="mario@esempio.com" className={inpFocus} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cellulare</label>
            <input type="tel" value={dati.telefono} onChange={e => setDati(d => ({ ...d, telefono: e.target.value }))}
              placeholder="+39 333 1234567" className={inpFocus} />
          </div>
        </div>

        {/* Data e orario */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">
            {dati.tipo === 'delivery' ? 'Quando vuoi la consegna?' : 'Quando passi a ritirare?'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Data *</label>
              <input type="date" value={dati.data} min={oggi}
                onChange={e => setDati(d => ({ ...d, data: e.target.value }))} className={inpFocus} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Orario *</label>
              <input type="time" value={dati.ora} step={900}
                onChange={e => setDati(d => ({ ...d, ora: e.target.value }))} className={inpFocus} />
            </div>
          </div>
          {(() => {
            const fasce = fascePerOrdini()
            if (fasce.length === 0) return null
            return (
              <p className="text-xs text-gray-400">
                Ordini accettati: {fasce.map(f => `${f.inizio}–${f.fine}`).join(' · ')}
              </p>
            )
          })()}
        </div>

        {/* Indirizzo (solo delivery) */}
        {dati.tipo === 'delivery' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Indirizzo di consegna</p>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Città *</label>
              <input value={dati.citta} onChange={e => { setDati(d => ({ ...d, citta: e.target.value })); setErrIndirizzo('') }}
                placeholder="Milano" className={inpFocus} />
            </div>
            <div className="relative">
              <label className="block text-xs font-medium text-gray-500 mb-1">Via / Piazza *</label>
              <input value={dati.via}
                onChange={e => { setDati(d => ({ ...d, via: e.target.value })); cercaIndirizzo(e.target.value); setErrIndirizzo('') }}
                onBlur={() => setTimeout(() => setSuggerimenti([]), 200)}
                placeholder="Inizia a digitare l'indirizzo…" className={inpFocus} autoComplete="off" />
              {suggerimenti.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {suggerimenti.map((s, i) => {
                    const a = s.address ?? {}
                    const riga1 = [a.road ?? a.pedestrian ?? '', a.house_number ?? ''].filter(Boolean).join(' ')
                    const riga2 = [a.postcode, a.city ?? a.town ?? a.village].filter(Boolean).join(' ')
                    return (
                      <button key={i} type="button"
                        onPointerDown={e => { e.preventDefault(); selezionaSuggerimento(s) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                        <p className="text-sm font-medium text-gray-800">{riga1 || s.display_name.split(',')[0]}</p>
                        <p className="text-xs text-gray-400">{riga2}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">CAP *</label>
              <input value={dati.cap} onChange={e => setDati(d => ({ ...d, cap: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                placeholder="20100" inputMode="numeric" maxLength={5}
                className={`${inpFocus} ${dati.cap && !capValido ? 'border-red-300 focus:ring-red-200' : ''}`} />
              {dati.cap && !capValido && <p className="text-xs text-red-500 mt-1">CAP non valido (5 cifre)</p>}
            </div>
            {errIndirizzo && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700 font-medium">
                {errIndirizzo}
              </div>
            )}
          </div>
        )}

        {/* Note */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Note aggiuntive</p>
          <textarea value={dati.noteCliente} onChange={e => setDati(d => ({ ...d, noteCliente: e.target.value }))}
            placeholder="Allergie, preferenze, richieste speciali..."
            rows={2} className={`${inpFocus} resize-none`} />
        </div>
      </div>

      {/* Bottone invio */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-lg mx-auto">
          {dati.tipo !== 'delivery' && errIndirizzo && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700 font-medium mb-2">
              {errIndirizzo}
            </div>
          )}
          <button onClick={inviaOrdine} disabled={inviando || !checkoutValido}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-base disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: coloreP }}>
            {inviando ? (dati.tipo === 'delivery' ? 'Verifica indirizzo…' : 'Invio in corso…') : dati.tipo === 'delivery' ? 'Invia richiesta delivery' : 'Invia richiesta asporto'}
          </button>
          {!checkoutValido && (
            <p className="text-xs text-gray-400 text-center mt-2">
              Compila nome, email, data, orario{dati.tipo === 'delivery' ? ', via, CAP e città' : ''} per continuare
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

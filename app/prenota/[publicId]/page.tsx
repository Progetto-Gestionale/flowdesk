'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

// ── Tipi ─────────────────────────────────────────────────────────────────────

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

const oggiStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Pagina ────────────────────────────────────────────────────────────────────

export default function PrenotaPage() {
  const { publicId } = useParams<{ publicId: string }>()

  // Info locale
  const [nomeLocale, setNomeLocale] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [coloreP, setColoreP] = useState('#4f46e5')
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [errore, setErrore] = useState('')
  const [orariApertura, setOrariApertura] = useState<Record<string, string>>({})
  const [turniServizio, setTurniServizio] = useState<{ id: string; nome: string; oraInizio: string; oraFine: string }[]>([])
  const [regole, setRegole] = useState<{ preavvisoMinMinuti?: number; preavvisoOrdiniMinMinuti?: number; anticipoMaxGiorni?: number; copertiMin?: number; copertiMax?: number; durataMedia?: number; fasceOrdini?: string; bloccoAutoTavoli?: boolean; modalitaOrario?: 'libero' | 'turni' }>({})
  const [disponibilitaTurni, setDisponibilitaTurni] = useState<Record<string, boolean> | null>(null)
  const [slotDisponibile, setSlotDisponibile] = useState<boolean | null>(null) // null = non ancora verificato

  // Tab principale
  const [tab, setTab] = useState<'tavolo' | 'asporto'>('tavolo')

  // ── TAVOLO ───────────────────────────────────────────────────────────────
  const [formTavolo, setFormTavolo] = useState({
    nome: '', email: '', telefono: '',
    data: oggiStr(), ora: '20:00', persone: 2,
    allergie: '', note: '',
  })
  const [invioTavolo, setInvioTavolo] = useState(false)
  const [okTavolo, setOkTavolo] = useState(false)
  const [errTavolo, setErrTavolo] = useState('')

  // ── ORDINE (identico a /menu/[publicId]) ────────────────────────────────
  const [categorie, setCategorie] = useState<Categoria[]>([])
  const [loadingMenu, setLoadingMenu] = useState(false)
  const [cattivaId, setCattivaId] = useState<string | null>(null)
  const [blockAsporto, setBlockAsporto] = useState(false)
  const [blockDelivery, setBlockDelivery] = useState(false)
  const [carrello, setCarrello] = useState<RigaCarrello[]>([])
  const [step, setStep] = useState<'menu' | 'checkout' | 'inviato'>('menu')
  const [inviando, setInviando] = useState(false)
  const [numeroOrdine, setNumeroOrdine] = useState<number | null>(null)
  const [errIndirizzo, setErrIndirizzo] = useState('')
  const [suggerimenti, setSuggerimenti] = useState<any[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const oggi = oggiStr()
  const [dati, setDati] = useState<DatiCheckout>({
    tipo: 'asporto',
    nome: '', cognome: '', email: '', telefono: '',
    data: oggi, ora: '', via: '', cap: '', citta: '', noteCliente: '',
  })

  // ── Caricamento info locale ───────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/public/info?publicId=${publicId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrore(d.error); return }
        setNomeLocale(d.nomeLocale ?? 'Il locale')
        setLogoUrl(d.menuLogoUrl ?? null)
        setColoreP(d.menuColoreP ?? '#4f46e5')
        try { setOrariApertura(JSON.parse(d.orariApertura ?? '{}')) } catch {}
        try {
          const ts = JSON.parse(d.turniServizio ?? '[]')
          ts.sort((a: { oraInizio: string }, b: { oraInizio: string }) => a.oraInizio.localeCompare(b.oraInizio))
          setTurniServizio(ts)
        } catch {}
        try {
          const r = JSON.parse(d.regolePrenotazione ?? '{}')
          setRegole({
            preavvisoMinMinuti: r.preavvisoMinMinuti ? Number(r.preavvisoMinMinuti) : undefined,
            preavvisoOrdiniMinMinuti: r.preavvisoOrdiniMinMinuti ? Number(r.preavvisoOrdiniMinMinuti) : undefined,
            anticipoMaxGiorni: r.anticipoMaxGiorni ? Number(r.anticipoMaxGiorni) : undefined,
            copertiMin: r.copertiMin ? Number(r.copertiMin) : undefined,
            copertiMax: r.copertiMax ? Number(r.copertiMax) : undefined,
            fasceOrdini: r.fasceOrdini || undefined,
            durataMedia: r.durataMedia ? Number(r.durataMedia) : undefined,
            bloccoAutoTavoli: r.bloccoAutoTavoli ?? false,
            modalitaOrario: r.modalitaOrario ?? 'libero',
          })
        } catch {}
      })
      .catch(() => setErrore('Errore di connessione'))
      .finally(() => setLoadingInfo(false))
  }, [publicId])

  // ── Disponibilità turni (blocco auto tavoli — modalità turni) ───────────────
  useEffect(() => {
    if (!regole.bloccoAutoTavoli || regole.modalitaOrario !== 'turni' || !formTavolo.data) {
      setDisponibilitaTurni(null); return
    }
    fetch(`/api/public/disponibilita?publicId=${publicId}&data=${formTavolo.data}`)
      .then(r => r.json())
      .then(d => {
        if (!d.turni) { setDisponibilitaTurni(null); return }
        const map: Record<string, boolean> = {}
        for (const t of d.turni) map[t.id] = t.disponibile
        setDisponibilitaTurni(map)
      })
      .catch(() => setDisponibilitaTurni(null))
  }, [publicId, formTavolo.data, regole.bloccoAutoTavoli, regole.modalitaOrario])

  // ── Check slot puntuale (blocco auto tavoli — modalità libera) ───────────────
  useEffect(() => {
    if (!regole.bloccoAutoTavoli || regole.modalitaOrario === 'turni' || !formTavolo.data || !formTavolo.ora) {
      setSlotDisponibile(null); return
    }
    const durata = regole.durataMedia ?? 90
    fetch(`/api/public/disponibilita?publicId=${publicId}&data=${formTavolo.data}&ora=${formTavolo.ora}&durata=${durata}`)
      .then(r => r.json())
      .then(d => setSlotDisponibile(d.disponibile ?? true))
      .catch(() => setSlotDisponibile(null))
  }, [publicId, formTavolo.data, formTavolo.ora, regole.bloccoAutoTavoli, regole.modalitaOrario])

  // ── Caricamento menu (quando tab asporto) ──────────────────────────────────
  useEffect(() => {
    if (tab !== 'asporto') return
    setLoadingMenu(true)
    fetch(`/api/public/menu?publicId=${publicId}&tipo=asporto`)
      .then(r => r.json())
      .then(d => {
        if (d.error) return
        setCategorie(d.categorie ?? [])
        if (d.categorie?.length > 0) setCattivaId(d.categorie[0].id)
        setBlockAsporto(d.blockAsporto ?? false)
        setBlockDelivery(d.blockDelivery ?? false)
      })
      .finally(() => setLoadingMenu(false))
  }, [tab, publicId])

  // ── Carrello ──────────────────────────────────────────────────────────────
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
  const checkoutValido = dati.nome && dati.email && dati.telefono && dati.data && dati.ora &&
    (dati.tipo === 'asporto' || (dati.via && dati.cap && /^\d{5}$/.test(dati.cap) && dati.citta))

  // ── Helpers orari ────────────────────────────────────────────────────────
  const GIORNI_KEY = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

  function fascePer(dataStr: string): { inizio: string; fine: string }[] {
    if (!dataStr) return []
    // Prima controlla turniServizio (più precisi)
    const dow = new Date(dataStr + 'T12:00:00').getDay()
    const chiave = GIORNI_KEY[dow]
    // Usa turniServizio se disponibili
    if (turniServizio.length > 0) {
      return [...turniServizio]
        .sort((a, b) => a.oraInizio.localeCompare(b.oraInizio))
        .map(t => ({ inizio: t.oraInizio, fine: t.oraFine }))
    }
    // Altrimenti usa orariApertura
    const orarioGiorno = orariApertura[chiave]
    if (!orarioGiorno) return []
    return orarioGiorno.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const [inizio, fine] = s.split('-').map(t => t.trim())
      return { inizio: inizio ?? '', fine: fine ?? '' }
    }).filter(f => f.inizio && f.fine)
  }

  function oraInFasce(ora: string, fasce: { inizio: string; fine: string }[]): boolean {
    if (fasce.length === 0) return true // nessun vincolo
    return fasce.some(f => ora >= f.inizio && ora <= f.fine)
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
      if (ora > maxConsentita) return `Si può prenotare al massimo ${anticipoMaxGiorni} giorni in anticipo.`
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

  // ── Submit tavolo ─────────────────────────────────────────────────────────
  async function prenotaTavolo(e: React.FormEvent) {
    e.preventDefault()
    if (!formTavolo.nome || !formTavolo.email || !formTavolo.telefono || !formTavolo.data || !formTavolo.ora || !formTavolo.persone) {
      setErrTavolo('Compila tutti i campi obbligatori.')
      return
    }
    // Blocca date/orari passati e fuori preavviso
    if (formTavolo.data < oggi) { setErrTavolo('La data selezionata è già passata.'); return }
    const errDataOra = validaDataOra(formTavolo.data, formTavolo.ora, regole.preavvisoMinMinuti, regole.anticipoMaxGiorni)
    if (errDataOra) { setErrTavolo(errDataOra); return }
    // Blocca orari fuori apertura
    const fasceTavolo = fascePer(formTavolo.data)
    if (fasceTavolo.length > 0 && !oraInFasce(formTavolo.ora, fasceTavolo)) {
      setErrTavolo(`Orario non disponibile. Siamo aperti: ${fasceTavolo.map(f => `${f.inizio}–${f.fine}`).join(', ')}.`)
      return
    }
    // Blocca coperti fuori range
    if (regole.copertiMin && formTavolo.persone < regole.copertiMin) {
      setErrTavolo(`Il numero minimo di persone è ${regole.copertiMin}.`); return
    }
    if (regole.copertiMax && formTavolo.persone > regole.copertiMax) {
      setErrTavolo(`Il numero massimo di persone è ${regole.copertiMax}.`); return
    }
    setInvioTavolo(true)
    setErrTavolo('')
    try {
      const res = await fetch('/api/public/prenota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId, ...formTavolo }),
      })
      const d = await res.json()
      if (!res.ok) { setErrTavolo(d.error ?? 'Errore, riprova.'); return }
      setOkTavolo(true)
    } finally {
      setInvioTavolo(false)
    }
  }

  // ── Autocomplete indirizzo ────────────────────────────────────────────────
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

  // ── Submit ordine ─────────────────────────────────────────────────────────
  async function inviaOrdine() {
    if (!checkoutValido) return
    setErrIndirizzo('')
    // Blocca date/orari passati e fuori preavviso
    if (dati.data < oggi) { setErrIndirizzo('La data selezionata è già passata.'); return }
    const errDataOraOrdine = validaDataOra(dati.data, dati.ora, regole.preavvisoOrdiniMinMinuti)
    if (errDataOraOrdine) { setErrIndirizzo(errDataOraOrdine); return }
    // Blocca orari fuori fasce ordini (o apertura come fallback)
    const fasceOrdine = fascePerOrdini()
    if (fasceOrdine.length > 0 && !oraInFasce(dati.ora, fasceOrdine)) {
      setErrIndirizzo(`Orario non disponibile. Ordini accettati: ${fasceOrdine.map(f => `${f.inizio}–${f.fine}`).join(', ')}.`)
      return
    }
    setInviando(true)
    try {
      // Verifica indirizzo delivery con Nominatim (OpenStreetMap)
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

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingInfo) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400">Caricamento...</p>
    </div>
  )

  if (errore) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow">
        <p className="text-gray-600">{errore}</p>
      </div>
    </div>
  )

  // Ordine completato
  if (tab === 'asporto' && step === 'inviato') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-10 text-center shadow-lg max-w-sm w-full">
        <h2 className="text-xl font-bold text-gray-900">Ordine ricevuto</h2>
        <p className="text-gray-500 text-sm mt-3">Il tuo ordine è stato registrato. Lo troverai pronto all&apos;orario indicato.</p>
        <button onClick={() => { setStep('menu'); setDati(d => ({ ...d, nome: '', cognome: '', email: '', telefono: '', noteCliente: '' })) }}
          className="mt-6 w-full py-2.5 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: coloreP }}>
          Nuovo ordine
        </button>
      </div>
    </div>
  )

  const entrambiBloccati = blockAsporto && blockDelivery
  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 transition-shadow'

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          {tab === 'asporto' && step === 'checkout' && (
            <button onClick={() => setStep('menu')} className="text-gray-400 hover:text-gray-600 text-xl mr-1">←</button>
          )}
          {logoUrl
            ? <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
            : <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ background: coloreP }}>{nomeLocale[0]}</div>
          }
          <div className="flex-1">
            <h1 className="font-bold text-gray-900 text-base">{nomeLocale}</h1>
            {tab === 'asporto' && step === 'checkout' && (
              <p className="text-xs text-gray-400">Completa il tuo ordine</p>
            )}
          </div>
        </div>

        {/* Tab selector — nascosto in checkout */}
        {!(tab === 'asporto' && step === 'checkout') && (
          <div className="flex border-t border-gray-100">
            {([
              { key: 'tavolo' as const, label: 'Prenota tavolo' },
              { key: 'asporto' as const, label: 'Asporto / Delivery' },
            ]).map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${tab === key ? 'border-current' : 'border-transparent text-gray-400'}`}
                style={tab === key ? { borderColor: coloreP, color: coloreP } : {}}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Category pills (asporto / step menu) */}
        {tab === 'asporto' && step === 'menu' && categorie.length > 1 && (
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

      {/* ── SEZIONE TAVOLO ────────────────────────────────────────────────── */}
      {tab === 'tavolo' && (
        <div className="max-w-lg mx-auto px-4 py-6 pb-10">
          {okTavolo ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow p-8 text-center">
              <h2 className="text-lg font-bold text-gray-800 mb-2">Richiesta ricevuta</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Riceverai una conferma via email entro breve.<br />
                Ti chiediamo di attendere prima di considerare la prenotazione confermata.
              </p>
              <button onClick={() => setOkTavolo(false)}
                className="mt-6 text-sm font-semibold px-6 py-2.5 rounded-xl text-white"
                style={{ background: coloreP }}>
                Nuova richiesta
              </button>
            </div>
          ) : (
            <form onSubmit={prenotaTavolo} className="space-y-4">

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <p className="text-sm font-semibold text-gray-700">Quando e quanti siete?</p>

                {/* Scelta data — sempre visibile */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Data *</label>
                  <input type="date" required value={formTavolo.data} min={oggi}
                    onChange={e => setFormTavolo(f => ({ ...f, data: e.target.value, ora: '' }))}
                    className={inp} style={{ colorScheme: 'light' }} />
                </div>

                {/* Modalità turni: il cliente sceglie il turno */}
                {regole.modalitaOrario === 'turni' && turniServizio.length > 0 ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Turno *</label>
                    <div className="space-y-2">
                      {turniServizio.map(t => {
                        const esaurito = disponibilitaTurni !== null && disponibilitaTurni[t.id] === false
                        const selezionato = formTavolo.ora === t.oraInizio
                        return (
                          <button key={t.id} type="button"
                            disabled={esaurito}
                            onClick={() => !esaurito && setFormTavolo(f => ({ ...f, ora: t.oraInizio }))}
                            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${esaurito ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60' : selezionato ? 'text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
                            style={!esaurito && selezionato ? { borderColor: coloreP, backgroundColor: coloreP } : {}}>
                            <span className="font-semibold text-sm">{t.nome}</span>
                            <span className={`text-xs ml-2 ${selezionato ? 'text-white/80' : 'text-gray-400'}`}>{t.oraInizio}–{t.oraFine}</span>
                            {esaurito && <span className="text-xs text-red-400 font-medium ml-2">Esaurito</span>}
                          </button>
                        )
                      })}
                    </div>
                    {/* campo hidden per validazione required */}
                    <input type="text" required value={formTavolo.ora} readOnly className="sr-only" tabIndex={-1} />
                  </div>
                ) : (
                  /* Modalità libera: il cliente sceglie l'orario */
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Ora *</label>
                    <input type="time" required value={formTavolo.ora}
                      min={minOraPerData(formTavolo.data)}
                      onChange={e => { setSlotDisponibile(null); setFormTavolo(f => ({ ...f, ora: e.target.value })) }}
                      className={`${inp} ${slotDisponibile === false ? 'border-red-300 focus:ring-red-300' : ''}`} />
                    {slotDisponibile === false && (
                      <p className="text-xs text-red-500 mt-1 font-medium">Questo orario non è disponibile — tutti i tavoli sono occupati.</p>
                    )}
                    {slotDisponibile !== false && (() => {
                      const fasce = fascePer(formTavolo.data)
                      if (fasce.length === 0) return null
                      return <p className="text-xs text-gray-400 mt-1">Orari disponibili: {fasce.map(f => `${f.inizio}–${f.fine}`).join(' · ')}</p>
                    })()}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Numero persone *</label>
                  <div className="flex items-center gap-3">
                    <button type="button"
                      onClick={() => setFormTavolo(f => ({ ...f, persone: Math.max(1, f.persone - 1) }))}
                      className="w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-xl"
                      style={{ borderColor: coloreP, color: coloreP }}>−</button>
                    <span className="text-2xl font-bold text-gray-900 w-10 text-center">{formTavolo.persone}</span>
                    <button type="button"
                      onClick={() => setFormTavolo(f => ({ ...f, persone: f.persone + 1 }))}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xl"
                      style={{ background: coloreP }}>+</button>
                    <span className="text-sm text-gray-400">persone</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <p className="text-sm font-semibold text-gray-700">I tuoi dati</p>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nome e cognome *</label>
                  <input type="text" required placeholder="Mario Rossi" value={formTavolo.nome}
                    onChange={e => setFormTavolo(f => ({ ...f, nome: e.target.value }))}
                    className={inp} />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Telefono *</label>
                    <input type="tel" required placeholder="+39 333 …" value={formTavolo.telefono}
                      onChange={e => setFormTavolo(f => ({ ...f, telefono: e.target.value }))}
                      className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                    <input type="email" required placeholder="email@…" value={formTavolo.email}
                      onChange={e => setFormTavolo(f => ({ ...f, email: e.target.value }))}
                      className={inp} />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <p className="text-sm font-semibold text-gray-700">Dettagli aggiuntivi</p>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Allergie / intolleranze</label>
                  <input type="text" placeholder="es. glutine, lattosio, crostacei…" value={formTavolo.allergie}
                    onChange={e => setFormTavolo(f => ({ ...f, allergie: e.target.value }))}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Note</label>
                  <textarea rows={2} placeholder="Richieste particolari, seggiolone per bambini…" value={formTavolo.note}
                    onChange={e => setFormTavolo(f => ({ ...f, note: e.target.value }))}
                    className={`${inp} resize-none`} />
                </div>
              </div>

              {errTavolo && <p className="text-sm text-red-500 text-center">{errTavolo}</p>}

              <button type="submit" disabled={invioTavolo || !formTavolo.nome || !formTavolo.email || !formTavolo.telefono || !formTavolo.data || !formTavolo.ora || slotDisponibile === false}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-sm shadow disabled:opacity-50"
                style={{ background: coloreP }}>
                {invioTavolo ? 'Invio in corso…' : 'Invia richiesta'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── SEZIONE ORDINE — step menu ─────────────────────────────────────── */}
      {tab === 'asporto' && step === 'menu' && (
        <div className="pb-32">
          {loadingMenu ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-gray-400 text-sm">Caricamento menu...</p>
            </div>
          ) : (
            <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

              {/* Banner blocchi */}
              {entrambiBloccati && (
                <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 text-center">
                  <p className="text-2xl mb-1">🚫</p>
                  <p className="font-semibold text-red-800 text-sm">Servizio non disponibile</p>
                  <p className="text-red-600 text-xs mt-1">Asporto e delivery sono temporaneamente sospesi.</p>
                </div>
              )}
              {blockAsporto && !blockDelivery && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-xl">⚠️</span>
                  <p className="text-orange-800 text-sm"><strong>Asporto sospeso.</strong> Puoi ordinare solo in delivery.</p>
                </div>
              )}
              {blockDelivery && !blockAsporto && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-xl">⚠️</span>
                  <p className="text-orange-800 text-sm"><strong>Delivery sospeso.</strong> Puoi ordinare solo in asporto.</p>
                </div>
              )}

              {/* Piatti */}
              {categorie.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-gray-400 text-sm">Menu non ancora disponibile</p>
                </div>
              ) : categorie.map(cat => (
                <div key={cat.id} id={`cat-${cat.id}`} className="space-y-3">
                  <h2 className="text-lg font-bold text-gray-900">{cat.nome}</h2>
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
              ))}
            </div>
          )}

          {/* Bottone carrello fisso */}
          {totArticoli > 0 && !entrambiBloccati && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
              <div className="max-w-lg mx-auto">
                <button onClick={() => setStep('checkout')}
                  className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-between px-5 shadow-md"
                  style={{ backgroundColor: coloreP }}>
                  <span className="bg-white/20 rounded-lg px-2 py-0.5 text-sm">{totArticoli}</span>
                  <span>Procedi con l&apos;ordine</span>
                  <span>€{totale.toFixed(2)}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SEZIONE ORDINE — step checkout ────────────────────────────────── */}
      {tab === 'asporto' && step === 'checkout' && (
        <div className="pb-32">
          <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

            {/* Riepilogo */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-700 mb-3">Il tuo ordine</p>
              {carrello.map(r => (
                <div key={r.piattoId} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <button onClick={() => rimuovi(r.piattoId)}
                        className="w-6 h-6 rounded-full border flex items-center justify-center text-sm font-bold"
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
              <p className="text-sm font-semibold text-gray-700">Come vuoi ricevere l&apos;ordine?</p>
              <div className="grid grid-cols-2 gap-3">
                {(['asporto', 'delivery'] as const).map(t => {
                  const bloccato = t === 'asporto' ? blockAsporto : blockDelivery
                  return (
                    <button key={t} onClick={() => !bloccato && setDati(d => ({ ...d, tipo: t }))}
                      disabled={bloccato}
                      className={`py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${bloccato ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed' : dati.tipo === t ? 'border-transparent text-white' : 'border-gray-200 text-gray-600'}`}
                      style={!bloccato && dati.tipo === t ? { backgroundColor: coloreP } : {}}>
                      {t === 'asporto' ? 'Ritiro in negozio' : 'Delivery'}
                      {bloccato && <span className="block text-[10px] font-normal mt-0.5">Non disponibile</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Dati personali */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">I tuoi dati</p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
                  <input value={dati.nome} onChange={e => setDati(d => ({ ...d, nome: e.target.value }))}
                    placeholder="Mario" className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cognome</label>
                  <input value={dati.cognome} onChange={e => setDati(d => ({ ...d, cognome: e.target.value }))}
                    placeholder="Rossi" className={inp} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                <input type="email" value={dati.email} onChange={e => setDati(d => ({ ...d, email: e.target.value }))}
                  placeholder="mario@esempio.com" className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cellulare *</label>
                <input type="tel" value={dati.telefono} onChange={e => setDati(d => ({ ...d, telefono: e.target.value }))}
                  placeholder="+39 333 1234567" className={inp} />
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
                    onChange={e => setDati(d => ({ ...d, data: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Orario *</label>
                  <input type="time" value={dati.ora}
                    min={minOraPerData(dati.data)}
                    onChange={e => setDati(d => ({ ...d, ora: e.target.value }))} className={inp} />
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

            {/* Indirizzo delivery */}
            {dati.tipo === 'delivery' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700">Indirizzo di consegna</p>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Città *</label>
                  <input value={dati.citta} onChange={e => { setDati(d => ({ ...d, citta: e.target.value })); setErrIndirizzo('') }}
                    placeholder="Milano" className={inp} />
                </div>
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Via / Piazza *</label>
                  <input value={dati.via}
                    onChange={e => { setDati(d => ({ ...d, via: e.target.value })); cercaIndirizzo(e.target.value); setErrIndirizzo('') }}
                    onBlur={() => setTimeout(() => setSuggerimenti([]), 200)}
                    placeholder="Inizia a digitare l'indirizzo…" className={inp} autoComplete="off" />
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
                    className={`${inp} ${dati.cap && !capValido ? 'border-red-300 focus:ring-red-200' : ''}`} />
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
                rows={2} className={`${inp} resize-none`} />
            </div>
          </div>

          {/* Bottone invio */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
            <div className="max-w-lg mx-auto">
              <button onClick={inviaOrdine} disabled={inviando || !checkoutValido}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-base disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: coloreP }}>
                {inviando ? (dati.tipo === 'delivery' ? 'Verifica indirizzo…' : 'Invio in corso…') : dati.tipo === 'delivery' ? 'Invia richiesta delivery' : 'Invia richiesta asporto'}
              </button>
              {!checkoutValido && (
                <p className="text-xs text-gray-400 text-center mt-2">
                  Compila nome, email, cellulare, data, orario{dati.tipo === 'delivery' ? ', via, CAP e città' : ''} per continuare
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

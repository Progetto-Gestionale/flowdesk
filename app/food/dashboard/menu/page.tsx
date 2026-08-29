'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconFork, IconPencil, IconTrash } from '@/app/components/icons'
import { preparaFoto } from '@/lib/uploadFoto'
import { getCache, setCache } from '@/lib/pageCache'
import { Skeleton, SkeletonCards } from '@/app/components/Skeleton'
import { ALLERGENI } from '@/lib/allergeni'

interface Piatto {
  id: string
  nome: string
  descrizione: string | null
  prezzo: number
  immagineUrl: string | null
  allergeni: string[]
  disponibile: boolean
  quantita: number | null
  quantitaSoglia: number | null
  etichetta: string | null
  etichettaColore: string | null
  ordine: number
}

// Etichetta piatto (es. "Best seller"): piccola palette per personalizzare il colore.
const ETICHETTA_COLORI = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#7c3aed', '#0891b2', '#db2777', '#334155']
const ETICHETTA_COLORE_DEFAULT = '#2563eb'

interface FormPiatto {
  nome: string; descrizione: string; prezzo: string; immagineUrl: string; allergeni: string[]
  gestisciQuantita: boolean; quantita: string; mostraSempre: boolean; quantitaSoglia: string
  etichetta: string; etichettaColore: string
}
const EMPTY_FORM: FormPiatto = {
  nome: '', descrizione: '', prezzo: '', immagineUrl: '', allergeni: [],
  gestisciQuantita: false, quantita: '', mostraSempre: true, quantitaSoglia: '',
  etichetta: '', etichettaColore: '',
}

interface Categoria {
  id: string
  nome: string
  ordine: number
  reparto: string | null
  piatti: Piatto[]
}

const DEFAULT_REPARTI = ['Cucina', 'Bar']
function parseReparti(json?: string | null): string[] {
  if (!json) return [...DEFAULT_REPARTI]
  try { const a = JSON.parse(json); const l = Array.isArray(a) ? a.map((x: unknown) => String(x).trim()).filter(Boolean) : []; return l.length ? l : [...DEFAULT_REPARTI] } catch { return [...DEFAULT_REPARTI] }
}

// ── Reusable menu editor (locale | asporto) ──────────────────────────────────
function MenuEditor({ tipo }: { tipo: 'locale' | 'asporto' }) {
  const [categorie, setCategorie] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [modalCat, setModalCat] = useState(false)
  const [nomeCat, setNomeCat] = useState('')
  const [editCat, setEditCat] = useState<Categoria | null>(null)
  // Reparti / centri di produzione del locale (Cucina, Bar, Pizzeria…) e reparto scelto per la categoria.
  const [reparti, setReparti] = useState<string[]>(DEFAULT_REPARTI)
  const [repartoCat, setRepartoCat] = useState<string>('Cucina')
  // Aggiunta nuovo reparto: campo interno al modale (niente popup nativo del browser).
  const [nuovoRepartoOpen, setNuovoRepartoOpen] = useState(false)
  const [nuovoRepartoNome, setNuovoRepartoNome] = useState('')
  const [modalPiatto, setModalPiatto] = useState<{ categoriaId: string } | null>(null)
  const [editPiatto, setEditPiatto] = useState<Piatto & { categoriaId: string } | null>(null)
  const [formPiatto, setFormPiatto] = useState<FormPiatto>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [caricandoFoto, setCaricandoFoto] = useState(false)

  // Carica una foto dal dispositivo: la ridimensiona/comprime lato client e la salva
  // come data URL in immagineUrl (nessun servizio esterno richiesto).
  async function onSelezionaFoto(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Seleziona un file immagine (JPG, PNG…).'); return }
    setCaricandoFoto(true)
    try {
      const url = await preparaFoto(file)
      setFormPiatto(f => ({ ...f, immagineUrl: url }))
    } catch {
      alert('Non è stato possibile elaborare l\'immagine. Riprova con un\'altra foto.')
    } finally {
      setCaricandoFoto(false)
    }
  }
  const [conferma, setConferma] = useState<{ msg: string; onConfirm: () => void } | null>(null)
  const [copiando, setCopiando] = useState(false)
  const [copiato, setCopiato] = useState(false)

  const cacheKey = `food:menu:${tipo}`
  async function fetchMenu() {
    try {
      const res = await fetch(`/api/menu/categorie?tipo=${tipo}`, { credentials: 'include' })
      if (!res.ok) { console.error('fetchMenu error:', res.status); setLoading(false); return }
      const data = await res.json()
      const cats: Categoria[] = data.categorie ?? []
      setCategorie(cats)
      setCache<Categoria[]>(cacheKey, cats)
    } catch (e) {
      console.error('fetchMenu exception:', e)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Idrata subito dal menù in cache (se c'è): niente "Caricamento…" al ritorno.
    const cached = getCache<Categoria[]>(cacheKey)
    if (cached) { setCategorie(cached); setLoading(false) }
    else setLoading(true)
    fetchMenu() // revalidate in background
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  // Carica i reparti del locale (per il menu a tendina nella categoria).
  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).then(s => setReparti(parseReparti(s.reparti))).catch(() => {})
  }, [])

  // Salva la lista reparti sul locale (quando se ne crea uno nuovo al volo).
  async function salvaReparti(nuovi: string[]) {
    setReparti(nuovi)
    await fetch('/api/settings', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reparti: JSON.stringify(nuovi) }),
    }).catch(() => {})
  }

  function confermaNuovoReparto() {
    const nome = nuovoRepartoNome.trim()
    if (!nome) return
    if (!reparti.includes(nome)) salvaReparti([...reparti, nome])
    setRepartoCat(nome)
    setNuovoRepartoNome('')
    setNuovoRepartoOpen(false)
  }

  async function salvaCategoria() {
    if (!nomeCat.trim()) return
    setSaving(true)
    try {
      if (editCat) {
        const res = await fetch(`/api/menu/categorie/${editCat.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: nomeCat, reparto: repartoCat }),
        })
        if (!res.ok) throw new Error(`PATCH failed: ${res.status}`)
      } else {
        const res = await fetch('/api/menu/categorie', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: nomeCat, tipo, reparto: repartoCat }),
        })
        if (!res.ok) throw new Error(`POST failed: ${res.status}`)
      }
    } catch (e) {
      console.error('salvaCategoria error:', e)
      setSaving(false)
      return
    }
    setSaving(false); setModalCat(false); setNomeCat(''); setEditCat(null)
    await fetchMenu()
  }

  // Riordino categorie e piatti con le frecce (ordine salvato sul server). Update ottimistico.
  async function spostaCategoria(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= categorie.length) return
    const next = [...categorie]
    ;[next[index], next[j]] = [next[j], next[index]]
    setCategorie(next)
    setCache<Categoria[]>(cacheKey, next)
    await fetch('/api/menu/categorie/ordina', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: next.map(c => c.id) }),
    }).catch(() => {})
  }

  async function spostaPiatto(catId: string, index: number, dir: -1 | 1) {
    const cat = categorie.find(c => c.id === catId)
    if (!cat) return
    const j = index + dir
    if (j < 0 || j >= cat.piatti.length) return
    const nuoviPiatti = [...cat.piatti]
    ;[nuoviPiatti[index], nuoviPiatti[j]] = [nuoviPiatti[j], nuoviPiatti[index]]
    const next = categorie.map(c => c.id === catId ? { ...c, piatti: nuoviPiatti } : c)
    setCategorie(next)
    setCache<Categoria[]>(cacheKey, next)
    await fetch('/api/menu/piatti/ordina', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: nuoviPiatti.map(p => p.id) }),
    }).catch(() => {})
  }

  async function eliminaCategoria(id: string) {
    setConferma({ msg: 'Eliminare questa categoria e tutti i suoi piatti?', onConfirm: async () => {
      const res = await fetch(`/api/menu/categorie/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? 'Errore durante l\'eliminazione.'); return }
      fetchMenu()
    }})
  }

  // Costruisce il payload dal form: traduce i toggle in valori DB (null = non gestito / mostra sempre).
  function payloadPiatto() {
    return {
      nome: formPiatto.nome, descrizione: formPiatto.descrizione, prezzo: formPiatto.prezzo,
      immagineUrl: formPiatto.immagineUrl, allergeni: formPiatto.allergeni,
      quantita: formPiatto.gestisciQuantita ? (formPiatto.quantita === '' ? 0 : formPiatto.quantita) : null,
      quantitaSoglia: formPiatto.gestisciQuantita && !formPiatto.mostraSempre && formPiatto.quantitaSoglia !== '' ? formPiatto.quantitaSoglia : null,
      etichetta: formPiatto.etichetta.trim() || null,
      etichettaColore: formPiatto.etichetta.trim() ? (formPiatto.etichettaColore || null) : null,
    }
  }

  async function salvaPiatto() {
    setSaving(true)
    if (editPiatto) {
      await fetch(`/api/menu/piatti/${editPiatto.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadPiatto()),
      })
    } else if (modalPiatto) {
      await fetch('/api/menu/piatti', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payloadPiatto(), categoriaId: modalPiatto.categoriaId }),
      })
    }
    setSaving(false); setModalPiatto(null); setEditPiatto(null)
    setFormPiatto(EMPTY_FORM); fetchMenu()
  }

  // Aggiorna al volo la quantità rimanente dalla lista (senza aprire il modale). Update ottimistico.
  async function setQuantitaPiatto(catId: string, piattoId: string, nuova: number) {
    const val = nuova < 0 ? 0 : Math.floor(nuova)
    const next = categorie.map(c => c.id === catId
      ? { ...c, piatti: c.piatti.map(p => p.id === piattoId ? { ...p, quantita: val } : p) }
      : c)
    setCategorie(next)
    setCache<Categoria[]>(cacheKey, next)
    await fetch(`/api/menu/piatti/${piattoId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantita: val }),
    }).catch(() => {})
  }

  async function toggleDisponibile(piatto: Piatto) {
    await fetch(`/api/menu/piatti/${piatto.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponibile: !piatto.disponibile }),
    })
    fetchMenu()
  }

  async function eliminaPiatto(id: string) {
    setConferma({ msg: 'Eliminare questo piatto?', onConfirm: async () => {
      const res = await fetch(`/api/menu/piatti/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? 'Errore durante l\'eliminazione.'); return }
      fetchMenu()
    }})
  }

  function apriModificaPiatto(piatto: Piatto, categoriaId: string) {
    setEditPiatto({ ...piatto, categoriaId })
    setFormPiatto({
      nome: piatto.nome, descrizione: piatto.descrizione ?? '', prezzo: piatto.prezzo.toString(),
      immagineUrl: piatto.immagineUrl ?? '', allergeni: piatto.allergeni ?? [],
      gestisciQuantita: piatto.quantita !== null,
      quantita: piatto.quantita !== null ? piatto.quantita.toString() : '',
      mostraSempre: piatto.quantitaSoglia === null,
      quantitaSoglia: piatto.quantitaSoglia !== null ? piatto.quantitaSoglia.toString() : '',
      etichetta: piatto.etichetta ?? '',
      etichettaColore: piatto.etichettaColore ?? '',
    })
  }

  async function copiaDaAltroTipo() {
    const sorgente = tipo === 'locale' ? 'asporto' : 'locale'
    const label = sorgente === 'locale' ? 'Menu tavoli' : 'Menù Menu asporto e delivery'
    setConferma({
      msg: `Copiare tutto il contenuto da "${label}" sovrascrivendo questo menù?`,
      onConfirm: async () => {
        setCopiando(true)
        const res = await fetch('/api/menu/copia', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ da: sorgente, a: tipo }),
        })
        setCopiando(false)
        if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? 'Impossibile importare il menù.'); return }
        setCopiato(true)
        setTimeout(() => setCopiato(false), 3000)
        fetchMenu()
      }
    })
  }

  const isModalOpen = modalPiatto !== null || editPiatto !== null
  const altroLabel = tipo === 'locale' ? 'Menu asporto e delivery' : 'Menu tavoli'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => { setEditCat(null); setNomeCat(''); setRepartoCat(reparti[0] ?? 'Cucina'); setModalCat(true) }}
            className="bg-electric-blue text-white px-4 py-2 rounded-xl font-medium hover:bg-electric-blue/90 text-sm">
            + Categoria
          </button>
          {tipo === 'asporto' && (
            <button onClick={copiaDaAltroTipo} disabled={copiando}
              className="border border-ink-navy/15 text-ink-navy/70 px-4 py-2 rounded-xl font-medium hover:bg-mist text-sm disabled:opacity-50">
              {copiato ? '✓ Copiato' : copiando ? 'Copia...' : `↓ Importa da ${altroLabel}`}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <SkeletonCards count={3} />
        </div>
      ) : categorie.length === 0 ? (
        <div className="bg-white rounded-2xl border border-ink-navy/10 p-16 text-center shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-3 mx-auto mb-4">
            <IconFork />
          </div>
          <h3 className="text-lg font-semibold text-ink-navy">Nessuna categoria</h3>
          <p className="text-ink-navy/50 text-sm mt-2">Crea una categoria per iniziare ad aggiungere piatti</p>
          <div className="flex gap-2 justify-center mt-4">
            <button onClick={() => { setEditCat(null); setNomeCat(''); setRepartoCat(reparti[0] ?? 'Cucina'); setModalCat(true) }}
              className="bg-electric-blue text-white px-5 py-2 rounded-xl font-medium hover:bg-electric-blue/90 text-sm">
              + Aggiungi categoria
            </button>
            {tipo === 'asporto' && (
              <button onClick={copiaDaAltroTipo}
                className="border border-ink-navy/15 text-ink-navy/70 px-5 py-2 rounded-xl font-medium hover:bg-mist text-sm">
                Importa da {altroLabel}
              </button>
            )}
          </div>
        </div>
      ) : (
        categorie.map((cat, ci) => (
          <div key={cat.id} className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-navy/8 bg-mist">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex flex-col shrink-0 -my-1">
                  <button onClick={() => spostaCategoria(ci, -1)} disabled={ci === 0} aria-label="Sposta categoria su"
                    className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▲</button>
                  <button onClick={() => spostaCategoria(ci, 1)} disabled={ci === categorie.length - 1} aria-label="Sposta categoria giù"
                    className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▼</button>
                </div>
                <h2 className="font-bold text-ink-navy flex items-center gap-2 min-w-0">{cat.nome}
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-electric-blue/10 text-electric-blue shrink-0">{cat.reparto || 'Cucina'}</span>
                  <span className="text-xs font-normal text-ink-navy/35 shrink-0">{cat.piatti.length} piatt{cat.piatti.length === 1 ? 'o' : 'i'}</span>
                </h2>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditCat(cat); setNomeCat(cat.nome); setRepartoCat(cat.reparto || reparti[0] || 'Cucina'); setModalCat(true) }}
                  className="text-xs px-2.5 py-1 rounded-lg text-ink-navy/50 hover:bg-ink-navy/10 transition-colors">Rinomina</button>
                <button onClick={() => setModalPiatto({ categoriaId: cat.id })}
                  className="text-xs px-3 py-1 rounded-lg bg-electric-blue/10 text-electric-blue hover:bg-electric-blue/15 font-medium transition-colors">+ Piatto</button>
                <button onClick={() => eliminaCategoria(cat.id)}
                  className="text-xs px-2.5 py-1 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                  <span className="w-3.5 h-3.5 inline-block"><IconTrash /></span>
                </button>
              </div>
            </div>
            {cat.piatti.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-ink-navy/35 text-sm">Nessun piatto — clicca "+ Piatto" per aggiungerne uno</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {cat.piatti.map((p, pi) => (
                  <div key={p.id} className={`flex items-center gap-4 px-5 py-3.5 ${!p.disponibile ? 'opacity-50' : ''}`}>
                    <div className="flex flex-col shrink-0 -my-1">
                      <button onClick={() => spostaPiatto(cat.id, pi, -1)} disabled={pi === 0} aria-label="Sposta piatto su"
                        className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▲</button>
                      <button onClick={() => spostaPiatto(cat.id, pi, 1)} disabled={pi === cat.piatti.length - 1} aria-label="Sposta piatto giù"
                        className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▼</button>
                    </div>
                    {p.immagineUrl ? (
                      <img src={p.immagineUrl} alt={p.nome} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-mist flex items-center justify-center p-3.5 text-ink-navy/25 shrink-0"><IconFork /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-semibold text-ink-navy truncate">{p.nome}</p>
                        {p.etichetta && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                            style={{ backgroundColor: p.etichettaColore || ETICHETTA_COLORE_DEFAULT }}>{p.etichetta}</span>
                        )}
                      </div>
                      {p.descrizione && <p className="text-sm text-ink-navy/50 truncate">{p.descrizione}</p>}
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <p className="text-electric-blue font-bold text-sm">€{p.prezzo.toFixed(2)}</p>
                        {p.quantita !== null && (
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-semibold text-ink-navy/40 uppercase tracking-wide">Rimasti</span>
                            <button onClick={() => setQuantitaPiatto(cat.id, p.id, (p.quantita ?? 0) - 1)} disabled={(p.quantita ?? 0) <= 0}
                              aria-label="Diminuisci quantità"
                              className="w-6 h-6 rounded-md border border-ink-navy/15 text-ink-navy/60 hover:bg-mist disabled:opacity-30 leading-none text-sm font-bold">−</button>
                            <span className={`min-w-[1.5rem] text-center text-sm font-bold tabular-nums ${p.quantita === 0 ? 'text-red-500' : 'text-ink-navy'}`}>{p.quantita}</span>
                            <button onClick={() => setQuantitaPiatto(cat.id, p.id, (p.quantita ?? 0) + 1)}
                              aria-label="Aumenta quantità"
                              className="w-6 h-6 rounded-md border border-ink-navy/15 text-ink-navy/60 hover:bg-mist leading-none text-sm font-bold">+</button>
                            {p.quantita === 0 && <span className="text-[11px] font-semibold text-red-500">Esaurito</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex rounded-lg border border-ink-navy/10 overflow-hidden text-xs font-medium">
                        <button onClick={() => !p.disponibile && toggleDisponibile(p)}
                          className={`px-2.5 py-1 transition-colors ${p.disponibile ? 'bg-green-100 text-green-700' : 'text-ink-navy/35 hover:bg-mist'}`}>
                          Disponibile
                        </button>
                        <button onClick={() => p.disponibile && toggleDisponibile(p)}
                          className={`px-2.5 py-1 transition-colors border-l border-ink-navy/10 ${!p.disponibile ? 'bg-red-100 text-red-600' : 'text-ink-navy/60 hover:bg-red-50 hover:text-red-500'}`}>
                          Non disp.
                        </button>
                      </div>
                      <button onClick={() => apriModificaPiatto(p, cat.id)}
                        className="text-ink-navy/35 hover:text-electric-blue p-1.5 rounded-lg hover:bg-electric-blue/10 transition-colors">
                        <span className="w-3.5 h-3.5 block"><IconPencil /></span>
                      </button>
                      <button onClick={() => eliminaPiatto(p.id)}
                        className="text-ink-navy/35 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        <span className="w-3.5 h-3.5 block"><IconTrash /></span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {/* Modal categoria */}
      {modalCat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink-navy">{editCat ? 'Modifica categoria' : 'Nuova categoria'}</h3>
            <input value={nomeCat} onChange={e => setNomeCat(e.target.value)}
              placeholder="es. Antipasti, Primi, Dolci..."
              className="w-full border border-ink-navy/15 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue"
              autoFocus onKeyDown={e => e.key === 'Enter' && nomeCat.trim() && salvaCategoria()} />
            <div>
              <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Reparto (dove si prepara)</label>
              <div className="flex flex-wrap gap-1.5">
                {reparti.map(r => (
                  <button key={r} type="button" onClick={() => setRepartoCat(r)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${repartoCat === r ? 'bg-electric-blue text-white border-electric-blue' : 'border-ink-navy/15 text-ink-navy/60 hover:bg-mist'}`}>
                    {r}
                  </button>
                ))}
                {!nuovoRepartoOpen && (
                  <button type="button" onClick={() => setNuovoRepartoOpen(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-dashed border-electric-blue/40 text-electric-blue hover:bg-electric-blue/5">
                    + Nuovo reparto
                  </button>
                )}
              </div>
              {nuovoRepartoOpen && (
                <div className="flex gap-1.5 mt-2">
                  <input autoFocus value={nuovoRepartoNome} onChange={e => setNuovoRepartoNome(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); confermaNuovoReparto() }
                      if (e.key === 'Escape') { setNuovoRepartoOpen(false); setNuovoRepartoNome('') }
                    }}
                    placeholder="Nome reparto (es. Pizzeria, Griglia)"
                    className="flex-1 text-xs border border-ink-navy/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-electric-blue/30" />
                  <button type="button" onClick={confermaNuovoReparto} disabled={!nuovoRepartoNome.trim()}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-electric-blue text-white hover:bg-electric-blue/90 disabled:opacity-40">Aggiungi</button>
                  <button type="button" onClick={() => { setNuovoRepartoOpen(false); setNuovoRepartoNome('') }}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/60 hover:bg-mist">✕</button>
                </div>
              )}
              <p className="text-[11px] text-ink-navy/40 mt-1.5">Es. le bevande al Bar, i piatti in Cucina. Instrada gli ordini alla postazione giusta.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setModalCat(false); setNomeCat(''); setEditCat(null) }}
                className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl hover:bg-mist text-sm">Annulla</button>
              <button onClick={salvaCategoria} disabled={saving || !nomeCat.trim()}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-xl hover:bg-electric-blue/90 text-sm disabled:opacity-50">
                {saving ? '...' : editCat ? 'Salva' : 'Crea'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal piatto */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-ink-navy">{editPiatto ? 'Modifica piatto' : 'Nuovo piatto'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nome *</label>
                <input value={formPiatto.nome} onChange={e => setFormPiatto(f => ({ ...f, nome: e.target.value }))}
                  placeholder="es. Spaghetti alla carbonara"
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Descrizione</label>
                <textarea value={formPiatto.descrizione} onChange={e => setFormPiatto(f => ({ ...f, descrizione: e.target.value }))}
                  placeholder="Ingredienti, allergeni, varianti..."
                  rows={2} className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Prezzo (€) *</label>
                <input type="number" step="0.50" min="0" value={formPiatto.prezzo}
                  onChange={e => setFormPiatto(f => ({ ...f, prezzo: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
              </div>

              {/* Quantità / counter live */}
              <div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm font-medium text-ink-navy/70">Gestisci quantità (counter)</span>
                  <input type="checkbox" checked={formPiatto.gestisciQuantita}
                    onChange={e => setFormPiatto(f => ({ ...f, gestisciQuantita: e.target.checked }))}
                    className="w-4 h-4 rounded accent-electric-blue" />
                </label>
                <p className="text-xs text-ink-navy/40 mt-1">Attiva per limitare le porzioni: il counter scala man mano che i clienti ordinano. Spento = quantità illimitata.</p>
                {formPiatto.gestisciQuantita && (
                  <div className="mt-3 space-y-3 bg-mist rounded-xl p-3">
                    <div>
                      <label className="block text-xs font-semibold text-ink-navy/50 mb-1 uppercase tracking-wide">Porzioni disponibili</label>
                      <input type="number" min="0" step="1" inputMode="numeric" value={formPiatto.quantita}
                        onChange={e => setFormPiatto(f => ({ ...f, quantita: e.target.value.replace(/\D/g, '') }))}
                        placeholder="es. 10"
                        className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Quando mostrare il numero al cliente</label>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => setFormPiatto(f => ({ ...f, mostraSempre: true }))}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${formPiatto.mostraSempre ? 'bg-electric-blue text-white border-electric-blue' : 'border-ink-navy/15 text-ink-navy/60 hover:bg-white'}`}>Sempre</button>
                        <button type="button" onClick={() => setFormPiatto(f => ({ ...f, mostraSempre: false }))}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${!formPiatto.mostraSempre ? 'bg-electric-blue text-white border-electric-blue' : 'border-ink-navy/15 text-ink-navy/60 hover:bg-white'}`}>Solo quando scarseggia</button>
                      </div>
                      {!formPiatto.mostraSempre && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-ink-navy/60">Mostra “Ne restano X” quando ne restano ≤</span>
                          <input type="number" min="0" step="1" inputMode="numeric" value={formPiatto.quantitaSoglia}
                            onChange={e => setFormPiatto(f => ({ ...f, quantitaSoglia: e.target.value.replace(/\D/g, '') }))}
                            placeholder="5"
                            className="w-16 border border-ink-navy/15 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Etichetta personalizzata */}
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Etichetta (facoltativa)</label>
                <p className="text-xs text-ink-navy/40 mb-2">Piccola scritta mostrata al cliente sul menu, es. “Best seller”, “Il nostro classico”.</p>
                <input value={formPiatto.etichetta}
                  onChange={e => setFormPiatto(f => ({ ...f, etichetta: e.target.value.slice(0, 40) }))}
                  placeholder="es. Best seller"
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                {formPiatto.etichetta.trim() && (
                  <div className="mt-2.5">
                    <span className="block text-xs font-semibold text-ink-navy/50 mb-1.5 uppercase tracking-wide">Colore etichetta</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {ETICHETTA_COLORI.map(c => {
                        const attivo = (formPiatto.etichettaColore || ETICHETTA_COLORE_DEFAULT) === c
                        return (
                          <button key={c} type="button" onClick={() => setFormPiatto(f => ({ ...f, etichettaColore: c }))}
                            aria-label={`Colore ${c}`}
                            className={`w-7 h-7 rounded-full border-2 transition-transform ${attivo ? 'border-ink-navy/50 scale-110' : 'border-transparent hover:scale-105'}`}
                            style={{ backgroundColor: c }} />
                        )
                      })}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="text-xs text-ink-navy/40">Anteprima:</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: formPiatto.etichettaColore || ETICHETTA_COLORE_DEFAULT }}>{formPiatto.etichetta.trim()}</span>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Foto del piatto</label>
                {formPiatto.immagineUrl ? (
                  <div className="relative">
                    <img src={formPiatto.immagineUrl} alt="preview" className="w-full h-32 object-cover rounded-xl" />
                    <button type="button" onClick={() => setFormPiatto(f => ({ ...f, immagineUrl: '' }))}
                      className="absolute top-2 right-2 bg-white/90 border border-ink-navy/15 rounded-lg text-xs font-semibold px-2 py-1 text-red-500 hover:bg-white shadow-sm">Rimuovi</button>
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed border-ink-navy/15 rounded-xl py-6 transition-colors ${caricandoFoto ? 'opacity-60' : 'cursor-pointer hover:bg-mist hover:border-electric-blue/40'}`}>
                    <span className="text-sm font-semibold text-electric-blue">{caricandoFoto ? 'Caricamento…' : '📷 Carica foto'}</span>
                    <span className="text-xs text-ink-navy/35">JPG o PNG dal tuo dispositivo</span>
                    <input type="file" accept="image/*" className="hidden" disabled={caricandoFoto}
                      onChange={e => { onSelezionaFoto(e.target.files?.[0] ?? null); e.target.value = '' }} />
                  </label>
                )}
                <details className="mt-2">
                  <summary className="text-xs text-ink-navy/40 cursor-pointer select-none">oppure incolla un URL</summary>
                  <input value={formPiatto.immagineUrl.startsWith('data:') ? '' : formPiatto.immagineUrl}
                    onChange={e => setFormPiatto(f => ({ ...f, immagineUrl: e.target.value }))}
                    placeholder="https://..."
                    className="mt-1.5 w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
                </details>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-navy/70 mb-1">Allergeni</label>
                <p className="text-xs text-ink-navy/40 mb-2">Spunta gli allergeni presenti nel piatto: verranno mostrati sul menu digitale.</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALLERGENI.map(a => {
                    const attivo = formPiatto.allergeni.includes(a.key)
                    return (
                      <button type="button" key={a.key}
                        onClick={() => setFormPiatto(f => ({ ...f, allergeni: attivo ? f.allergeni.filter(k => k !== a.key) : [...f.allergeni, a.key] }))}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left transition-colors ${attivo ? 'border-electric-blue bg-electric-blue/10 text-electric-blue font-semibold' : 'border-ink-navy/15 text-ink-navy/60 hover:bg-mist'}`}>
                        <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${attivo ? 'bg-electric-blue border-electric-blue text-white' : 'border-ink-navy/25'}`}>{attivo ? '✓' : ''}</span>
                        <span className="truncate">{a.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setModalPiatto(null); setEditPiatto(null); setFormPiatto(EMPTY_FORM) }}
                className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl hover:bg-mist text-sm">Annulla</button>
              <button onClick={salvaPiatto} disabled={saving || !formPiatto.nome || !formPiatto.prezzo}
                className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-xl hover:bg-electric-blue/90 text-sm disabled:opacity-50">
                {saving ? '...' : editPiatto ? 'Salva modifiche' : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {conferma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConferma(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-ink-navy mb-4">{conferma.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setConferma(null)} className="flex-1 py-2 rounded-xl border border-ink-navy/10 text-ink-navy/60 text-sm font-medium hover:bg-mist">Annulla</button>
              <button onClick={async () => { await conferma.onConfirm(); setConferma(null) }} className="flex-1 py-2 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90">Conferma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MenuPage() {
  const [tab, setTab] = useState<'locale' | 'asporto'>('locale')

  const TABS = [
    { key: 'locale', label: 'Menu tavoli' },
    { key: 'asporto', label: 'Menu asporto e delivery' },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-navy">Menu</h1>
        <p className="text-ink-navy/50 text-sm mt-0.5">Gestisci categorie e piatti per il locale e per l'asporto</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === t.key ? 'bg-electric-blue text-white' : 'bg-white border border-ink-navy/15 text-ink-navy/60 hover:bg-mist'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB LOCALE / ASPORTO ── */}
      <MenuEditor key={tab} tipo={tab} />

      <p className="text-xs text-ink-navy/35 text-center">
        Per logo e colori vai in <Link href="/food/dashboard/impostazioni?sezione=menu" className="text-electric-blue underline">Impostazioni → Menu & Offerta</Link>
      </p>

    </div>
  )
}

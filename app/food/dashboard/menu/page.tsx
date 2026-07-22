'use client'
import { useEffect, useState } from 'react'
import { IconFork, IconPencil, IconTrash } from '@/app/components/icons'
import { comprimiImmagine } from '@/lib/comprimiImmagine'

interface Piatto {
  id: string
  nome: string
  descrizione: string | null
  prezzo: number
  immagineUrl: string | null
  disponibile: boolean
  ordine: number
}

interface Categoria {
  id: string
  nome: string
  ordine: number
  piatti: Piatto[]
}

// ── Reusable menu editor (locale | asporto) ──────────────────────────────────
function MenuEditor({ tipo }: { tipo: 'locale' | 'asporto' }) {
  const [categorie, setCategorie] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [modalCat, setModalCat] = useState(false)
  const [nomeCat, setNomeCat] = useState('')
  const [editCat, setEditCat] = useState<Categoria | null>(null)
  const [modalPiatto, setModalPiatto] = useState<{ categoriaId: string } | null>(null)
  const [editPiatto, setEditPiatto] = useState<Piatto & { categoriaId: string } | null>(null)
  const [formPiatto, setFormPiatto] = useState({ nome: '', descrizione: '', prezzo: '', immagineUrl: '' })
  const [saving, setSaving] = useState(false)
  const [caricandoFoto, setCaricandoFoto] = useState(false)

  // Carica una foto dal dispositivo: la ridimensiona/comprime lato client e la salva
  // come data URL in immagineUrl (nessun servizio esterno richiesto).
  async function onSelezionaFoto(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Seleziona un file immagine (JPG, PNG…).'); return }
    setCaricandoFoto(true)
    try {
      const dataUrl = await comprimiImmagine(file)
      setFormPiatto(f => ({ ...f, immagineUrl: dataUrl }))
    } catch {
      alert('Non è stato possibile elaborare l\'immagine. Riprova con un\'altra foto.')
    } finally {
      setCaricandoFoto(false)
    }
  }
  const [conferma, setConferma] = useState<{ msg: string; onConfirm: () => void } | null>(null)
  const [copiando, setCopiando] = useState(false)
  const [copiato, setCopiato] = useState(false)

  async function fetchMenu() {
    setLoading(true)
    try {
      const res = await fetch(`/api/menu/categorie?tipo=${tipo}`, { credentials: 'include' })
      if (!res.ok) { console.error('fetchMenu error:', res.status); setLoading(false); return }
      const data = await res.json()
      setCategorie(data.categorie ?? [])
    } catch (e) {
      console.error('fetchMenu exception:', e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchMenu() }, [tipo])

  async function salvaCategoria() {
    if (!nomeCat.trim()) return
    setSaving(true)
    try {
      if (editCat) {
        const res = await fetch(`/api/menu/categorie/${editCat.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: nomeCat }),
        })
        if (!res.ok) throw new Error(`PATCH failed: ${res.status}`)
      } else {
        const res = await fetch('/api/menu/categorie', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: nomeCat, tipo }),
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

  async function eliminaCategoria(id: string) {
    setConferma({ msg: 'Eliminare questa categoria e tutti i suoi piatti?', onConfirm: async () => {
      await fetch(`/api/menu/categorie/${id}`, { method: 'DELETE', credentials: 'include' })
      fetchMenu()
    }})
  }

  async function salvaPiatto() {
    setSaving(true)
    if (editPiatto) {
      await fetch(`/api/menu/piatti/${editPiatto.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formPiatto),
      })
    } else if (modalPiatto) {
      await fetch('/api/menu/piatti', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formPiatto, categoriaId: modalPiatto.categoriaId }),
      })
    }
    setSaving(false); setModalPiatto(null); setEditPiatto(null)
    setFormPiatto({ nome: '', descrizione: '', prezzo: '', immagineUrl: '' }); fetchMenu()
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
      await fetch(`/api/menu/piatti/${id}`, { method: 'DELETE', credentials: 'include' })
      fetchMenu()
    }})
  }

  function apriModificaPiatto(piatto: Piatto, categoriaId: string) {
    setEditPiatto({ ...piatto, categoriaId })
    setFormPiatto({ nome: piatto.nome, descrizione: piatto.descrizione ?? '', prezzo: piatto.prezzo.toString(), immagineUrl: piatto.immagineUrl ?? '' })
  }

  async function copiaDaAltroTipo() {
    const sorgente = tipo === 'locale' ? 'asporto' : 'locale'
    const label = sorgente === 'locale' ? 'Menu tavoli' : 'Menù Menu asporto e delivery'
    setConferma({
      msg: `Copiare tutto il contenuto da "${label}" sovrascrivendo questo menù?`,
      onConfirm: async () => {
        setCopiando(true)
        await fetch('/api/menu/copia', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ da: sorgente, a: tipo }),
        })
        setCopiando(false); setCopiato(true)
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
          <button onClick={() => { setEditCat(null); setNomeCat(''); setModalCat(true) }}
            className="bg-electric-blue text-white px-4 py-2 rounded-xl font-medium hover:bg-electric-blue/90 text-sm">
            + Categoria
          </button>
          <button onClick={copiaDaAltroTipo} disabled={copiando}
            className="border border-ink-navy/15 text-ink-navy/70 px-4 py-2 rounded-xl font-medium hover:bg-mist text-sm disabled:opacity-50">
            {copiato ? '✓ Copiato' : copiando ? 'Copia...' : `↓ Importa da ${altroLabel}`}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-ink-navy/35 text-sm">Caricamento...</p>
      ) : categorie.length === 0 ? (
        <div className="bg-white rounded-2xl border border-ink-navy/10 p-16 text-center shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-3 mx-auto mb-4">
            <IconFork />
          </div>
          <h3 className="text-lg font-semibold text-ink-navy">Nessuna categoria</h3>
          <p className="text-ink-navy/50 text-sm mt-2">Crea una categoria per iniziare ad aggiungere piatti</p>
          <div className="flex gap-2 justify-center mt-4">
            <button onClick={() => { setEditCat(null); setNomeCat(''); setModalCat(true) }}
              className="bg-electric-blue text-white px-5 py-2 rounded-xl font-medium hover:bg-electric-blue/90 text-sm">
              + Aggiungi categoria
            </button>
            <button onClick={copiaDaAltroTipo}
              className="border border-ink-navy/15 text-ink-navy/70 px-5 py-2 rounded-xl font-medium hover:bg-mist text-sm">
              Importa da {altroLabel}
            </button>
          </div>
        </div>
      ) : (
        categorie.map(cat => (
          <div key={cat.id} className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-navy/8 bg-mist">
              <h2 className="font-bold text-ink-navy">{cat.nome}
                <span className="ml-2 text-xs font-normal text-ink-navy/35">{cat.piatti.length} piatt{cat.piatti.length === 1 ? 'o' : 'i'}</span>
              </h2>
              <div className="flex gap-2">
                <button onClick={() => { setEditCat(cat); setNomeCat(cat.nome); setModalCat(true) }}
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
                {cat.piatti.map(p => (
                  <div key={p.id} className={`flex items-center gap-4 px-5 py-3.5 ${!p.disponibile ? 'opacity-50' : ''}`}>
                    {p.immagineUrl ? (
                      <img src={p.immagineUrl} alt={p.nome} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-mist flex items-center justify-center p-3.5 text-ink-navy/25 shrink-0"><IconFork /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink-navy truncate">{p.nome}</p>
                      {p.descrizione && <p className="text-sm text-ink-navy/50 truncate">{p.descrizione}</p>}
                      <p className="text-electric-blue font-bold text-sm mt-0.5">€{p.prezzo.toFixed(2)}</p>
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
            <h3 className="text-lg font-bold text-ink-navy">{editCat ? 'Rinomina categoria' : 'Nuova categoria'}</h3>
            <input value={nomeCat} onChange={e => setNomeCat(e.target.value)}
              placeholder="es. Antipasti, Primi, Dolci..."
              className="w-full border border-ink-navy/15 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue"
              autoFocus onKeyDown={e => e.key === 'Enter' && nomeCat.trim() && salvaCategoria()} />
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
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setModalPiatto(null); setEditPiatto(null); setFormPiatto({ nome: '', descrizione: '', prezzo: '', immagineUrl: '' }) }}
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
        Per logo e colori vai in <a href="/food/dashboard/impostazioni?sezione=menu" className="text-electric-blue underline">Impostazioni → Menu & Offerta</a>
      </p>

    </div>
  )
}

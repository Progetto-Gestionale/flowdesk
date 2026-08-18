'use client'
import { useEffect, useRef, useState } from 'react'
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
  const [formPiatto, setFormPiatto] = useState<{ nome: string; descrizione: string; prezzo: string; immagineUrl: string; allergeni: string[] }>({ nome: '', descrizione: '', prezzo: '', immagineUrl: '', allergeni: [] })
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
      const res = await fetch(`/api/menu/categorie/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? 'Errore durante l\'eliminazione.'); return }
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
    setFormPiatto({ nome: '', descrizione: '', prezzo: '', immagineUrl: '', allergeni: [] }); fetchMenu()
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
    setFormPiatto({ nome: piatto.nome, descrizione: piatto.descrizione ?? '', prezzo: piatto.prezzo.toString(), immagineUrl: piatto.immagineUrl ?? '', allergeni: piatto.allergeni ?? [] })
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
          <button onClick={() => { setEditCat(null); setNomeCat(''); setModalCat(true) }}
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
            <button onClick={() => { setEditCat(null); setNomeCat(''); setModalCat(true) }}
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
              <button onClick={() => { setModalPiatto(null); setEditPiatto(null); setFormPiatto({ nome: '', descrizione: '', prezzo: '', immagineUrl: '', allergeni: [] }) }}
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
// ── Menu da stampare (PDF) ────────────────────────────────────────────────────
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

interface PdfCat { nome: string; piatti: { nome: string; descrizione: string | null; prezzo: number; disponibile: boolean }[] }
interface PdfOpts {
  tipoLabel: string
  nomeLocale: string
  categorie: PdfCat[]
  header: string
  footer: string
  accent: string
  textScale: number
  logoUrl: string | null
  showLogo: boolean
  mostraData: boolean
}

// Documento HTML del menu: usato sia per l'anteprima (iframe) sia per la stampa/PDF (nuova finestra).
// Grafica volutamente neutra ed elegante — cornice colorata, titolo centrato, categorie con filetto,
// nome piatto nel colore accento, descrizione grigia, prezzo a destra — così va bene per la maggior parte dei locali.
function buildMenuDoc(o: PdfOpts, forPrint: boolean): string {
  const base = 15 * o.textScale
  const dataLabel = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const righe = o.categorie.map(cat => {
    const piatti = cat.piatti.filter(p => p.disponibile)
    if (piatti.length === 0) return ''
    return `<div class="cat">
      <div class="cat-h"><span>${escapeHtml(cat.nome)}</span><i></i></div>
      ${piatti.map(p => `<div class="piatto">
        <div class="pi">
          <div class="pn">${escapeHtml(p.nome)}</div>
          ${p.descrizione ? `<div class="pd">${escapeHtml(p.descrizione)}</div>` : ''}
        </div>
        <div class="pp">€${p.prezzo.toFixed(2)}</div>
      </div>`).join('')}
    </div>`
  }).join('')

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(o.tipoLabel)}${o.nomeLocale ? ' — ' + escapeHtml(o.nomeLocale) : ''}</title>
  <style>
    @page { size: A4; margin: 0 }
    * { box-sizing: border-box; margin: 0; padding: 0 }
    html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1f36; font-size: ${base}px }
    .frame { border: 10px solid ${o.accent}; min-height: 100vh; padding: 40px 44px; display: flex; flex-direction: column }
    .top { text-align: center; margin-bottom: 26px }
    .logo { width: 82px; height: 82px; object-fit: contain; margin: 0 auto 14px; display: block }
    h1 { font-size: ${(base * 2.1).toFixed(1)}px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: ${o.accent}; line-height: 1.05 }
    .sub { font-size: ${(base * 0.85).toFixed(1)}px; color: #6b7280; margin-top: 6px; text-transform: capitalize }
    .cat { margin-bottom: 22px; break-inside: avoid }
    .cat-h { display: flex; align-items: center; gap: 12px; margin-bottom: 10px }
    .cat-h span { font-size: ${base.toFixed(1)}px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: ${o.accent}; white-space: nowrap }
    .cat-h i { flex: 1; height: 2px; background: ${o.accent}; opacity: .45; display: block }
    .piatto { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding: 6px 0 }
    .pi { flex: 1 }
    .pn { font-size: ${(base * 1.02).toFixed(1)}px; font-weight: 700; color: ${o.accent} }
    .pd { font-size: ${(base * 0.82).toFixed(1)}px; color: #6b7280; margin-top: 2px }
    .pp { font-size: ${base.toFixed(1)}px; font-weight: 800; color: #1a1f36; white-space: nowrap }
    .foot { margin-top: auto; padding-top: 24px; text-align: center; font-size: ${(base * 0.85).toFixed(1)}px; color: #6b7280; white-space: pre-line }
    .empty { color: #9ca3af; font-size: ${base.toFixed(1)}px; text-align: center; padding: 40px 0 }
  </style></head><body>
    <div class="frame">
      <div class="top">
        ${o.showLogo && o.logoUrl ? `<img class="logo" src="${o.logoUrl}" alt="logo" crossorigin="anonymous">` : ''}
        <h1>${escapeHtml(o.header || o.nomeLocale || 'Menù')}</h1>
        ${o.mostraData ? `<div class="sub">${dataLabel}</div>` : ''}
      </div>
      ${righe || '<p class="empty">Nessun piatto disponibile in questo menu</p>'}
      ${o.footer.trim() ? `<div class="foot">${escapeHtml(o.footer)}</div>` : ''}
    </div>
    ${forPrint ? '<script>window.onload=()=>{setTimeout(()=>{window.focus();window.print()},350)}<\/script>' : ''}
  </body></html>`
}

// Editor "contenuto": piatti selezionabili e riordinabili (solo i selezionati finiscono nel PDF).
interface FetchedCat { id: string; nome: string; piatti: { id: string; nome: string; descrizione: string | null; prezzo: number; disponibile: boolean }[] }
interface PanelPiatto { id: string; nome: string; descrizione: string | null; prezzo: number; on: boolean }
interface PanelCat { id: string; nome: string; piatti: PanelPiatto[] }

function MenuStampaPanel() {
  const [tipo, setTipo] = useState<'locale' | 'asporto'>('locale')
  const [settings, setSettings] = useState<{ nomeLocale?: string; menuLogoUrl?: string | null; menuColoreP?: string } | null>(null)
  const [catByTipo, setCatByTipo] = useState<Record<string, FetchedCat[]>>({})
  // Selezione + ordinamento locale del contenuto (per la generazione PDF).
  const [items, setItems] = useState<PanelCat[]>([])
  const [header, setHeader] = useState('')
  const [footer, setFooter] = useState('')
  const [accent, setAccent] = useState('#dc2626')
  const [showLogo, setShowLogo] = useState(true)
  const [mostraData, setMostraData] = useState(true)
  const [textScale, setTextScale] = useState(1)

  // Anteprima scalata: misuro il contenitore e adatto l'iframe A4 (794px) con transform.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.42)
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (el.clientWidth) setScale(el.clientWidth / 794) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).then(s => {
      setSettings(s)
      if (s.menuColoreP) setAccent(s.menuColoreP)
      setHeader(prev => prev || s.nomeLocale || 'Menù del giorno')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (catByTipo[tipo]) return
    fetch(`/api/menu/categorie?tipo=${tipo}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCatByTipo(prev => ({ ...prev, [tipo]: d.categorie ?? [] })))
      .catch(() => {})
  }, [tipo, catByTipo])

  // Quando arrivano i dati del tipo scelto, (ri)costruisco il contenuto: solo piatti disponibili,
  // tutti selezionati e nell'ordine del menu. Cambiando tipo il contenuto riparte da capo.
  useEffect(() => {
    const cats = catByTipo[tipo]
    if (!cats) return
    setItems(cats.map(c => ({
      id: c.id, nome: c.nome,
      piatti: c.piatti.filter(p => p.disponibile).map(p => ({ id: p.id, nome: p.nome, descrizione: p.descrizione, prezzo: p.prezzo, on: true })),
    })))
  }, [tipo, catByTipo])

  function togglePiatto(ci: number, pi: number) {
    setItems(prev => prev.map((c, i) => i !== ci ? c : { ...c, piatti: c.piatti.map((p, j) => j !== pi ? p : { ...p, on: !p.on }) }))
  }
  function toggleCat(ci: number, value: boolean) {
    setItems(prev => prev.map((c, i) => i !== ci ? c : { ...c, piatti: c.piatti.map(p => ({ ...p, on: value })) }))
  }
  function setAll(value: boolean) {
    setItems(prev => prev.map(c => ({ ...c, piatti: c.piatti.map(p => ({ ...p, on: value })) })))
  }
  function moveCat(ci: number, dir: -1 | 1) {
    const j = ci + dir
    setItems(prev => { if (j < 0 || j >= prev.length) return prev; const n = [...prev];[n[ci], n[j]] = [n[j], n[ci]]; return n })
  }
  function movePiatto(ci: number, pi: number, dir: -1 | 1) {
    setItems(prev => prev.map((c, i) => {
      if (i !== ci) return c
      const j = pi + dir
      if (j < 0 || j >= c.piatti.length) return c
      const pp = [...c.piatti];[pp[pi], pp[j]] = [pp[j], pp[pi]]
      return { ...c, piatti: pp }
    }))
  }
  const totSelezionati = items.reduce((s, c) => s + c.piatti.filter(p => p.on).length, 0)

  const tipoLabel = tipo === 'locale' ? 'Menu Tavoli' : 'Menu Asporto & Delivery'
  // Solo i piatti selezionati, nell'ordine scelto nell'editor. Le categorie senza piatti selezionati
  // vengono saltate automaticamente dal builder.
  const pdfCategorie: PdfCat[] = items.map(c => ({
    nome: c.nome,
    piatti: c.piatti.filter(p => p.on).map(p => ({ nome: p.nome, descrizione: p.descrizione, prezzo: p.prezzo, disponibile: true })),
  }))
  const opts: PdfOpts = {
    tipoLabel, nomeLocale: settings?.nomeLocale ?? '', categorie: pdfCategorie,
    header, footer, accent, textScale, logoUrl: settings?.menuLogoUrl ?? null, showLogo, mostraData,
  }
  const previewDoc = buildMenuDoc(opts, false)

  function scarica() {
    if (totSelezionati === 0) return
    const w = window.open('', '_blank')
    if (w) { w.document.write(buildMenuDoc(opts, true)); w.document.close() }
  }

  const inputCls = 'w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm text-ink-navy focus:outline-none focus:ring-2 focus:ring-electric-blue/30'

  return (
    <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-5">
      <div className="mb-4">
        <p className="font-semibold text-ink-navy">Menu da stampare (PDF)</p>
        <p className="text-xs text-ink-navy/50 mt-0.5">Scegli quale menu, personalizza qualche dettaglio e scarica il PDF pronto da stampare.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Controlli */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Quale menu</label>
            <div className="flex gap-1 bg-mist rounded-xl p-1 mt-1.5 w-fit">
              {([['locale', 'Tavoli'], ['asporto', 'Asporto & Delivery']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTipo(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tipo === k ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Scritta in cima</label>
            <input type="text" value={header} onChange={e => setHeader(e.target.value)} placeholder="es. Menù del giorno" className={`${inputCls} mt-1.5`} />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Scritta in fondo</label>
            <textarea value={footer} onChange={e => setFooter(e.target.value)} rows={2} placeholder="es. Coperto €2 · Wi-Fi: pop-cafe · Grazie e a presto!"
              className={`${inputCls} mt-1.5 resize-none`} />
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Colore</label>
              <div className="flex items-center gap-2 mt-1.5">
                <input type="color" value={accent} onChange={e => setAccent(e.target.value)}
                  className="w-9 h-9 rounded-lg border border-ink-navy/15 cursor-pointer bg-white p-0.5" />
                <span className="text-xs text-ink-navy/45 font-mono">{accent}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Dimensione testo</label>
              <div className="flex gap-1 bg-mist rounded-xl p-1 mt-1.5 w-fit">
                {([['S', 0.9], ['M', 1], ['L', 1.15]] as const).map(([l, v]) => (
                  <button key={l} onClick={() => setTextScale(v)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${textScale === v ? 'bg-white text-ink-navy shadow-sm' : 'text-ink-navy/50 hover:text-ink-navy/70'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            {settings?.menuLogoUrl && (
              <label className="flex items-center gap-2 text-sm text-ink-navy/70 cursor-pointer select-none">
                <input type="checkbox" checked={showLogo} onChange={e => setShowLogo(e.target.checked)} className="w-4 h-4 rounded accent-electric-blue" />
                Mostra logo
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-ink-navy/70 cursor-pointer select-none">
              <input type="checkbox" checked={mostraData} onChange={e => setMostraData(e.target.checked)} className="w-4 h-4 rounded accent-electric-blue" />
              Mostra data di oggi
            </label>
          </div>

          <button onClick={scarica} disabled={totSelezionati === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: accent }}>
            ↓ Scarica PDF — {tipo === 'locale' ? 'Menu Tavoli' : 'Menu Asporto'} ({totSelezionati})
          </button>
          {!settings?.menuLogoUrl && (
            <p className="text-xs text-ink-navy/35">
              Per il logo caricalo in <Link href="/food/dashboard/impostazioni?sezione=menu" className="text-electric-blue underline">Impostazioni → Menu &amp; Offerta</Link>.
            </p>
          )}
        </div>

        {/* Anteprima */}
        <div>
          <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">Anteprima</label>
          <div className="mt-1.5 rounded-xl border border-ink-navy/10 bg-mist/40 p-3">
            <div ref={wrapRef} style={{ width: '100%', height: 1123 * scale, position: 'relative', overflow: 'hidden' }}>
              <iframe title="Anteprima menu" srcDoc={previewDoc} scrolling="no"
                style={{ width: 794, height: 1123, border: 0, transformOrigin: 'top left', transform: `scale(${scale})`, pointerEvents: 'none', background: '#fff' }} />
            </div>
          </div>
          <p className="text-[11px] text-ink-navy/35 mt-1.5 text-center">Anteprima indicativa · nel PDF il menu si impagina su A4</p>
        </div>
      </div>

      {/* ── Contenuto: seleziona e riordina i piatti da includere ── */}
      <div className="mt-6 border-t border-ink-navy/10 pt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <label className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wide">
            Contenuto — {totSelezionati} piatt{totSelezionati === 1 ? 'o' : 'i'} nel PDF
          </label>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setAll(true)} className="px-2.5 py-1 rounded-lg text-electric-blue hover:bg-electric-blue/10 font-medium">Seleziona tutti</button>
            <button onClick={() => setAll(false)} className="px-2.5 py-1 rounded-lg text-ink-navy/50 hover:bg-mist font-medium">Deseleziona tutti</button>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-ink-navy/35 py-3">Nessun piatto disponibile in questo menu.</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {items.map((c, ci) => {
              const tutti = c.piatti.length > 0 && c.piatti.every(p => p.on)
              return (
                <div key={c.id} className="rounded-xl border border-ink-navy/10 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-mist/60 border-b border-ink-navy/8">
                    <input type="checkbox" checked={tutti} onChange={e => toggleCat(ci, e.target.checked)}
                      className="w-4 h-4 rounded accent-electric-blue shrink-0" />
                    <span className="font-semibold text-sm text-ink-navy flex-1 truncate">{c.nome}</span>
                    <div className="flex flex-col shrink-0 -my-1">
                      <button onClick={() => moveCat(ci, -1)} disabled={ci === 0} aria-label="Sposta categoria su"
                        className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▲</button>
                      <button onClick={() => moveCat(ci, 1)} disabled={ci === items.length - 1} aria-label="Sposta categoria giù"
                        className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▼</button>
                    </div>
                  </div>
                  {c.piatti.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-ink-navy/30">Nessun piatto disponibile</p>
                  ) : (
                    <div className="divide-y divide-ink-navy/6">
                      {c.piatti.map((p, pi) => (
                        <div key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                          <input type="checkbox" checked={p.on} onChange={() => togglePiatto(ci, pi)}
                            className="w-4 h-4 rounded accent-electric-blue shrink-0" />
                          <span className={`text-sm flex-1 truncate ${p.on ? 'text-ink-navy' : 'text-ink-navy/40 line-through'}`}>{p.nome}</span>
                          <span className="text-xs text-ink-navy/40 shrink-0">€{p.prezzo.toFixed(2)}</span>
                          <div className="flex flex-col shrink-0 -my-1">
                            <button onClick={() => movePiatto(ci, pi, -1)} disabled={pi === 0} aria-label="Sposta piatto su"
                              className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▲</button>
                            <button onClick={() => movePiatto(ci, pi, 1)} disabled={pi === c.piatti.length - 1} aria-label="Sposta piatto giù"
                              className="text-ink-navy/30 hover:text-electric-blue disabled:opacity-20 leading-none px-1 text-[11px]">▼</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

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

      {/* ── Menu stampabile (PDF) ── */}
      <MenuStampaPanel />

      <p className="text-xs text-ink-navy/35 text-center">
        Per logo e colori vai in <Link href="/food/dashboard/impostazioni?sezione=menu" className="text-electric-blue underline">Impostazioni → Menu & Offerta</Link>
      </p>

    </div>
  )
}

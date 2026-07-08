'use client'
import { useEffect, useState } from 'react'

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

export default function MenuPage() {
  const [tab, setTab] = useState<'menu' | 'grafica'>('menu')

  // ── Menu state ──
  const [categorie, setCategorie] = useState<Categoria[]>([])
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [modalCat, setModalCat] = useState(false)
  const [nomeCat, setNomeCat] = useState('')
  const [editCat, setEditCat] = useState<Categoria | null>(null)
  const [modalPiatto, setModalPiatto] = useState<{ categoriaId: string } | null>(null)
  const [editPiatto, setEditPiatto] = useState<Piatto & { categoriaId: string } | null>(null)
  const [formPiatto, setFormPiatto] = useState({ nome: '', descrizione: '', prezzo: '', immagineUrl: '' })
  const [saving, setSaving] = useState(false)
  const [conferma, setConferma] = useState<{ msg: string; onConfirm: () => void } | null>(null)

  // ── Grafica state ──
  const [grafica, setGrafica] = useState({ menuLogoUrl: '', menuColoreP: '#4f46e5', menuColoreS: '#ffffff' })
  const [loadingGrafica, setLoadingGrafica] = useState(true)
  const [savingGrafica, setSavingGrafica] = useState(false)
  const [graficaSalvata, setGraficaSalvata] = useState(false)

  async function fetchMenu() {
    const res = await fetch('/api/menu/categorie', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setCategorie(data.categorie ?? [])
    setLoadingMenu(false)
  }

  async function fetchGrafica() {
    const res = await fetch('/api/settings', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    setGrafica({
      menuLogoUrl: data.menuLogoUrl ?? '',
      menuColoreP: data.menuColoreP ?? '#4f46e5',
      menuColoreS: data.menuColoreS ?? '#ffffff',
    })
    setLoadingGrafica(false)
  }

  useEffect(() => { fetchMenu(); fetchGrafica() }, [])

  // ── Menu functions ──
  async function salvaCategoria() {
    setSaving(true)
    if (editCat) {
      await fetch(`/api/menu/categorie/${editCat.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeCat }),
      })
    } else {
      await fetch('/api/menu/categorie', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeCat }),
      })
    }
    setSaving(false); setModalCat(false); setNomeCat(''); setEditCat(null); fetchMenu()
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

  // ── Grafica functions ──
  async function salvaGrafica() {
    setSavingGrafica(true)
    await fetch('/api/settings', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(grafica),
    })
    setSavingGrafica(false)
    setGraficaSalvata(true)
    setTimeout(() => setGraficaSalvata(false), 3000)
  }

  const isModalOpen = modalPiatto !== null || editPiatto !== null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestisci categorie, piatti e aspetto del menu digitale</p>
        </div>
        {tab === 'menu' && (
          <button onClick={() => { setEditCat(null); setNomeCat(''); setModalCat(true) }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 text-sm">
            + Categoria
          </button>
        )}
      </div>

      {/* Tab */}
      <div className="flex gap-2">
        {[{ key: 'menu', label: '🍽️ Piatti' }, { key: 'grafica', label: '🎨 Aspetto' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB MENU ── */}
      {tab === 'menu' && (
        <div className="space-y-6">
          {loadingMenu ? (
            <p className="text-gray-400 text-sm">Caricamento...</p>
          ) : categorie.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
              <div className="text-5xl mb-4">🍽️</div>
              <h3 className="text-lg font-semibold text-gray-800">Nessuna categoria</h3>
              <p className="text-gray-500 text-sm mt-2">Crea una categoria per iniziare ad aggiungere piatti</p>
              <button onClick={() => { setEditCat(null); setNomeCat(''); setModalCat(true) }}
                className="mt-4 bg-indigo-600 text-white px-5 py-2 rounded-xl font-medium hover:bg-indigo-700 text-sm">
                + Aggiungi categoria
              </button>
            </div>
          ) : (
            categorie.map(cat => (
              <div key={cat.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
                  <h2 className="font-bold text-gray-900">{cat.nome}
                    <span className="ml-2 text-xs font-normal text-gray-400">{cat.piatti.length} piatt{cat.piatti.length === 1 ? 'o' : 'i'}</span>
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditCat(cat); setNomeCat(cat.nome); setModalCat(true) }}
                      className="text-xs px-2.5 py-1 rounded-lg text-gray-500 hover:bg-gray-200 transition-colors">✏️ Rinomina</button>
                    <button onClick={() => setModalPiatto({ categoriaId: cat.id })}
                      className="text-xs px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium transition-colors">+ Piatto</button>
                    <button onClick={() => eliminaCategoria(cat.id)}
                      className="text-xs px-2.5 py-1 rounded-lg text-red-400 hover:bg-red-50 transition-colors">🗑️</button>
                  </div>
                </div>
                {cat.piatti.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-gray-400 text-sm">Nessun piatto — clicca "+ Piatto" per aggiungerne uno</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {cat.piatti.map(p => (
                      <div key={p.id} className={`flex items-center gap-4 px-5 py-3.5 ${!p.disponibile ? 'opacity-50' : ''}`}>
                        {p.immagineUrl ? (
                          <img src={p.immagineUrl} alt={p.nome} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">🍴</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{p.nome}</p>
                          {p.descrizione && <p className="text-sm text-gray-500 truncate">{p.descrizione}</p>}
                          <p className="text-indigo-600 font-bold text-sm mt-0.5">€{p.prezzo.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => toggleDisponibile(p)}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${p.disponibile ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                            {p.disponibile ? 'Disponibile' : 'Non disp.'}
                          </button>
                          <button onClick={() => apriModificaPiatto(p, cat.id)}
                            className="text-gray-400 hover:text-indigo-500 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors">✏️</button>
                          <button onClick={() => eliminaPiatto(p.id)}
                            className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB GRAFICA ── */}
      {tab === 'grafica' && (
        <div className="space-y-5 max-w-lg">
          {loadingGrafica ? <p className="text-gray-400 text-sm">Caricamento...</p> : (
            <>
              {/* Logo */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
                <h2 className="font-semibold text-gray-800">Logo del locale</h2>
                <p className="text-sm text-gray-500">Inserisci l'URL di un'immagine — verrà mostrata in cima al menu digitale.</p>
                <input value={grafica.menuLogoUrl} onChange={e => setGrafica(g => ({ ...g, menuLogoUrl: e.target.value }))}
                  placeholder="https://esempio.com/logo.png"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                {grafica.menuLogoUrl && (
                  <img src={grafica.menuLogoUrl} alt="preview logo" className="h-16 w-16 rounded-xl object-cover border border-gray-200" />
                )}
              </div>

              {/* Colori */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-gray-800">Colori del menu</h2>
                <div className="flex gap-6 flex-wrap">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Colore principale</label>
                    <p className="text-xs text-gray-400">Bottoni, prezzi, tab categorie</p>
                    <div className="flex items-center gap-3">
                      <input type="color" value={grafica.menuColoreP} onChange={e => setGrafica(g => ({ ...g, menuColoreP: e.target.value }))}
                        className="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
                      <span className="text-sm font-mono text-gray-600">{grafica.menuColoreP}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Colore secondario</label>
                    <p className="text-xs text-gray-400">Testo sui bottoni colorati</p>
                    <div className="flex items-center gap-3">
                      <input type="color" value={grafica.menuColoreS} onChange={e => setGrafica(g => ({ ...g, menuColoreS: e.target.value }))}
                        className="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
                      <span className="text-sm font-mono text-gray-600">{grafica.menuColoreS}</span>
                    </div>
                  </div>
                </div>

                {/* Anteprima */}
                <div className="mt-2 p-4 rounded-xl border border-gray-100 bg-gray-50 space-y-2">
                  <p className="text-xs text-gray-400 mb-3">Anteprima</p>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm" style={{ color: grafica.menuColoreP }}>€12.00</span>
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
                      style={{ backgroundColor: grafica.menuColoreP, color: grafica.menuColoreS }}>+</button>
                  </div>
                  <button className="w-full py-2.5 rounded-xl text-sm font-bold"
                    style={{ backgroundColor: grafica.menuColoreP, color: grafica.menuColoreS }}>
                    Vedi ordine · €24.00
                  </button>
                </div>
              </div>

              <button onClick={salvaGrafica} disabled={savingGrafica}
                className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {savingGrafica ? 'Salvataggio...' : graficaSalvata ? '✅ Salvato' : 'Salva impostazioni grafica'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Modal categoria */}
      {modalCat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">{editCat ? 'Rinomina categoria' : 'Nuova categoria'}</h3>
            <input value={nomeCat} onChange={e => setNomeCat(e.target.value)}
              placeholder="es. Antipasti, Primi, Dolci..."
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus onKeyDown={e => e.key === 'Enter' && nomeCat.trim() && salvaCategoria()} />
            <div className="flex gap-3">
              <button onClick={() => { setModalCat(false); setNomeCat(''); setEditCat(null) }}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">Annulla</button>
              <button onClick={salvaCategoria} disabled={saving || !nomeCat.trim()}
                className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50">
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
            <h3 className="text-lg font-bold text-gray-900">{editPiatto ? 'Modifica piatto' : 'Nuovo piatto'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input value={formPiatto.nome} onChange={e => setFormPiatto(f => ({ ...f, nome: e.target.value }))}
                  placeholder="es. Spaghetti alla carbonara"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
                <textarea value={formPiatto.descrizione} onChange={e => setFormPiatto(f => ({ ...f, descrizione: e.target.value }))}
                  placeholder="Ingredienti, allergeni, varianti..."
                  rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prezzo (€) *</label>
                <input type="number" step="0.50" min="0" value={formPiatto.prezzo}
                  onChange={e => setFormPiatto(f => ({ ...f, prezzo: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL immagine</label>
                <input value={formPiatto.immagineUrl} onChange={e => setFormPiatto(f => ({ ...f, immagineUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                {formPiatto.immagineUrl && (
                  <img src={formPiatto.immagineUrl} alt="preview" className="mt-2 w-full h-32 object-cover rounded-xl" />
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setModalPiatto(null); setEditPiatto(null); setFormPiatto({ nome: '', descrizione: '', prezzo: '', immagineUrl: '' }) }}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">Annulla</button>
              <button onClick={salvaPiatto} disabled={saving || !formPiatto.nome || !formPiatto.prezzo}
                className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 text-sm disabled:opacity-50">
                {saving ? '...' : editPiatto ? 'Salva modifiche' : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {conferma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConferma(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-gray-800 mb-4">{conferma.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setConferma(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Annulla</button>
              <button onClick={async () => { await conferma.onConfirm(); setConferma(null) }} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600">Conferma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

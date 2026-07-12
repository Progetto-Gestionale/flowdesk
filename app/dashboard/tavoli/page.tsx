'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { IconTable, IconCheck, IconTrash, IconPencil, IconUnlink } from '../../components/icons'

// ── Tipi ─────────────────────────────────────────────────────────────────────
interface Tavolo { id: string; numero: number; etichetta: string | null; posti: number; note: string | null; gruppoId: string | null }
interface Gruppo { id: string; label: string; tavoli: { id: string; numero: number; etichetta: string | null }[] }
interface MapData { forma: 'quadrato' | 'cerchio'; colore: string; w: number; h: number; x: number; y: number }
interface Elemento { id: string; tipo: string; label: string; x: number; y: number; w: number; h: number; colore: string }

// ── Costanti ──────────────────────────────────────────────────────────────────
const COLORI_PRESET = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#64748b']
const DEFAULT_VISUAL: Omit<MapData,'x'|'y'> = { forma: 'quadrato', colore: '#6366f1', w: 110, h: 110 }
const CANVAS_W = 1400
const CANVAS_H = 800
const TIPI_ELEMENTO = [
  { tipo: 'bagno', label: 'Bagno', colore: '#bfdbfe', w: 80, h: 60 },
  { tipo: 'cucina', label: 'Cucina', colore: '#fecaca', w: 160, h: 90 },
  { tipo: 'bancone', label: 'Bancone', colore: '#d1d5db', w: 200, h: 55 },
  { tipo: 'ingresso', label: 'Ingresso', colore: '#bbf7d0', w: 60, h: 100 },
  { tipo: 'muro',     label: 'Muro',        colore: '#374151', w: 220, h: 22  },
]

// ── DB helpers ────────────────────────────────────────────────────────────────
function tavoloToMD(t: { mapX?: number | null; mapY?: number | null; mapW?: number | null; mapH?: number | null; mapForma?: string | null; mapColore?: string | null }, i: number): MapData {
  const hasPos = t.mapX != null && t.mapY != null
  return {
    forma: (t.mapForma as MapData['forma']) ?? DEFAULT_VISUAL.forma,
    colore: t.mapColore ?? DEFAULT_VISUAL.colore,
    w: t.mapW ?? DEFAULT_VISUAL.w,
    h: t.mapH ?? DEFAULT_VISUAL.h,
    x: t.mapX ?? (60 + (i % 5) * 190),
    y: t.mapY ?? (60 + Math.floor(i / 5) * 190),
  }
}
async function saveMD(id: string, d: MapData) {
  await fetch(`/api/tavoli/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapX: d.x, mapY: d.y, mapW: d.w, mapH: d.h, mapForma: d.forma, mapColore: d.colore }),
  })
}
async function saveEl(el: Elemento[]) {
  await fetch('/api/settings', {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapElementi: JSON.stringify(el) }),
  })
}

// ── QR Canvas ─────────────────────────────────────────────────────────────────
function QRCanvas({ url, id }: { url: string; id: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) QRCode.toCanvas(ref.current, url, { width: 180, margin: 2, color: { dark: '#1e1b4b', light: '#fff' } }) }, [url])
  return <canvas ref={ref} id={id} className="rounded-xl" />
}

// ── Vista LISTA ───────────────────────────────────────────────────────────────
function VistaLista({ tavoli, gruppi, publicId, onModifica, onElimina, selectMode, selectedIds, onToggleSelect, onSciogliGruppo, tavoloAppMap, tavoloCarryMap, tavoloAppsMap }: {
  tavoli: Tavolo[]; gruppi: Gruppo[]; publicId: string | null
  onModifica: (t: Tavolo) => void; onElimina: (id: string) => void
  selectMode: boolean; selectedIds: string[]; onToggleSelect: (id: string) => void
  onSciogliGruppo: (gruppoId: string) => void
  tavoloAppMap?: Map<string, AppuntamentoLight>
  tavoloCarryMap?: Map<string, { carryIn: boolean; carryOut: boolean }>
  tavoloAppsMap?: Map<string, (AppuntamentoLight & { carryIn: boolean; carryOut: boolean })[]>
}) {
  const [qrAperto, setQrAperto] = useState<string | null>(null)
  const base = typeof window !== 'undefined' ? window.location.origin : ''

  function scarica(id: string, num: number) {
    const c = document.getElementById(`qr-${id}`) as HTMLCanvasElement
    if (!c) return; const a = document.createElement('a'); a.download = `qr-${num}.png`; a.href = c.toDataURL(); a.click()
  }
  function stampa(id: string, label: string) {
    const c = document.getElementById(`qr-${id}`) as HTMLCanvasElement; if (!c) return
    const w = window.open('', '_blank')!
    w.document.write(`<html><head><style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif}img{width:240px;height:240px}h2{margin:12px 0 4px;font-size:20px;font-weight:700}p{color:#666;font-size:13px;margin:0}</style></head><body><img src="${c.toDataURL()}"/><h2>${label}</h2><p>Scannerizza per ordinare</p><script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  const gruppoByTavoloId = new Map<string, Gruppo>()
  gruppi.forEach(g => g.tavoli.forEach(t => gruppoByTavoloId.set(t.id, g)))

  // Calcola fusioni per turno (stesso appuntamento con 2+ tavoli)
  const appConPiuTavoli = new Set<string>()
  if (tavoloAppMap) {
    const count = new Map<string, number>()
    tavoloAppMap.forEach(a => count.set(a.id, (count.get(a.id) ?? 0) + 1))
    count.forEach((n, id) => { if (n >= 2) appConPiuTavoli.add(id) })
  }

  if (!tavoli.length) return (
    <div className="bg-white rounded-2xl border border-ink-navy/10 p-16 text-center shadow-sm">
      <div className="w-12 h-12 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-3 mx-auto mb-4">
        <IconTable />
      </div>
      <p className="text-ink-navy/50 text-sm">Nessun tavolo ancora</p>
    </div>
  )
  return (
    <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden">
      <div className="divide-y divide-gray-100">
        {tavoli.map(t => {
          const label = t.etichetta ?? `Tavolo ${t.numero}`
          const url = publicId ? `${base}/ordina/${publicId}/${t.numero}` : ''
          const gruppo = gruppoByTavoloId.get(t.id)
          const isSelected = selectedIds.includes(t.id)
          const appsDelTavolo = tavoloAppsMap?.get(t.id) ?? []
          const appAssegnato = appsDelTavolo[0] ?? tavoloAppMap?.get(t.id)
          const isFusoPerTurno = appAssegnato ? appConPiuTavoli.has(appAssegnato.id) : false
          const labelFusoTurno = isFusoPerTurno && tavoloAppMap
            ? `T${Array.from(tavoloAppMap.entries()).filter(([,a]) => a.id === appAssegnato!.id).map(([tid]) => tavoli.find(tv=>tv.id===tid)?.numero).filter(Boolean).sort((a,b)=>(a as number)-(b as number)).join('+')}`
            : null
          return (
            <div key={t.id} className={isSelected ? 'bg-electric-blue/10' : appsDelTavolo.length > 0 ? 'bg-red-50/40' : ''}>
              <div className="flex items-center gap-4 px-5 py-4">
                {selectMode && (
                  <button onClick={() => onToggleSelect(t.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-electric-blue border-electric-blue text-white' : 'border-ink-navy/15'}`}>
                    {isSelected && <span className="w-3 h-3 text-white"><IconCheck /></span>}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-ink-navy">{label}</p>
                    {isFusoPerTurno && labelFusoTurno && (
                      <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                         {labelFusoTurno} (turno)
                      </span>
                    )}
                    {gruppo && !isFusoPerTurno && (
                      <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                         T{gruppo.label}
                      </span>
                    )}
                    {appsDelTavolo.map((a, i) => (
                      <span key={a.id} className="flex items-center gap-1">
                        <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                          {a.clienteNome?.split(' ')[0] ?? 'Occupato'}{a.coperti ? ` · ${a.coperti}` : ''}
                        </span>
                        {a.carryIn && <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded-full">← prec.</span>}
                        {a.carryOut && <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-full">→ cont.</span>}
                        {i < appsDelTavolo.length - 1 && <span className="text-xs text-ink-navy/30 font-bold">→</span>}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-ink-navy/35">{t.posti} posti{t.note ? ` · ${t.note}` : ''}</p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  {gruppo && !isFusoPerTurno && (
                    <button onClick={() => onSciogliGruppo(gruppo.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50">
                      Sciogli
                    </button>
                  )}
                  {publicId && (
                    <button onClick={() => setQrAperto(qrAperto === t.id ? null : t.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-ink-navy/10 text-ink-navy/60 hover:bg-mist">QR</button>
                  )}
                  <button onClick={() => onModifica(t)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-electric-blue/25 text-electric-blue hover:bg-electric-blue/10">Modifica</button>
                  <button onClick={() => onElimina(t.id)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50">
                    Elimina
                  </button>
                </div>
              </div>
              {qrAperto === t.id && publicId && (
                <div className="px-5 pb-4 flex items-start gap-6 bg-mist border-t border-ink-navy/8">
                  <QRCanvas url={url} id={`qr-${t.id}`} />
                  <div className="space-y-2 pt-2">
                    <p className="text-xs text-ink-navy/50 break-all max-w-xs">{url}</p>
                    <button onClick={() => scarica(t.id, t.numero)} className="block text-xs px-3 py-1.5 rounded-lg bg-electric-blue text-white font-medium hover:bg-electric-blue/90">Scarica PNG</button>
                    <button onClick={() => stampa(t.id, label)} className="block text-xs px-3 py-1.5 rounded-lg border border-ink-navy/15 text-ink-navy/70 hover:bg-mist"> Stampa</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Vista MAPPA ───────────────────────────────────────────────────────────────
export interface VistaMappHandle { posizionaNuovoTavolo: (id: string, vis: Omit<MapData, 'x' | 'y'>) => void }

const VistaMappa = forwardRef<VistaMappHandle, {
  tavoli: Tavolo[]; gruppi: Gruppo[]
  onModifica: (t: Tavolo) => void; onElimina: (id: string) => void
  selectMode: boolean; selectedIds: string[]; onToggleSelect: (id: string) => void
  onSciogliGruppo: (gruppoId: string) => void
  tavoloAppMap?: Map<string, AppuntamentoLight>
  tavoloCarryMap?: Map<string, { carryIn: boolean; carryOut: boolean }>
  tavoloAppsMap?: Map<string, (AppuntamentoLight & { carryIn: boolean; carryOut: boolean })[]>
}>(function VistaMappa({ tavoli, gruppi, onModifica, onElimina, selectMode, selectedIds, onToggleSelect, onSciogliGruppo, tavoloAppMap, tavoloCarryMap, tavoloAppsMap }, ref) {
  const [editMode, setEditMode] = useState(false)
  const [hoveredTavoloId, setHoveredTavoloId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef({ x: 0, y: 0 })
  const [mapData, setMapData] = useState<Record<string, MapData>>({})
  const mdRef = useRef<Record<string, MapData>>({})
  const [elementi, setElementi] = useState<Elemento[]>([])
  const elRef = useRef<Elemento[]>([])
  const resizeTRef = useRef<{ id: string; edge: 'r' | 'b' | 'rb'; sx: number; sy: number; ow: number; oh: number } | null>(null)
  const resizeERef = useRef<{ id: string; sx: number; sy: number; ow: number; oh: number } | null>(null)

  useEffect(() => {
    const d: Record<string, MapData> = { ...mdRef.current }
    tavoli.forEach((t, i) => {
      if (!d[t.id]) d[t.id] = tavoloToMD(t as any, i) // inizializza solo se nuovo
    })
    // rimuovi tavoli eliminati
    Object.keys(d).forEach(k => { if (!tavoli.find(t => t.id === k)) delete d[k] })
    setMapData(d); mdRef.current = d
  }, [tavoli])

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).then(d => {
      try { const el = JSON.parse(d.mapElementi ?? '[]'); setElementi(el); elRef.current = el } catch {}
    }).catch(() => {})
  }, [])

  function setZoomSync(nz: number) { zoomRef.current = nz; setZoom(nz) }

  function centroVisibile() {
    const cx = (340 - panRef.current.x) / zoomRef.current
    const cy = (340 - panRef.current.y) / zoomRef.current
    return { cx: Math.max(40, Math.min(CANVAS_W - 200, cx)), cy: Math.max(40, Math.min(CANVAS_H - 120, cy)) }
  }

  useImperativeHandle(ref, () => ({
    posizionaNuovoTavolo(id: string, vis: Omit<MapData, 'x' | 'y'>) {
      const { cx, cy } = centroVisibile()
      const md: MapData = { ...vis, x: cx - vis.w / 2, y: cy - vis.h / 2 }
      saveMD(id, md)
      const upd = { ...mdRef.current, [id]: md }
      mdRef.current = upd; setMapData({ ...upd })
    }
  }))

  function startPan(e: React.MouseEvent) {
    if ((e.target as HTMLElement).dataset.drag) return
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY, ox = panRef.current.x, oy = panRef.current.y
    function mv(ev: MouseEvent) { const np = { x: ox + (ev.clientX - sx), y: oy + (ev.clientY - sy) }; panRef.current = np; setPan({ ...np }) }
    function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  function startDragT(e: React.MouseEvent, id: string) {
    if (selectMode) { onToggleSelect(id); return }
    e.preventDefault(); e.stopPropagation()
    const d = mdRef.current[id]!; const ox = d.x, oy = d.y, sx = e.clientX, sy = e.clientY
    function mv(ev: MouseEvent) {
      const dx = (ev.clientX - sx) / zoomRef.current, dy = (ev.clientY - sy) / zoomRef.current
      const upd = { ...mdRef.current, [id]: { ...mdRef.current[id], x: Math.max(0, ox + dx), y: Math.max(0, oy + dy) } }
      mdRef.current = upd; setMapData({ ...upd })
    }
    function up() { saveMD(id, mdRef.current[id]); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  function startResizeT(e: React.MouseEvent, id: string, edge: 'r' | 'b' | 'rb') {
    e.preventDefault(); e.stopPropagation()
    const d = mdRef.current[id]!; const ow = d.w, oh = d.h, sx = e.clientX, sy = e.clientY
    resizeTRef.current = { id, edge, sx, sy, ow, oh }
    function mv(ev: MouseEvent) {
      if (!resizeTRef.current) return
      const { id, edge, sx, sy, ow, oh } = resizeTRef.current
      const dx = (ev.clientX - sx) / zoomRef.current, dy = (ev.clientY - sy) / zoomRef.current
      const cur = mdRef.current[id]; const isC = cur.forma === 'cerchio'
      let nw = ow, nh = oh
      if (edge === 'r' || edge === 'rb') nw = Math.max(50, Math.round((ow + dx) / 10) * 10)
      if (edge === 'b' || edge === 'rb') nh = Math.max(50, Math.round((oh + dy) / 10) * 10)
      if (isC) { const s = Math.max(50, Math.round((ow + (dx + dy) / 2) / 10) * 10); nw = s; nh = s }
      const upd = { ...mdRef.current, [id]: { ...cur, w: nw, h: nh } }
      mdRef.current = upd; setMapData({ ...upd })
    }
    function up() { saveMD(id, mdRef.current[id]); resizeTRef.current = null; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  function startDragEl(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation()
    const el = elRef.current.find(x => x.id === id)!; const ox = el.x, oy = el.y, sx = e.clientX, sy = e.clientY
    function mv(ev: MouseEvent) {
      const dx = (ev.clientX - sx) / zoomRef.current, dy = (ev.clientY - sy) / zoomRef.current
      const upd = elRef.current.map(x => x.id === id ? { ...x, x: Math.max(0, ox + dx), y: Math.max(0, oy + dy) } : x)
      elRef.current = upd; setElementi([...upd])
    }
    function up() { saveEl(elRef.current); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  function startResizeEl(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation()
    const el = elRef.current.find(x => x.id === id)!; const ow = el.w, oh = el.h, sx = e.clientX, sy = e.clientY
    resizeERef.current = { id, sx, sy, ow, oh }
    function mv(ev: MouseEvent) {
      if (!resizeERef.current) return
      const dx = (ev.clientX - resizeERef.current.sx) / zoomRef.current, dy = (ev.clientY - resizeERef.current.sy) / zoomRef.current
      const nw = Math.max(30, Math.round((resizeERef.current.ow + dx) / 10) * 10)
      const nh = Math.max(16, Math.round((resizeERef.current.oh + dy) / 10) * 10)
      const upd = elRef.current.map(x => x.id === id ? { ...x, w: nw, h: nh } : x)
      elRef.current = upd; setElementi([...upd])
    }
    function up() { saveEl(elRef.current); resizeERef.current = null; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  function aggiungiElemento(t: typeof TIPI_ELEMENTO[0]) {
    const { cx, cy } = centroVisibile()
    const el: Elemento = { id: Date.now().toString(), ...t, x: cx - t.w / 2, y: cy - t.h / 2 }
    const upd = [...elRef.current, el]; elRef.current = upd; setElementi(upd); saveEl(upd)
  }
  function rimuoviElemento(id: string) {
    const upd = elRef.current.filter(x => x.id !== id); elRef.current = upd; setElementi(upd); saveEl(upd)
  }

  const hS = (cursor: string, extra: React.CSSProperties): React.CSSProperties => ({ position: 'absolute', backgroundColor: 'transparent', cursor, zIndex: 20, ...extra })

  const gruppoByTavoloId = new Map<string, Gruppo>()
  gruppi.forEach(g => g.tavoli.forEach(t => gruppoByTavoloId.set(t.id, g)))

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-ink-navy/10 rounded-xl px-2 py-1 shadow-sm">
          <button onClick={() => setZoomSync(Math.max(0.2, +(zoomRef.current - 0.1).toFixed(1)))} className="w-7 h-7 flex items-center justify-center text-ink-navy/60 hover:bg-mist rounded-lg font-bold text-lg">−</button>
          <span className="text-xs font-semibold text-ink-navy/60 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoomSync(Math.min(3, +(zoomRef.current + 0.1).toFixed(1)))} className="w-7 h-7 flex items-center justify-center text-ink-navy/60 hover:bg-mist rounded-lg font-bold text-lg">+</button>
          <button onClick={() => { setZoomSync(1); setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 } }} className="ml-1 text-xs text-electric-blue hover:text-ink-navy font-medium px-1">Reset</button>
        </div>
        <button onClick={() => setEditMode(v => !v)}
          className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl border transition-colors ${editMode ? 'bg-electric-blue text-white border-electric-blue' : 'bg-white text-ink-navy/60 border-ink-navy/15 hover:bg-mist'}`}>
           {editMode ? 'Modifica attiva' : 'Modifica'}
        </button>
        {editMode && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-ink-navy/35">Aggiungi:</span>
            {TIPI_ELEMENTO.map(t => (
              <button key={t.tipo} onClick={() => aggiungiElemento(t)}
                className="text-xs px-2.5 py-1 rounded-lg border border-ink-navy/10 bg-white hover:bg-mist text-ink-navy/70 font-medium shadow-sm">{t.label}</button>
            ))}
          </div>
        )}
        <p className="text-xs text-ink-navy/35 ml-auto hidden lg:block">
          {selectMode ? 'Clicca i tavoli per selezionarli' : editMode ? 'Trascina tavoli per spostarli' : 'Solo visualizzazione — clicca Modifica per editare'}
        </p>
      </div>

      {/* Canvas */}
      <div className="rounded-2xl border border-ink-navy/10 shadow-sm overflow-hidden"
        style={{ width: '100%', height: 680, backgroundColor: '#ffffff', cursor: selectMode ? 'default' : 'grab', position: 'relative', backgroundImage: 'radial-gradient(circle,#e5e7eb 1.5px,transparent 1.5px)', backgroundSize: '30px 30px' }}
        onMouseDown={selectMode ? undefined : startPan}
        title={!editMode ? 'Modalità visualizzazione — clicca Modifica per spostare i tavoli' : undefined}>
        <div style={{ position: 'absolute', top: 0, left: 0, transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: CANVAS_W, height: CANVAS_H, backgroundColor: '#ffffff', backgroundImage: 'radial-gradient(circle,#e5e7eb 1.5px,transparent 1.5px)', backgroundSize: '30px 30px' }}>

          {/* Elementi decorativi */}
          {elementi.map(el => (
            <div key={el.id} data-drag={editMode ? "1" : undefined} onMouseDown={editMode ? e => startDragEl(e, el.id) : undefined}
              style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, cursor: editMode ? 'grab' : 'default', userSelect: 'none' }}
              className="group">
              <div style={{ width: '100%', height: '100%', backgroundColor: el.colore, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid rgba(0,0,0,0.1)' }}>
                <span style={{ fontSize: el.h < 30 ? 9 : 11, fontWeight: 600, color: '#374151', textAlign: 'center', padding: '0 4px', pointerEvents: 'none' }}>{el.label}</span>
              </div>
              {editMode && <button data-drag="1" onMouseDown={e => e.stopPropagation()} onClick={() => rimuoviElemento(el.id)}
                className="absolute -top-2 -right-2 hidden group-hover:flex w-5 h-5 bg-white border border-red-200 rounded-full items-center justify-center text-red-400 text-xs font-bold shadow z-10">✕</button>}
              {editMode && <div data-drag="1" onMouseDown={e => startResizeEl(e, el.id)} style={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, backgroundColor: '#6366f1', borderRadius: 3, cursor: 'se-resize', opacity: .7, zIndex: 10 }} />}
              {editMode && <div data-drag="1" onMouseDown={e => startResizeEl(e, el.id)} style={hS('ew-resize', { right: -4, top: 6, bottom: 6, width: 8 })} />}
              {editMode && <div data-drag="1" onMouseDown={e => startResizeEl(e, el.id)} style={hS('ns-resize', { bottom: -4, left: 6, right: 6, height: 8 })} />}
            </div>
          ))}

          {/* Tavoli */}
          {(() => {
            // Calcola quali tavoli sono fusi per questo turno (stesso appuntamento, 2+ tavoli)
            const appConPiuTavoli = new Set<string>()
            if (tavoloAppMap) {
              const countPerApp = new Map<string, number>()
              tavoloAppMap.forEach(a => countPerApp.set(a.id, (countPerApp.get(a.id) ?? 0) + 1))
              countPerApp.forEach((count, appId) => { if (count >= 2) appConPiuTavoli.add(appId) })
            }
            return tavoli.map(t => {
            const d = mapData[t.id]; if (!d) return null
            const { w, h, colore, forma, x, y } = d; const isC = forma === 'cerchio'
            const gruppo = gruppoByTavoloId.get(t.id)
            const appsDelTavolo = tavoloAppsMap?.get(t.id) ?? []
            const appAssegnato = appsDelTavolo[0] ?? tavoloAppMap?.get(t.id)
            const carry = tavoloCarryMap?.get(t.id)
            const isFusoPerTurno = appAssegnato ? appConPiuTavoli.has(appAssegnato.id) : false
            // Label: se fuso per turno mostra "T2+3", altrimenti gruppo permanente o etichetta
            const labelFuso = isFusoPerTurno && tavoloAppMap
              ? `T${Array.from(tavoloAppMap.entries()).filter(([,a]) => a.id === appAssegnato!.id).map(([tid]) => tavoli.find(tv=>tv.id===tid)?.numero).filter(Boolean).sort((a,b)=>(a as number)-(b as number)).join('+')}`
              : null
            const label = labelFuso ?? (gruppo ? `T${gruppo.label}` : (t.etichetta ?? `T${t.numero}`))
            const isSelected = selectedIds.includes(t.id)
            const isOccupato = !!appAssegnato
            return (
              <div key={t.id} style={{ position: 'absolute', left: x, top: y, width: w, height: h, userSelect: 'none', overflow: 'visible' }}
                onMouseEnter={() => setHoveredTavoloId(t.id)} onMouseLeave={() => setHoveredTavoloId(null)}>
                {/* Badge prenotazione/i */}
                {appsDelTavolo.length > 0 && (
                  <div style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', zIndex: 30, whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    {appsDelTavolo.map((a, i) => (
                      <div key={a.id} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        {a.carryIn && <div style={{ backgroundColor: '#3b82f6', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 6, padding: '1px 4px' }}>←</div>}
                        <div style={{ backgroundColor: i === 0 ? '#ef4444' : '#f97316', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '2px 7px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
                          {a.clienteNome?.split(' ')[0] ?? 'Prenotato'}{a.coperti ? ` · ${a.coperti}` : ''}
                        </div>
                        {a.carryOut && <div style={{ backgroundColor: '#f59e0b', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 6, padding: '1px 4px' }}>→</div>}
                      </div>
                    ))}
                  </div>
                )}
                {/* Bordo selezione */}
                {isSelected && (
                  <div style={{ position: 'absolute', inset: -5, borderRadius: isC ? '50%' : 14, border: '3px solid #6366f1', pointerEvents: 'none', zIndex: 5 }} />
                )}
                {/* Bordo occupato/libero + fuso per turno */}
                {tavoloAppMap && !isSelected && (
                  <>
                    <div style={{ position: 'absolute', inset: -4, borderRadius: isC ? '50%' : 13, border: `2.5px ${isFusoPerTurno ? 'dashed #f97316' : `solid ${isOccupato ? '#ef4444' : '#22c55e'}`}`, pointerEvents: 'none', zIndex: 4, opacity: 0.85 }} />
                  </>
                )}
                {/* Bordo gruppo manuale (visibile anche con turno attivo, escluso se già auto-fuso) */}
                {gruppo && !isSelected && !isFusoPerTurno && (
                  <div style={{ position: 'absolute', inset: -4, borderRadius: isC ? '50%' : 13, border: '2.5px dashed #f97316', pointerEvents: 'none', zIndex: 4 }} />
                )}
                <div data-drag={editMode && !selectMode ? "1" : undefined}
                  onMouseDown={editMode && !selectMode ? e => startDragT(e, t.id) : selectMode ? e => { e.stopPropagation(); onToggleSelect(t.id) } : undefined}
                  style={{ width: w, height: h, backgroundColor: colore, borderRadius: isC ? '50%' : 10, cursor: selectMode ? 'pointer' : editMode ? 'grab' : 'default', position: 'absolute', top: 0, left: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: isSelected ? `0 0 0 3px #6366f1, 0 3px 12px rgba(0,0,0,0.15)` : '0 3px 12px rgba(0,0,0,0.15)', opacity: selectMode && !isSelected ? 0.75 : 1 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: Math.min(w, h) < 80 ? 10 : 13, textAlign: 'center', padding: '0 6px', lineHeight: 1.3, pointerEvents: 'none' }}>{label}</span>
                  <span style={{ color: '#fff', fontSize: Math.min(w, h) < 80 ? 10 : 12, fontWeight: 600, marginTop: 3, pointerEvents: 'none', backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 20, padding: '1px 7px' }}>{t.posti}</span>
                </div>

                {/* Azioni hover — sciogli gruppo sempre visibile, il resto solo in editMode */}
                {!selectMode && hoveredTavoloId === t.id && (
                  <div style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4, zIndex: 30, paddingBottom: 4 }}>
                    {gruppo && (
                      <button data-drag="1" onMouseDown={e => e.stopPropagation()} onClick={() => onSciogliGruppo(gruppo.id)}
                        className="w-6 h-6 p-1.5 bg-white border border-orange-300 rounded-full text-orange-500 flex items-center justify-center hover:bg-orange-50 shadow" title="Sciogli gruppo"><IconUnlink /></button>
                    )}
                    {editMode && <button data-drag="1" onMouseDown={e => e.stopPropagation()} onClick={() => onModifica(t)} className="w-6 h-6 p-1.5 bg-white border border-ink-navy/15 rounded-full text-ink-navy/50 flex items-center justify-center hover:bg-electric-blue/10 shadow"><IconPencil /></button>}
                    {editMode && <button data-drag="1" onMouseDown={e => e.stopPropagation()} onClick={() => onElimina(t.id)} className="w-6 h-6 p-1.5 bg-white border border-red-200 rounded-full flex items-center justify-center hover:bg-red-50 shadow text-red-500"><IconTrash /></button>}
                  </div>
                )}

                {/* Resize handles — solo in editMode fuori selectMode */}
                {editMode && !selectMode && !isC && <div data-drag="1" onMouseDown={e => startResizeT(e, t.id, 'r')} style={hS('ew-resize', { right: -5, top: 8, bottom: 8, width: 10 })} />}
                {editMode && !selectMode && !isC && <div data-drag="1" onMouseDown={e => startResizeT(e, t.id, 'b')} style={hS('ns-resize', { bottom: -5, left: 8, right: 8, height: 10 })} />}
                {editMode && !selectMode && (
                  <div data-drag="1" onMouseDown={e => startResizeT(e, t.id, 'rb')}
                    style={{ position: 'absolute', right: isC ? 2 : -6, bottom: isC ? 2 : -6, width: 14, height: 14, backgroundColor: '#fff', border: `2.5px solid ${colore}`, borderRadius: isC ? '50%' : 4, cursor: 'se-resize', zIndex: 25 }} />
                )}
              </div>
            )
          })
          })()}
        </div>
      </div>
    </div>
  )
})

interface TurnoServizio { id: string; nome: string; oraInizio: string; oraFine: string }
interface AppuntamentoLight { id: string; clienteNome?: string; data: string; durata: number; status: string; tavoloId?: string | null; tavoliIds?: string | null; coperti?: number }

function toMinutes(hhmm: string) { const [h, m] = hhmm.split(':').map(Number); const v = h * 60 + m; return v === 0 ? 1440 : v }

// ── Pagina ────────────────────────────────────────────────────────────────────
export default function TavoliPage() {
  const [vista, setVista] = useState<'mappa' | 'lista'>('mappa')
  const [tavoli, setTavoli] = useState<Tavolo[]>([])
  const [gruppi, setGruppi] = useState<Gruppo[]>([])
  const [loading, setLoading] = useState(true)
  const [publicId, setPublicId] = useState<string | null>(null)

  // Selezione / fusione
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [fondendo, setFondendo] = useState(false)

  // Modal modifica
  const [conferma, setConferma] = useState<{ msg: string; onConfirm: () => void } | null>(null)
  const [editTavolo, setEditTavolo] = useState<Tavolo | null>(null)
  const [formEdit, setFormEdit] = useState({ numero: '', etichetta: '', posti: '4', note: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  // Modal crea
  const [showCrea, setShowCrea] = useState(false)
  const [formV, setFormV] = useState({ numero: '', etichetta: '', posti: '4', note: '' })
  const [visual, setVisual] = useState<Omit<MapData, 'x' | 'y'>>(DEFAULT_VISUAL)
  const [savingCrea, setSavingCrea] = useState(false)

  // Turni + vista per giorno
  const [turniServizio, setTurniServizio] = useState<TurnoServizio[]>([])
  const [appuntamenti, setAppuntamenti] = useState<AppuntamentoLight[]>([])
  const [giornoSel, setGiornoSel] = useState<string>(() => (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}` })())
  const [turnoSel, setTurnoSel] = useState<string | null>(null)

  const mappaRef = useRef<VistaMappHandle>(null)

  async function fetchTavoli() {
    const res = await fetch('/api/tavoli', { credentials: 'include' })
    const d = await res.json().catch(() => ({}))
    setTavoli(d.tavoli ?? []); setLoading(false)
  }
  const giornoSelRef = useRef(giornoSel)
  const turnoSelRef = useRef(turnoSel)
  useEffect(() => { giornoSelRef.current = giornoSel }, [giornoSel])
  useEffect(() => { turnoSelRef.current = turnoSel }, [turnoSel])

  async function fetchGruppi(data: string, turnoId: string | null) {
    const params = new URLSearchParams({ data })
    if (turnoId) params.set('turnoId', turnoId)
    const res = await fetch(`/api/gruppi?${params}`, { credentials: 'include' })
    const d = await res.json().catch(() => ({}))
    setGruppi(d.gruppi ?? [])
  }
  useEffect(() => {
    fetchTavoli()
    fetch('/api/me', { credentials: 'include' }).then(r => r.json()).then(d => {
      setPublicId(d.user?.publicId ?? null)
      try {
        const ts = JSON.parse(d.user?.turniServizio ?? '[]')
        ts.sort((a: TurnoServizio, b: TurnoServizio) => toMinutes(a.oraInizio) - toMinutes(b.oraInizio))
        setTurniServizio(ts)
        // Seleziona il turno corrente o il prossimo più vicino
        const now = new Date()
        const nowMin = now.getHours() * 60 + now.getMinutes()
        const corrente = ts.find((t: TurnoServizio) => toMinutes(t.oraInizio) <= nowMin && toMinutes(t.oraFine) > nowMin)
        const prossimo = ts.find((t: TurnoServizio) => toMinutes(t.oraInizio) > nowMin)
        const selezionato = (corrente ?? prossimo ?? ts[0])?.id ?? null
        setTurnoSel(selezionato)
        fetchGruppi(giornoSelRef.current, selezionato)
      } catch {
        fetchGruppi(giornoSelRef.current, null)
      }
    }).catch(() => {})
    fetch('/api/appuntamenti', { credentials: 'include', cache: 'no-store' }).then(r => r.json()).then(d => setAppuntamenti(d.appuntamenti ?? [])).catch(() => {})
    const interval = setInterval(() => {
      fetchTavoli()
      fetchGruppi(giornoSelRef.current, turnoSelRef.current)
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetchGruppi(giornoSel, turnoSel)
  }, [giornoSel, turnoSel])

  // Appuntamenti filtrati per giorno+turno (con overlap, non solo ora di inizio)
  const turnoAttivo = turniServizio.find(t => t.id === turnoSel)
  const appTurno: AppuntamentoLight[] = (() => {
    if (!giornoSel) return []
    return appuntamenti.filter(a => {
      if (a.status === 'cancellato') return false
      const dLocal = new Date(new Date(a.data).toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
      const dStr = `${dLocal.getFullYear()}-${String(dLocal.getMonth() + 1).padStart(2, '0')}-${String(dLocal.getDate()).padStart(2, '0')}`
      if (dStr !== giornoSel) return false
      if (!turnoAttivo) return true
      const appInizio = dLocal.getHours() * 60 + dLocal.getMinutes()
      const appFine = appInizio + (a.durata ?? 90)
      const inizioT = toMinutes(turnoAttivo.oraInizio)
      const fineT = toMinutes(turnoAttivo.oraFine)
      if (inizioT > fineT) return appInizio >= inizioT || appInizio < fineT // turno attraversa mezzanotte
      return appInizio < fineT && appFine > inizioT // overlap
    })
  })()

  // Mappa tavoloId → lista appuntamenti sovrapposti + flag carryIn/carryOut per ognuno
  const tavoloAppsMap = new Map<string, (AppuntamentoLight & { carryIn: boolean; carryOut: boolean })[]>()
  appTurno.forEach(a => {
    const ids: string[] = (() => { try { return a.tavoliIds ? JSON.parse(a.tavoliIds) : (a.tavoloId ? [a.tavoloId] : []) } catch { return a.tavoloId ? [a.tavoloId] : [] } })()
    const dLocal = new Date(new Date(a.data).toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
    const appInizio = dLocal.getHours() * 60 + dLocal.getMinutes()
    const appFine = appInizio + (a.durata ?? 90)
    const inizioT = turnoAttivo ? toMinutes(turnoAttivo.oraInizio) : 0
    const fineT = turnoAttivo ? toMinutes(turnoAttivo.oraFine) : 1440
    const carryIn = !!turnoAttivo && appInizio < inizioT
    const carryOut = !!turnoAttivo && appFine > fineT
    ids.forEach(id => {
      const existing = tavoloAppsMap.get(id) ?? []
      existing.push({ ...a, carryIn, carryOut })
      tavoloAppsMap.set(id, existing)
    })
  })
  // Compatibilità con componenti che usano tavoloAppMap (primo appuntamento per tavolo)
  const tavoloAppMap = new Map<string, AppuntamentoLight>()
  const tavoloCarryMap = new Map<string, { carryIn: boolean; carryOut: boolean }>()
  tavoloAppsMap.forEach((apps, id) => {
    tavoloAppMap.set(id, apps[0])
    tavoloCarryMap.set(id, { carryIn: apps[0].carryIn, carryOut: apps[apps.length - 1].carryOut })
  })

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function fondiTavoli() {
    if (selectedIds.length < 2) return
    setFondendo(true)
    await fetch('/api/gruppi', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tavoliIds: selectedIds, data: giornoSel, turnoId: turnoSel }),
    })
    setFondendo(false); setSelectedIds([]); setSelectMode(false)
    await Promise.all([fetchTavoli(), fetchGruppi(giornoSel, turnoSel)])
  }

  async function sciogliGruppo(gruppoId: string) {
    setConferma({ msg: 'Sciogliere questo gruppo di tavoli?', onConfirm: async () => {
      await fetch(`/api/gruppi/${gruppoId}`, { method: 'DELETE', credentials: 'include' })
      await Promise.all([fetchTavoli(), fetchGruppi(giornoSel, turnoSel)])
    }})
  }

  function apriModifica(t: Tavolo) { setEditTavolo(t); setFormEdit({ numero: t.numero.toString(), etichetta: t.etichetta ?? '', posti: t.posti.toString(), note: t.note ?? '' }) }

  async function salvaModifica() {
    if (!editTavolo) return; setSavingEdit(true)
    await fetch(`/api/tavoli/${editTavolo.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero: parseInt(formEdit.numero) || editTavolo.numero, etichetta: formEdit.etichetta || null, posti: parseInt(formEdit.posti) || 4, note: formEdit.note || null }) })
    setSavingEdit(false); setEditTavolo(null); fetchTavoli()
  }

  async function eliminaTavolo(id: string) {
    setConferma({ msg: 'Eliminare questo tavolo?', onConfirm: async () => {
      await fetch(`/api/tavoli/${id}`, { method: 'DELETE', credentials: 'include' })
      fetchTavoli()
    }})
  }

  async function creaTavolo() {
    if (!formV.numero) return; setSavingCrea(true)
    const res = await fetch('/api/tavoli', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero: parseInt(formV.numero), etichetta: formV.etichetta || null, posti: parseInt(formV.posti) || 4, note: formV.note || null }) })
    const data = await res.json()
    if (data.tavolo?.id) mappaRef.current?.posizionaNuovoTavolo(data.tavolo.id, visual)
    setSavingCrea(false); setFormV({ numero: '', etichetta: '', posti: '4', note: '' }); setShowCrea(false); fetchTavoli()
  }

  // Banner selezione attiva
  const selBanner = selectMode && (
    <div className="flex items-center gap-3 bg-electric-blue/10 border border-electric-blue/25 rounded-xl px-4 py-3">
      <span className="text-sm text-electric-blue font-medium flex-1">
        {selectedIds.length === 0 ? 'Clicca i tavoli da fondere' : `${selectedIds.length} tavol${selectedIds.length === 1 ? 'o' : 'i'} selezionat${selectedIds.length === 1 ? 'o' : 'i'}`}
      </span>
      {selectedIds.length >= 2 && (
        <button onClick={fondiTavoli} disabled={fondendo}
          className="bg-orange-500 text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50">
          {fondendo ? '...' : `Fondi ${selectedIds.length} tavoli`}
        </button>
      )}
      <button onClick={() => { setSelectMode(false); setSelectedIds([]) }}
        className="text-sm text-ink-navy/50 hover:text-ink-navy/70 border border-ink-navy/15 px-3 py-1.5 rounded-lg">Annulla</button>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-navy">Tavoli</h1>
          <p className="text-ink-navy/50 text-sm mt-0.5">Disegna la piantina e gestisci i QR code</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setSelectMode(v => !v); setSelectedIds([]) }}
            className={`font-semibold px-4 py-2 rounded-xl text-sm border transition-colors ${selectMode ? 'bg-electric-blue/15 border-electric-blue/40 text-electric-blue' : 'bg-white border-ink-navy/15 text-ink-navy/70 hover:bg-mist'}`}>
            {selectMode ? '✕ Esci selezione' : 'Fondi tavoli'}
          </button>
          <button onClick={() => setShowCrea(true)}
            className="bg-electric-blue text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-electric-blue/90 shadow-sm">
            + Nuovo tavolo
          </button>
        </div>
      </div>

      {!publicId && tavoli.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
           Nessun <strong>publicId</strong> configurato — i QR non possono essere generati.
        </div>
      )}

      {selBanner}

      {/* Tab switch */}
      <div className="flex gap-2">
        {[{ k: 'mappa', l: 'Mappa' }, { k: 'lista', l: 'Lista' }].map(t => (
          <button key={t.k} onClick={() => setVista(t.k as 'mappa' | 'lista')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${vista === t.k ? 'bg-electric-blue text-white' : 'bg-white border border-ink-navy/15 text-ink-navy/60 hover:bg-mist'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Selettore giorno + turno */}
      <div className="bg-white border border-ink-navy/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Giorno</span>
            <input type="date" value={giornoSel} onChange={e => setGiornoSel(e.target.value)}
              className="border border-ink-navy/15 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" />
            <button onClick={() => setGiornoSel((() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}` })())}
              className="text-xs text-electric-blue font-semibold px-2 py-1 border border-electric-blue/25 rounded-lg hover:bg-electric-blue/10">Oggi</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-ink-navy/50 uppercase tracking-wider">Turno</span>
            {turniServizio.map(t => (
              <button key={t.id} onClick={() => setTurnoSel(t.id)}
                className={`text-sm font-semibold px-3 py-1 rounded-full transition-colors ${turnoSel === t.id ? 'bg-electric-blue text-white' : 'bg-mist text-ink-navy/60 hover:bg-ink-navy/10'}`}>
                {t.nome} <span className="text-xs opacity-70">{t.oraInizio}–{t.oraFine}</span>
              </button>
            ))}
            {turniServizio.length > 0 && (
              <button onClick={() => setTurnoSel(null)}
                className={`text-sm font-semibold px-3 py-1 rounded-full transition-colors ${turnoSel === null ? 'bg-gray-700 text-white' : 'bg-mist text-ink-navy/50 hover:bg-ink-navy/10'}`}>
                Tutti
              </button>
            )}
            <a href="/dashboard/impostazioni?sezione=turni"
              className="text-xs text-ink-navy/35 hover:text-electric-blue font-medium px-2 py-1 border border-ink-navy/10 rounded-lg hover:border-electric-blue/40 hover:bg-electric-blue/10 transition-colors">
               Gestisci turni
            </a>
          </div>
          {appTurno.length > 0 && (
            <span className="ml-auto text-xs font-semibold text-electric-blue bg-electric-blue/10 px-2 py-1 rounded-full">
              {appTurno.length} prenotazion{appTurno.length === 1 ? 'e' : 'i'}
            </span>
          )}
        </div>

      {loading ? <p className="text-ink-navy/35 text-sm">Caricamento...</p> : (
        <>
          {vista === 'mappa' && (
            <VistaMappa ref={mappaRef} tavoli={tavoli} gruppi={gruppi}
              onModifica={apriModifica} onElimina={eliminaTavolo}
              selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect}
              onSciogliGruppo={sciogliGruppo} tavoloAppMap={tavoloAppMap} tavoloCarryMap={tavoloCarryMap} tavoloAppsMap={tavoloAppsMap} />
          )}
          {vista === 'lista' && (
            <VistaLista tavoli={tavoli} gruppi={gruppi} publicId={publicId}
              onModifica={apriModifica} onElimina={eliminaTavolo}
              selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect}
              onSciogliGruppo={sciogliGruppo} tavoloAppMap={tavoloAppMap} tavoloCarryMap={tavoloCarryMap} tavoloAppsMap={tavoloAppsMap} />
          )}
        </>
      )}

      {/* Modal CREA */}
      {showCrea && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink-navy">Nuovo tavolo</h3>
              <button onClick={() => setShowCrea(false)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl font-bold">✕</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1"><label className="block text-xs font-medium text-ink-navy/60 mb-1">Numero *</label>
                    <input type="number" value={formV.numero} onChange={e => setFormV(f => ({ ...f, numero: e.target.value }))} placeholder="1"
                      className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" /></div>
                  <div className="flex-1"><label className="block text-xs font-medium text-ink-navy/60 mb-1">Posti</label>
                    <input type="number" value={formV.posti} onChange={e => setFormV(f => ({ ...f, posti: e.target.value }))} placeholder="4"
                      className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" /></div>
                </div>
                <div><label className="block text-xs font-medium text-ink-navy/60 mb-1">Etichetta</label>
                  <input value={formV.etichetta} onChange={e => setFormV(f => ({ ...f, etichetta: e.target.value }))} placeholder="es. Terrazza..."
                    className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" /></div>
                <div><label className="block text-xs font-medium text-ink-navy/60 mb-1">Note</label>
                  <input value={formV.note} onChange={e => setFormV(f => ({ ...f, note: e.target.value }))} placeholder="es. Vicino alla finestra..."
                    className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" /></div>
              </div>
              <div className="space-y-3">
                <div><label className="block text-xs font-medium text-ink-navy/60 mb-2">Forma sulla mappa</label>
                  <div className="flex gap-2">
                    {(['quadrato', 'cerchio'] as const).map(f => (
                      <button key={f} onClick={() => setVisual(v => ({ ...v, forma: f }))}
                        className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium ${visual.forma === f ? 'border-electric-blue bg-electric-blue/10 text-electric-blue' : 'border-ink-navy/10 text-ink-navy/60'}`}>
                        {f === 'quadrato' ? 'Quadrato' : 'Cerchio'}</button>
                    ))}</div></div>
                <div><label className="block text-xs font-medium text-ink-navy/60 mb-2">Colore</label>
                  <div className="flex gap-2 flex-wrap items-center">
                    {COLORI_PRESET.map(c => (
                      <button key={c} onClick={() => setVisual(v => ({ ...v, colore: c }))} style={{ backgroundColor: c }}
                        className={`w-7 h-7 rounded-full transition-transform ${visual.colore === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'}`} />
                    ))}
                    <input type="color" value={visual.colore} onChange={e => setVisual(v => ({ ...v, colore: e.target.value }))} className="w-7 h-7 rounded-full border border-ink-navy/15 cursor-pointer p-0" />
                  </div></div>
                <div className="flex items-center justify-center py-4 bg-mist rounded-xl"
                  style={{ backgroundImage: 'radial-gradient(circle,#e5e7eb 1px,transparent 1px)', backgroundSize: '20px 20px' }}>
                  <div style={{ width: visual.w, height: visual.h, backgroundColor: visual.colore, borderRadius: visual.forma === 'cerchio' ? '50%' : 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{formV.etichetta || `T${formV.numero || '?'}`}</span>
                    <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, marginTop: 1 }}> {formV.posti || 4}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowCrea(false)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl text-sm">Annulla</button>
              <button onClick={creaTavolo} disabled={savingCrea || !formV.numero} className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">{savingCrea ? '...' : '+ Aggiungi'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal MODIFICA */}
      {editTavolo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink-navy">Modifica Tavolo {editTavolo.numero}</h3>
              <button onClick={() => setEditTavolo(null)} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl font-bold">✕</button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-ink-navy/60 mb-1">Numero tavolo</label>
                <input type="number" value={formEdit.numero} onChange={e => setFormEdit(f => ({ ...f, numero: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" /></div>
              <div><label className="block text-xs font-medium text-ink-navy/60 mb-1">Posti</label>
                <input type="number" value={formEdit.posti} onChange={e => setFormEdit(f => ({ ...f, posti: e.target.value }))}
                  className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" /></div>
              <div><label className="block text-xs font-medium text-ink-navy/60 mb-1">Etichetta</label>
                <input value={formEdit.etichetta} onChange={e => setFormEdit(f => ({ ...f, etichetta: e.target.value }))}
                  placeholder="es. Terrazza..." className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" /></div>
              <div><label className="block text-xs font-medium text-ink-navy/60 mb-1">Note</label>
                <input value={formEdit.note} onChange={e => setFormEdit(f => ({ ...f, note: e.target.value }))}
                  placeholder="es. Vicino alla finestra..." className="w-full border border-ink-navy/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue" /></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditTavolo(null)} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-xl text-sm">Annulla</button>
              <button onClick={salvaModifica} disabled={savingEdit} className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">{savingEdit ? '...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal conferma interno */}
      {conferma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConferma(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-ink-navy mb-4">{conferma.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setConferma(null)} className="flex-1 py-2 rounded-xl border border-ink-navy/10 text-ink-navy/60 text-sm font-medium hover:bg-mist">Annulla</button>
              <button onClick={async () => { await conferma.onConfirm(); setConferma(null) }} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600">Conferma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

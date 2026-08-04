'use client'

import { useEffect, useRef, useState } from 'react'
import { IconUpload, IconFile, IconLink, IconTrash } from '@/app/components/icons'
import { segnalaAggiornamento } from './notificheUtil'

const MAX_BYTE = 3 * 1024 * 1024

export interface DocumentoSeduta {
  id: string
  nome: string
  url?: string | null
  mimeType?: string | null
  dimensione?: number | null
  tipo?: string | null
  appuntamentoId?: string | null
  sedutaId?: string | null
}

export function fmtPeso(byte?: number | null) {
  if (!byte) return null
  return byte < 1024 * 1024
    ? `${Math.max(1, Math.round(byte / 1024))} KB`
    : `${(byte / 1024 / 1024).toFixed(1)} MB`
}

export function leggiFile(file: File): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    const reader = new FileReader()
    reader.onload = () => risolvi(String(reader.result))
    reader.onerror = () => rifiuta(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Data e tipo come li mostriamo ovunque: entrambi in grassetto, separati da una barra. */
export function TitoloSeduta({ data, tipo, className = '' }: { data: string; tipo?: string | null; className?: string }) {
  return (
    <span className={`font-bold text-ink-navy ${className}`}>
      {new Date(data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
      {tipo && <span className="text-ink-navy/25 font-normal"> | </span>}
      {tipo}
    </span>
  )
}

/**
 * Dettaglio di una seduta: nota condivisa fra calendario, prossimi appuntamenti
 * e storico, più gli allegati. La nota si scrive una volta e si vede ovunque
 * perché l'API la propaga su appuntamento e seduta collegati.
 */
export default function SedutaPopup({
  pazienteId, appuntamentoId, sedutaId, data, tipo, noteIniziali, onChiudi, onSalvato,
}: {
  pazienteId: string
  appuntamentoId?: string | null
  sedutaId?: string | null
  data: string
  tipo?: string | null
  noteIniziali?: string | null
  onChiudi: () => void
  onSalvato: () => void
}) {
  const [note, setNote] = useState(noteIniziali ?? '')
  const [documenti, setDocumenti] = useState<DocumentoSeduta[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState('')
  const [dropAttivo, setDropAttivo] = useState(false)
  const inputFile = useRef<HTMLInputElement>(null)

  async function caricaDocumenti() {
    const res = await fetch(`/api/pazienti/${pazienteId}/documenti`, { credentials: 'include', cache: 'no-store' })
    const d = await res.json()
    const tutti: DocumentoSeduta[] = d.documenti ?? []
    setDocumenti(tutti.filter(x =>
      (appuntamentoId && x.appuntamentoId === appuntamentoId) ||
      (sedutaId && x.sedutaId === sedutaId),
    ))
  }

  useEffect(() => { caricaDocumenti() }, [pazienteId, appuntamentoId, sedutaId])

  function scegliFile(f: File | null | undefined) {
    if (!f) return
    if (f.size > MAX_BYTE) { setErrore('Il file supera i 3 MB'); return }
    setErrore('')
    setFile(f)
  }

  async function salva() {
    if (salvando) return
    setSalvando(true)
    setErrore('')
    try {
      await fetch('/api/care/seduta-nota', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appuntamentoId, sedutaId, note }),
      })

      if (file) {
        const res = await fetch(`/api/pazienti/${pazienteId}/documenti`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: file.name.replace(/\.[^.]+$/, ''),
            contenuto: await leggiFile(file),
            mimeType: file.type || 'application/octet-stream',
            dimensione: file.size,
            appuntamentoId: appuntamentoId ?? null,
            sedutaId: sedutaId ?? null,
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setErrore(d.error ?? 'Allegato non caricato')
          return
        }
        setFile(null)
      }

      onSalvato()
      segnalaAggiornamento()
      onChiudi()
    } catch {
      setErrore('Salvataggio non riuscito, riprova.')
    } finally {
      setSalvando(false)
    }
  }

  async function eliminaDoc(id: string) {
    await fetch(`/api/documenti-paziente/${id}`, { method: 'DELETE', credentials: 'include' })
    caricaDocumenti()
    onSalvato()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onChiudi}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 overflow-y-auto"
        style={{ maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between gap-3">
          <div>
            <TitoloSeduta data={data} tipo={tipo} className="text-base" />
            <p className="text-xs text-ink-navy/40 mt-0.5">Nota e allegati della seduta</p>
          </div>
          <button onClick={onChiudi} className="text-ink-navy/35 hover:text-ink-navy/60 text-xl leading-none">✕</button>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-navy/70 mb-1">Nota</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
            placeholder="Cosa è stato fatto, dolore percepito, esercizi assegnati..."
            className="w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue resize-none" />
          <p className="text-xs text-ink-navy/35 mt-1">
            La stessa nota compare in calendario, nei prossimi appuntamenti e nello storico.
          </p>
        </div>

        {documenti.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-ink-navy/40 uppercase tracking-wider mb-2">Allegati</p>
            <div className="space-y-1.5">
              {documenti.map(d => (
                <div key={d.id} className="group flex items-center gap-2 bg-mist rounded-lg px-3 py-2">
                  <span className="w-4 h-4 shrink-0 text-electric-blue">{d.url ? <IconLink /> : <IconFile />}</span>
                  <a href={d.url ?? `/api/documenti-paziente/${d.id}/file`} target="_blank" rel="noopener noreferrer"
                    className="flex-1 min-w-0 text-sm text-ink-navy truncate hover:text-electric-blue">{d.nome}</a>
                  <span className="text-xs text-ink-navy/35 shrink-0">{fmtPeso(d.dimensione)}</span>
                  <button onClick={() => eliminaDoc(d.id)} aria-label="Elimina allegato"
                    className="w-5 h-5 shrink-0 flex items-center justify-center text-ink-navy/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                    <span className="w-3 h-3"><IconTrash /></span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          onDragOver={e => { e.preventDefault(); setDropAttivo(true) }}
          onDragLeave={() => setDropAttivo(false)}
          onDrop={e => { e.preventDefault(); setDropAttivo(false); scegliFile(e.dataTransfer.files?.[0]) }}
          onClick={() => inputFile.current?.click()}
          className={`border border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors ${
            dropAttivo ? 'border-electric-blue bg-electric-blue/[0.06]'
            : file ? 'border-electric-blue/40 bg-electric-blue/[0.03]'
            : 'border-ink-navy/15 hover:border-electric-blue hover:bg-electric-blue/[0.03]'}`}>
          <input ref={inputFile} type="file" className="hidden"
            onChange={e => { scegliFile(e.target.files?.[0]); e.target.value = '' }} />
          {file ? (
            <>
              <span className="w-6 h-6 text-electric-blue mx-auto block mb-1.5"><IconFile /></span>
              <p className="text-sm font-semibold text-ink-navy truncate">{file.name}</p>
              <p className="text-xs text-ink-navy/40">{fmtPeso(file.size)} · clicca per cambiare</p>
            </>
          ) : (
            <>
              <span className="w-6 h-6 text-ink-navy/25 mx-auto block mb-1.5"><IconUpload /></span>
              <p className="text-sm text-ink-navy/55">Trascina un file o clicca per allegarlo</p>
              <p className="text-xs text-ink-navy/30 mt-0.5">Finisce anche nei Documenti del paziente</p>
            </>
          )}
        </div>

        {errore && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errore}</p>}

        <div className="flex gap-3">
          <button onClick={onChiudi} className="flex-1 border border-ink-navy/15 text-ink-navy/70 font-semibold py-2.5 rounded-lg hover:bg-mist">
            Annulla
          </button>
          <button onClick={salva} disabled={salvando}
            className="flex-1 bg-electric-blue text-white font-semibold py-2.5 rounded-lg hover:bg-electric-blue/90 disabled:opacity-40">
            {salvando ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useCallback, useEffect, useState } from 'react'
import { IconTrash } from '@/app/components/icons'

// Sezione "Stampanti" delle impostazioni: registra le stampanti termiche del locale, mostra lo stato
// della coda di stampa, permette di ristampare e di vedere l'anteprima renderizzata di una comanda
// (verifica del layout senza hardware). La consegna reale alle stampanti non è ancora attiva: oggi il
// sistema usa un transport "mock" che segna le comande come stampate e ne salva l'anteprima.

interface Stampante {
  id: string
  nome: string
  reparto: string
  indirizzo: string | null
  tipo: string
  attiva: boolean
}
interface PrintJob {
  id: string
  reparto: string
  stato: string
  errore: string | null
  anteprima: string | null
  createdAt: string
  stampante: { nome: string } | null
}

const cls = 'w-full border border-ink-navy/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue'
const REPARTI_DEFAULT = ['Cucina', 'Bar']

function statoBadge(stato: string) {
  const map: Record<string, string> = {
    stampata: 'bg-green-100 text-green-700',
    in_attesa: 'bg-amber-100 text-amber-700',
    errore: 'bg-red-100 text-red-700',
  }
  const label: Record<string, string> = { stampata: 'Stampata', in_attesa: 'In attesa', errore: 'Errore' }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[stato] ?? 'bg-mist text-ink-navy/60'}`}>{label[stato] ?? stato}</span>
}

export default function StampantiPanel() {
  const [reparti, setReparti] = useState<string[]>(REPARTI_DEFAULT)
  const [stampanti, setStampanti] = useState<Stampante[]>([])
  const [jobs, setJobs] = useState<PrintJob[]>([])
  const [loading, setLoading] = useState(true)

  // Form nuova stampante
  const [nome, setNome] = useState('')
  const [reparto, setReparto] = useState('')
  const [tipo, setTipo] = useState<'rete' | 'altro'>('rete')
  const [indirizzo, setIndirizzo] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Anteprima comanda
  const [anteprima, setAnteprima] = useState<{ reparto: string; testo: string }[] | null>(null)

  const caricaStampanti = useCallback(async () => {
    const res = await fetch('/api/stampanti')
    if (res.ok) setStampanti((await res.json()).stampanti ?? [])
  }, [])
  const caricaCoda = useCallback(async () => {
    const res = await fetch('/api/stampe')
    if (res.ok) setJobs((await res.json()).jobs ?? [])
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const s = await fetch('/api/settings')
      if (vivo && s.ok) {
        const j = await s.json()
        try {
          const r = j.reparti ? JSON.parse(j.reparti) : null
          if (Array.isArray(r) && r.length) setReparti(r.map(String))
        } catch {}
      }
      await Promise.all([caricaStampanti(), caricaCoda()])
      if (vivo) setLoading(false)
    })()
    return () => { vivo = false }
  }, [caricaStampanti, caricaCoda])

  useEffect(() => { if (!reparto && reparti.length) setReparto(reparti[0]) }, [reparti, reparto])

  const aggiungi = async () => {
    if (!nome.trim() || !reparto) return
    setSalvando(true)
    const res = await fetch('/api/stampanti', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, reparto, tipo, indirizzo: tipo === 'rete' ? indirizzo : null }),
    })
    setSalvando(false)
    if (res.ok) {
      setNome(''); setIndirizzo(''); setTipo('rete')
      await caricaStampanti()
    }
  }

  const toggleAttiva = async (s: Stampante) => {
    setStampanti(prev => prev.map(x => x.id === s.id ? { ...x, attiva: !x.attiva } : x))
    await fetch(`/api/stampanti/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attiva: !s.attiva }),
    })
  }

  const elimina = async (s: Stampante) => {
    if (!confirm(`Eliminare la stampante "${s.nome}"?`)) return
    setStampanti(prev => prev.filter(x => x.id !== s.id))
    await fetch(`/api/stampanti/${s.id}`, { method: 'DELETE' })
  }

  const ristampa = async (job: PrintJob) => {
    await fetch('/api/stampe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id }),
    })
    await caricaCoda()
  }

  const mostraAnteprima = async () => {
    const res = await fetch('/api/stampe/anteprima', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    })
    if (res.ok) setAnteprima((await res.json()).anteprime ?? [])
  }

  if (loading) return <div className="text-sm text-ink-navy/50">Caricamento…</div>

  return (
    <div className="space-y-8">
      {/* Nota transport mock */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        La consegna reale alle stampanti non è ancora attiva. Le comande vengono generate e segnate come
        stampate (modalità di prova): puoi verificarne il layout con l’<strong>anteprima</strong> qui sotto.
      </div>

      {/* Registra stampante */}
      <section>
        <h3 className="text-base font-bold text-ink-navy mb-3">Stampanti registrate</h3>
        <div className="space-y-2 mb-4">
          {stampanti.length === 0 && <p className="text-sm text-ink-navy/50">Nessuna stampante registrata.</p>}
          {stampanti.map(s => (
            <div key={s.id} className="flex items-center gap-3 border border-ink-navy/10 rounded-lg px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-navy text-sm truncate">{s.nome}</div>
                <div className="text-xs text-ink-navy/50">
                  {s.reparto} · {s.tipo === 'rete' ? (s.indirizzo || 'rete') : 'altro'}
                </div>
              </div>
              <button onClick={() => toggleAttiva(s)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.attiva ? 'bg-green-100 text-green-700' : 'bg-mist text-ink-navy/50'}`}>
                {s.attiva ? 'Attiva' : 'Disattivata'}
              </button>
              <button onClick={() => elimina(s)} className="text-ink-navy/40 hover:text-red-500 p-1" aria-label="Elimina">
                <IconTrash className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="border border-ink-navy/10 rounded-lg p-4 bg-mist/40">
          <div className="text-sm font-semibold text-ink-navy mb-3">Aggiungi stampante</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-navy/60 mb-1">Nome</label>
              <input className={cls} value={nome} onChange={e => setNome(e.target.value)} placeholder="Es. Cucina calda" />
            </div>
            <div>
              <label className="block text-xs text-ink-navy/60 mb-1">Reparto servito</label>
              <select className={cls} value={reparto} onChange={e => setReparto(e.target.value)}>
                {reparti.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-navy/60 mb-1">Tipo</label>
              <select className={cls} value={tipo} onChange={e => setTipo(e.target.value as 'rete' | 'altro')}>
                <option value="rete">Rete (IP)</option>
                <option value="altro">Altro</option>
              </select>
            </div>
            {tipo === 'rete' && (
              <div>
                <label className="block text-xs text-ink-navy/60 mb-1">Indirizzo</label>
                <input className={cls} value={indirizzo} onChange={e => setIndirizzo(e.target.value)} placeholder="192.168.1.50:9100" />
              </div>
            )}
          </div>
          <button onClick={aggiungi} disabled={salvando || !nome.trim() || !reparto}
            className="mt-3 bg-electric-blue text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
            {salvando ? 'Salvataggio…' : 'Aggiungi'}
          </button>
        </div>
      </section>

      {/* Anteprima comanda */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-ink-navy">Anteprima comanda</h3>
          <button onClick={mostraAnteprima}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-electric-blue text-electric-blue hover:bg-electric-blue/5">
            Genera anteprima d’esempio
          </button>
        </div>
        {anteprima && (
          <div className="grid gap-4 sm:grid-cols-2">
            {anteprima.map((a, i) => (
              <pre key={i} className="bg-white border border-ink-navy/15 rounded-lg p-3 text-[11px] leading-tight font-mono text-ink-navy overflow-x-auto whitespace-pre">
{a.testo}
              </pre>
            ))}
          </div>
        )}
      </section>

      {/* Coda di stampa */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-ink-navy">Coda di stampa</h3>
          <button onClick={caricaCoda} className="text-sm text-electric-blue hover:underline">Aggiorna</button>
        </div>
        <div className="space-y-2">
          {jobs.length === 0 && <p className="text-sm text-ink-navy/50">Nessuna comanda in coda.</p>}
          {jobs.map(job => (
            <div key={job.id} className="flex items-start gap-3 border border-ink-navy/10 rounded-lg px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink-navy text-sm">{job.reparto}</span>
                  {statoBadge(job.stato)}
                  <span className="text-xs text-ink-navy/40">{job.stampante?.nome ?? 'nessuna stampante'}</span>
                </div>
                <div className="text-xs text-ink-navy/40">{new Date(job.createdAt).toLocaleString('it-IT')}</div>
                {job.errore && <div className="text-xs text-red-600 mt-0.5">{job.errore}</div>}
              </div>
              <button onClick={() => ristampa(job)}
                className="text-sm font-semibold px-3 py-1 rounded-lg border border-ink-navy/15 text-ink-navy hover:bg-mist shrink-0">
                Ristampa
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

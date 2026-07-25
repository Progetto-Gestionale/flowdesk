'use client'
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

type Modo = 'ciclante' | 'fisso'

export default function TimbraturePage() {
  const [modo, setModo] = useState<Modo>('ciclante')
  const [caricato, setCaricato] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [secondi, setSecondi] = useState(60)
  const qrRef = useRef<HTMLDivElement>(null)

  async function fetchToken(fisso: boolean) {
    const res = await fetch(`/api/qr-timbratura/token${fisso ? '?fisso=1' : ''}`, { credentials: 'include' })
    if (res.ok) {
      const d = await res.json()
      setToken(d.token)
    }
  }

  // Carica la modalità salvata dal titolare (persistita lato server): è quella che
  // determina anche quale token è valido allo scan, così le due modalità non si mescolano.
  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.qrTimbraturaFisso) setModo('fisso') })
      .catch(() => {})
      .finally(() => setCaricato(true))
  }, [])

  // Salva la scelta lato server e aggiorna la modalità mostrata.
  async function cambiaModo(m: Modo) {
    if (m === modo) return
    setModo(m)
    await fetch('/api/settings', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrTimbraturaFisso: m === 'fisso' }),
    }).catch(() => {})
  }

  useEffect(() => {
    if (!caricato) return // aspetta la modalità salvata per non mostrare il QR sbagliato
    setToken(null)
    fetchToken(modo === 'fisso')
    if (modo === 'fisso') return // il QR fisso non scade: nessun timer

    const now = new Date()
    setSecondi(60 - now.getSeconds())
    const tick = setInterval(() => {
      setSecondi(prev => {
        if (prev <= 1) { fetchToken(false); return 60 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [modo, caricato])

  function stampaQr() {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const svgHtml = svg.outerHTML
    const w = window.open('', '_blank', 'width=480,height=640')
    if (!w) return
    w.document.write(`<html><head><title>QR Timbratura</title><style>
      body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif}
      svg{width:300px;height:300px}
      h2{margin:16px 0 4px;font-size:20px;font-weight:700}
      p{color:#666;font-size:13px;margin:0}
    </style></head><body>${svgHtml}<h2>Timbratura</h2><p>Scannerizza dall'area personale per timbrare</p>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  const circumference = 2 * Math.PI * 22
  const strokeDash = (secondi / 60) * circumference

  return (
    <div className="max-w-sm mx-auto space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-navy">QR Timbratura</h1>
        <p className="text-sm text-ink-navy/40 mt-0.5">
          {modo === 'ciclante'
            ? 'Il QR si aggiorna ogni minuto — i dipendenti lo scansionano dall\'area personale'
            : 'QR fisso e stampabile — comodo ma meno sicuro (una foto permette di timbrare da remoto)'}
        </p>
      </div>

      {/* Switch modalità */}
      <div className="flex rounded-xl border border-ink-navy/10 bg-white overflow-hidden shadow-sm text-sm font-medium">
        {([
          { k: 'ciclante' as const, l: 'Ciclante (sicuro)' },
          { k: 'fisso' as const, l: 'Fisso (stampabile)' },
        ]).map(o => (
          <button key={o.k} onClick={() => cambiaModo(o.k)}
            className={`flex-1 px-4 py-2 transition-colors ${modo === o.k ? 'bg-electric-blue text-white' : 'text-ink-navy/50 hover:bg-mist'}`}>
            {o.l}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-8 flex flex-col items-center gap-6">
        <p className="text-xs text-ink-navy/30 uppercase tracking-wide font-semibold">
          {modo === 'ciclante' ? 'Mostra questo schermo ai dipendenti' : 'Stampa e affiggi vicino all\'ingresso'}
        </p>

        {token ? (
          <div ref={qrRef} className="p-4 bg-white rounded-2xl border-2 border-ink-navy/8 shadow-sm">
            <QRCodeSVG value={token} size={240} bgColor="#ffffff" fgColor="#0f172a" level="M" />
          </div>
        ) : (
          <div className="w-[272px] h-[272px] bg-mist rounded-2xl animate-pulse" />
        )}

        {modo === 'ciclante' ? (
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="22" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                <circle cx="24" cy="24" r="22" fill="none"
                  stroke={secondi <= 10 ? '#f59e0b' : '#3b82f6'} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${strokeDash} ${circumference}`}
                  style={{ transition: 'stroke-dasharray 0.9s linear' }} />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${secondi <= 10 ? 'text-amber-500' : 'text-electric-blue'}`}>
                {secondi}
              </span>
            </div>
            <p className="text-xs text-ink-navy/30">secondi al prossimo QR</p>
          </div>
        ) : (
          <button onClick={stampaQr} disabled={!token}
            className="w-full py-2.5 rounded-xl bg-electric-blue text-white text-sm font-semibold hover:bg-electric-blue/90 disabled:opacity-50 transition-colors">
            🖨 Stampa QR
          </button>
        )}
      </div>
    </div>
  )
}

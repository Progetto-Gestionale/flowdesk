'use client'
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export default function TimbraturePage() {
  const [token, setToken] = useState<string | null>(null)
  const [secondi, setSecondi] = useState(60)

  async function fetchToken() {
    const res = await fetch('/api/qr-timbratura/token', { credentials: 'include' })
    if (res.ok) {
      const d = await res.json()
      setToken(d.token)
    }
  }

  useEffect(() => {
    fetchToken()

    const now = new Date()
    setSecondi(60 - now.getSeconds())

    const tick = setInterval(() => {
      setSecondi(prev => {
        if (prev <= 1) { fetchToken(); return 60 }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(tick)
  }, [])

  const circumference = 2 * Math.PI * 22
  const strokeDash = (secondi / 60) * circumference

  return (
    <div className="max-w-sm mx-auto space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-navy">QR Timbratura</h1>
        <p className="text-sm text-ink-navy/40 mt-0.5">Il QR si aggiorna ogni minuto — i dipendenti lo scansionano dall'area personale</p>
      </div>

      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-8 flex flex-col items-center gap-6">
        <p className="text-xs text-ink-navy/30 uppercase tracking-wide font-semibold">Mostra questo schermo ai dipendenti</p>

        {token ? (
          <div className="p-4 bg-white rounded-2xl border-2 border-ink-navy/8 shadow-sm">
            <QRCodeSVG
              value={token}
              size={240}
              bgColor="#ffffff"
              fgColor="#0f172a"
              level="M"
            />
          </div>
        ) : (
          <div className="w-[272px] h-[272px] bg-mist rounded-2xl animate-pulse" />
        )}

        <div className="flex flex-col items-center gap-2">
          <div className="relative w-12 h-12">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="22" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle
                cx="24" cy="24" r="22" fill="none"
                stroke={secondi <= 10 ? '#f59e0b' : '#3b82f6'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${strokeDash} ${circumference}`}
                style={{ transition: 'stroke-dasharray 0.9s linear' }}
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${secondi <= 10 ? 'text-amber-500' : 'text-electric-blue'}`}>
              {secondi}
            </span>
          </div>
          <p className="text-xs text-ink-navy/30">secondi al prossimo QR</p>
        </div>
      </div>
    </div>
  )
}

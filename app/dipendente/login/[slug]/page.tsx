'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Logo from '@/app/components/Logo'

export default function DipendenteLoginSlug() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErrore('')
    setLoading(true)
    const res = await fetch('/api/dipendente/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password, slug }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setErrore(data.error ?? 'Errore di accesso'); return }
    router.push('/dipendente/dashboard')
  }

  const inp = 'w-full border border-ink-navy/15 rounded-xl px-4 py-3 text-sm text-ink-navy placeholder:text-ink-navy/30 focus:outline-none focus:ring-2 focus:ring-electric-blue/40 focus:border-electric-blue/50 transition bg-white'

  return (
    <div className="min-h-screen bg-mist flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        <div className="flex justify-center mb-2">
          <Logo size={40} withWordmark />
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-ink-navy/10 p-8 space-y-6">
          <div>
            <h1 className="text-lg font-bold text-ink-navy">Area dipendenti</h1>
            <p className="text-sm text-ink-navy/40 mt-0.5">Accedi con le credenziali fornite dal tuo responsabile</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink-navy/60 mb-1.5 uppercase tracking-wide">Username</label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
                className={inp}
                placeholder="mario.rossi"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-navy/60 mb-1.5 uppercase tracking-wide">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={inp}
                placeholder="••••••••"
              />
            </div>

            {errore && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                {errore}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-electric-blue text-white font-semibold py-3 rounded-xl hover:bg-electric-blue/90 disabled:opacity-50 transition text-sm">
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-navy/35 px-4">
          Se non riesci ad accedere, contatta il responsabile del locale.
        </p>
      </div>
    </div>
  )
}

'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()
  const pathname = usePathname()
  const [verticale, setVerticale] = useState<'food' | 'care' | null>(null)

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
      return
    }
    if (!isSignedIn) return

    // Carica verticale dal DB e gestisce il cookie post-signup
    fetch('/api/utente/me', { credentials: 'include' })
      .then(r => r.json())
      .then(async (u) => {
        let v: 'food' | 'care' = u.verticale ?? 'food'

        // Se c'è un cookie di pending (appena registrato) aggiorna il DB
        const match = document.cookie.match(/verticale_pending=(food|care)/)
        if (match) {
          const pending = match[1] as 'food' | 'care'
          await fetch('/api/utente/setup', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ verticale: pending }),
          })
          document.cookie = 'verticale_pending=; path=/; max-age=0'
          v = pending
        }

        setVerticale(v)
      })
  }, [isLoaded, isSignedIn, router])

  // Protezione route: reindirizza se l'utente accede alla verticale sbagliata
  useEffect(() => {
    if (!verticale) return
    if (pathname.startsWith('/dashboard/care') && verticale !== 'care') {
      router.replace('/dashboard')
    }
    if (pathname.startsWith('/dashboard/food') && verticale !== 'food') {
      router.replace('/dashboard')
    }
  }, [verticale, pathname, router])

  if (!isLoaded || !isSignedIn || !verticale) {
    return <div className="flex h-screen items-center justify-center text-ink-navy/40 text-sm font-mono">Caricamento...</div>
  }

  return (
    <div className="flex h-screen bg-mist overflow-hidden">
      <Sidebar verticale={verticale} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

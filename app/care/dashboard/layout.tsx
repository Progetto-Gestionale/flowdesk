'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Campanella from './components/Campanella'
import TopBar from '@/app/components/TopBar'

export default function CareDashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
      return
    }
    if (!isSignedIn) return

    fetch('/api/utente/me', { credentials: 'include' })
      .then(r => r.json())
      .then((u) => {
        if (u.verticale !== 'care') {
          router.replace('/food/dashboard')
          return
        }
        setReady(true)
      })
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded || !isSignedIn || !ready) {
    return <div className="flex h-screen items-center justify-center text-ink-navy/40 text-sm font-mono">Caricamento...</div>
  }

  return (
    <div className="flex h-screen bg-mist overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar notifiche={<Campanella />} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

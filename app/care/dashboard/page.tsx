'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconCalendar, IconClipboard, IconCash, IconCheck, IconArrowRight } from '@/app/components/icons'
import TodoList from './components/TodoList'

interface Numeri {
  seduteOggi: number
  richiesteInAttesa: number
  incassoSettimana: number
}

export default function CareDashboardHome() {
  const [n, setN] = useState<Numeri | null>(null)

  useEffect(() => {
    fetch('/api/care/overview', { credentials: 'include', cache: 'no-store' })
      .then(r => r.json())
      .then(setN)
      .catch(() => setN({ seduteOggi: 0, richiesteInAttesa: 0, incassoSettimana: 0 }))
  }, [])

  const box = [
    {
      label: 'Sedute oggi', valore: n ? String(n.seduteOggi) : '—',
      Icon: IconCalendar, href: '/care/dashboard/calendario', evidenzia: false,
    },
    {
      label: 'Richieste in attesa', valore: n ? String(n.richiesteInAttesa) : '—',
      Icon: IconClipboard, href: '/care/dashboard/richieste',
      evidenzia: Boolean(n && n.richiesteInAttesa > 0),
    },
    {
      label: 'Incassato da lunedì', valore: n ? `€${n.incassoSettimana.toFixed(0)}` : '—',
      Icon: IconCash, href: '/care/dashboard/analytics', evidenzia: false,
    },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink-navy">Overview</h1>
        <p className="text-ink-navy/50 mt-0.5">La tua giornata in tre numeri.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {box.map(b => (
          <Link key={b.label} href={b.href}
            className={`bg-white border rounded-2xl p-5 hover:shadow-sm transition-all ${
              b.evidenzia ? 'border-electric-blue/40' : 'border-ink-navy/10 hover:border-electric-blue/30'}`}>
            <div className="w-5 h-5 text-electric-blue mb-3"><b.Icon /></div>
            <div className="text-3xl font-extrabold text-ink-navy">{b.valore}</div>
            <div className="text-sm text-ink-navy/50 mt-0.5">{b.label}</div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-ink-navy flex items-center gap-2">
            <span className="w-4 h-4 text-electric-blue"><IconCheck /></span>
            To-do List
          </h2>
          <Link href="/care/dashboard/todo"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-electric-blue hover:underline">
            Apri <span className="w-3 h-3"><IconArrowRight /></span>
          </Link>
        </div>
        <TodoList compatta />
      </div>
    </div>
  )
}

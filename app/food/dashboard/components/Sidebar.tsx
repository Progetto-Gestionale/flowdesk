'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  IconGrid, IconUsers, IconClipboard, IconCalendar,
  IconFork, IconReceipt, IconTable, IconChartBar, IconSettings,
  IconClock, IconCash, IconDelivery,
} from '@/app/components/icons'

const navFood = [
  {
    section: 'Servizio',
    items: [
      { label: 'Tavoli & QR', href: '/food/dashboard/tavoli', Icon: IconTable },
      { label: 'Ordini', href: '/food/dashboard/ordini', Icon: IconReceipt },
      { label: 'Conti', href: '/food/dashboard/conti', Icon: IconCash },
      { label: 'Prenotazioni tavoli', href: '/food/dashboard/clienti/preventivi', Icon: IconClipboard },
      { label: 'Calendario', href: '/food/dashboard/clienti/calendario', Icon: IconCalendar },
      { label: 'Delivery', href: '/food/dashboard/delivery', Icon: IconDelivery },
    ],
  },
  {
    section: 'Gestione',
    items: [
      { label: 'Menu', href: '/food/dashboard/menu', Icon: IconFork },
      { label: 'Analytics', href: '/food/dashboard/analytics', Icon: IconChartBar },
      { label: 'Staff', href: '/food/dashboard/staff', Icon: IconUsers },
      { label: 'QR Timbratura', href: '/food/dashboard/timbrature', Icon: IconClock },
    ],
  },
  {
    section: 'Account',
    items: [
      { label: 'Impostazioni', href: '/food/dashboard/impostazioni', Icon: IconSettings },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [daVerificare, setDaVerificare] = useState(0)

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('/api/preventivi/count', { credentials: 'include' })
        const data = await res.json()
        setDaVerificare(data.daVerificare ?? 0)
      } catch { }
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    window.addEventListener('refresh-richieste-count', fetchCount)
    return () => {
      clearInterval(interval)
      window.removeEventListener('refresh-richieste-count', fetchCount)
    }
  }, [])

  return (
    <aside className="w-60 shrink-0 bg-ink-navy flex flex-col h-full">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-[28%] bg-electric-blue flex items-center justify-center shrink-0">
            <span className="text-zest-lime font-extrabold text-sm leading-none">F</span>
          </div>
          <span className="text-sm font-extrabold text-white truncate">Flowest Food</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        <Link href="/food/dashboard"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/food/dashboard' ? 'bg-electric-blue text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
          <span className="w-[18px] h-[18px] shrink-0"><IconGrid /></span>
          <span>Overview</span>
        </Link>

        {navFood.map((group, i) => (
          <div key={i} className="pt-4">
            <p className="px-3 pb-1 font-mono text-[10px] font-semibold text-white/30 uppercase tracking-wider">
              {group.section}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-electric-blue text-white'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}>
                    <span className="w-[18px] h-[18px] shrink-0">
                      <item.Icon />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.href === '/food/dashboard/clienti/preventivi' && daVerificare > 0 && (
                      <span className="bg-zest-lime text-ink-navy text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {daVerificare > 9 ? '9+' : daVerificare}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Piano attivo */}
      <div className="p-4 border-t border-white/10">
        <div className="bg-white/5 rounded-lg p-3">
          <p className="text-xs font-semibold text-zest-lime">
            Trial gratuito
          </p>
          <p className="text-xs text-white/40 mt-0.5">
            30 giorni rimanenti
          </p>
          <button className="mt-2 w-full text-xs bg-zest-lime hover:bg-zest-lime/90 text-ink-navy rounded-md py-1.5 font-semibold transition-colors">
            Passa a Pro
          </button>
        </div>
      </div>
    </aside>
  )
}

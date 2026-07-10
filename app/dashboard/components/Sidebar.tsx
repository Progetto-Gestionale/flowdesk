'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  IconGrid, IconUsers, IconChat, IconClipboard, IconCalendar, IconHourglass,
  IconBot, IconFork, IconReceipt, IconTable, IconChartBar, IconSettings,
  IconStethoscope, IconFolder, IconClock,
} from './../../components/icons'

const navFood = [
  {
    section: 'Clienti',
    items: [
      { label: 'Clienti', href: '/dashboard/clienti/rubrica', Icon: IconUsers },
      { label: 'Messaggi', href: '/dashboard/clienti/inbox', Icon: IconChat },
      { label: 'Richieste', href: '/dashboard/clienti/preventivi', Icon: IconClipboard },
      { label: 'Calendario', href: '/dashboard/clienti/calendario', Icon: IconCalendar },
      { label: "Lista d'attesa", href: '/dashboard/clienti/lista-attesa', Icon: IconHourglass },
      { label: 'Chatbot Demo', href: '/dashboard/clienti/chatbot', Icon: IconBot },
    ],
  },
  {
    section: 'Gestione',
    items: [
      { label: 'Menu', href: '/dashboard/menu', Icon: IconFork },
      { label: 'Ordini', href: '/dashboard/ordini', Icon: IconReceipt },
      { label: 'Tavoli & QR', href: '/dashboard/tavoli', Icon: IconTable },
      { label: 'Analytics', href: '/dashboard/analytics', Icon: IconChartBar },
      { label: 'Staff', href: '/dashboard/staff', Icon: IconUsers },
      { label: 'QR Timbratura', href: '/dashboard/timbrature', Icon: IconClock },
    ],
  },
  {
    section: 'Account',
    items: [
      { label: 'Impostazioni', href: '/dashboard/impostazioni', Icon: IconSettings },
    ],
  },
]

const navCare = [
  {
    section: 'Pazienti',
    items: [
      { label: 'Pazienti', href: '/dashboard/care/pazienti', Icon: IconStethoscope },
      { label: 'Appuntamenti', href: '/dashboard/care/appuntamenti', Icon: IconCalendar },
      { label: 'Cartelle cliniche', href: '/dashboard/care/cartelle', Icon: IconFolder },
    ],
  },
  {
    section: 'Gestione',
    items: [
      { label: 'Analytics', href: '/dashboard/care/analytics', Icon: IconChartBar },
      { label: 'Staff', href: '/dashboard/care/staff', Icon: IconUsers },
    ],
  },
  {
    section: 'Account',
    items: [
      { label: 'Impostazioni', href: '/dashboard/impostazioni', Icon: IconSettings },
    ],
  },
]

interface SidebarProps {
  verticale: 'food' | 'care'
}

export default function Sidebar({ verticale }: SidebarProps) {
  const pathname = usePathname()
  const [daVerificare, setDaVerificare] = useState(0)
  const [inAttesa, setInAttesa] = useState(0)

  useEffect(() => {
    if (verticale !== 'food') return
    async function fetchCount() {
      try {
        const [resP, resA] = await Promise.all([
          fetch('/api/preventivi/count', { credentials: 'include' }),
          fetch('/api/lista-attesa?attivi=true', { credentials: 'include' }),
        ])
        const dataP = await resP.json()
        const dataA = await resA.json()
        setDaVerificare(dataP.daVerificare ?? 0)
        setInAttesa((dataA.lista ?? []).length)
      } catch { }
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    window.addEventListener('refresh-richieste-count', fetchCount)
    return () => {
      clearInterval(interval)
      window.removeEventListener('refresh-richieste-count', fetchCount)
    }
  }, [verticale])

  const navigation = verticale === 'food' ? navFood : navCare
  const logoLabel = verticale === 'food' ? 'Flowest Food' : 'Flowest Care'

  return (
    <aside className="w-60 shrink-0 bg-ink-navy flex flex-col h-full">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-[28%] bg-electric-blue flex items-center justify-center shrink-0">
            <span className="text-zest-lime font-extrabold text-sm leading-none">F</span>
          </div>
          <span className="text-sm font-extrabold text-white truncate">{logoLabel}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        <Link href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/dashboard' ? 'bg-electric-blue text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
          <span className="w-[18px] h-[18px] shrink-0"><IconGrid /></span>
          <span>Overview</span>
        </Link>

        {navigation.map((group, i) => (
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
                    {item.href === '/dashboard/clienti/preventivi' && daVerificare > 0 && (
                      <span className="bg-zest-lime text-ink-navy text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {daVerificare > 9 ? '9+' : daVerificare}
                      </span>
                    )}
                    {item.href === '/dashboard/clienti/lista-attesa' && inAttesa > 0 && (
                      <span className="bg-amber-400 text-ink-navy text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {inAttesa > 9 ? '9+' : inAttesa}
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

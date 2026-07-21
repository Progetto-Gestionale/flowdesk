'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconGrid, IconUsers, IconCalendar, IconChartBar, IconSettings,
  IconStethoscope, IconClipboard, IconClock,
} from '@/app/components/icons'

const navCare = [
  {
    section: 'Agenda',
    items: [
      { label: 'Calendario', href: '/care/dashboard/calendario', Icon: IconCalendar },
      { label: 'Richieste', href: '/care/dashboard/richieste', Icon: IconClipboard },
    ],
  },
  {
    section: 'Pazienti',
    items: [
      { label: 'Pazienti', href: '/care/dashboard/pazienti', Icon: IconStethoscope },
    ],
  },
  {
    section: 'Gestione',
    items: [
      { label: 'Sedute', href: '/care/dashboard/sedute', Icon: IconClock },
      { label: 'Analytics', href: '/care/dashboard/analytics', Icon: IconChartBar },
      { label: 'Staff', href: '/care/dashboard/staff', Icon: IconUsers },
    ],
  },
  {
    section: 'Account',
    items: [
      { label: 'Impostazioni', href: '/care/dashboard/impostazioni', Icon: IconSettings },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 shrink-0 bg-ink-navy flex flex-col h-full">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-[28%] bg-electric-blue flex items-center justify-center shrink-0">
            <span className="text-zest-lime font-extrabold text-sm leading-none">F</span>
          </div>
          <span className="text-sm font-extrabold text-white truncate">Flowest Care</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        <Link href="/care/dashboard"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/care/dashboard' ? 'bg-electric-blue text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
          <span className="w-[18px] h-[18px] shrink-0"><IconGrid /></span>
          <span>Overview</span>
        </Link>

        {navCare.map((group, i) => (
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

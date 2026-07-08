'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const navFood = [
  {
    section: 'Modulo 1 — Marketing',
    items: [
      { label: 'Analytics Social', href: '/dashboard/marketing/analytics', icon: '📊' },
      { label: 'Content Repurposing', href: '/dashboard/marketing/content', icon: '✨' },
      { label: 'Piano Editoriale', href: '/dashboard/marketing/piano', icon: '📅' },
      { label: 'Report ROI', href: '/dashboard/marketing/roi', icon: '📈' },
    ],
  },
  {
    section: 'Modulo 2 — Clienti',
    items: [
      { label: 'Contatti & Pipeline', href: '/dashboard/clienti/crm', icon: '🗂️' },
      { label: 'Messaggi', href: '/dashboard/clienti/inbox', icon: '💬' },
      { label: 'Richieste', href: '/dashboard/clienti/preventivi', icon: '📋' },
      { label: 'Calendario', href: '/dashboard/clienti/calendario', icon: '🗓️' },
      { label: "Lista d'attesa", href: '/dashboard/clienti/lista-attesa', icon: '⏳' },
      { label: 'Chatbot Demo', href: '/dashboard/clienti/chatbot', icon: '🤖' },
    ],
  },
  {
    section: 'Gestione',
    items: [
      { label: 'Menu', href: '/dashboard/menu', icon: '🍽️' },
      { label: 'Ordini', href: '/dashboard/ordini', icon: '🧾' },
      { label: 'Tavoli & QR', href: '/dashboard/tavoli', icon: '🪑' },
      { label: 'Analytics', href: '/dashboard/analytics', icon: '📊' },
      { label: 'Staff', href: '/dashboard/staff', icon: '👥' },
    ],
  },
  {
    section: 'Account',
    items: [
      { label: 'Impostazioni', href: '/dashboard/impostazioni', icon: '⚙️' },
    ],
  },
]

const navCare = [
  {
    section: 'Pazienti',
    items: [
      { label: 'Pazienti', href: '/dashboard/care/pazienti', icon: '🧑‍⚕️' },
      { label: 'Appuntamenti', href: '/dashboard/care/appuntamenti', icon: '🗓️' },
      { label: 'Cartelle cliniche', href: '/dashboard/care/cartelle', icon: '📁' },
    ],
  },
  {
    section: 'Gestione',
    items: [
      { label: 'Analytics', href: '/dashboard/analytics', icon: '📊' },
      { label: 'Staff', href: '/dashboard/staff', icon: '👥' },
    ],
  },
  {
    section: 'Account',
    items: [
      { label: 'Impostazioni', href: '/dashboard/impostazioni', icon: '⚙️' },
    ],
  },
]

interface SidebarProps {
  verticale: 'food' | 'care'
}

export default function Sidebar({ verticale }: SidebarProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(true)
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
  const accentColor = verticale === 'food' ? 'indigo' : 'teal'
  const logoLabel = verticale === 'food' ? 'Flowest Food' : 'Flowest Care'
  const logoIcon = verticale === 'food' ? '🍽️' : '🏥'

  return (
    <aside className={`${open ? 'w-60' : 'w-16'} transition-all duration-200 bg-white border-r border-gray-200 flex flex-col h-full`}>
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200">
        {open ? (
          <span className={`text-base font-bold ${accentColor === 'teal' ? 'text-teal-600' : 'text-indigo-600'}`}>
            {logoIcon} {logoLabel}
          </span>
        ) : (
          <span className="text-lg">{logoIcon}</span>
        )}
        <button onClick={() => setOpen(v => !v)} className="text-gray-400 hover:text-gray-600 text-xs ml-1">
          {open ? '◀' : '▶'}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        <Link href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/dashboard' ? `bg-${accentColor}-50 text-${accentColor}-700` : 'text-gray-600 hover:bg-gray-100'}`}>
          <span className="text-base shrink-0">▦</span>
          {open && <span>Overview</span>}
        </Link>

        {navigation.map((group, i) => (
          <div key={i} className="pt-4">
            {open && (
              <p className="px-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {group.section}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? accentColor === 'teal'
                          ? 'bg-teal-50 text-teal-700'
                          : 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}>
                    <span className="text-base shrink-0 relative">
                      {item.icon}
                      {item.href === '/dashboard/clienti/preventivi' && daVerificare > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                          {daVerificare > 9 ? '9+' : daVerificare}
                        </span>
                      )}
                      {item.href === '/dashboard/clienti/lista-attesa' && inAttesa > 0 && (
                        <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                          {inAttesa > 9 ? '9+' : inAttesa}
                        </span>
                      )}
                    </span>
                    {open && <span className="flex-1">{item.label}</span>}
                    {open && item.href === '/dashboard/clienti/preventivi' && daVerificare > 0 && (
                      <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {daVerificare > 9 ? '9+' : daVerificare}
                      </span>
                    )}
                    {open && item.href === '/dashboard/clienti/lista-attesa' && inAttesa > 0 && (
                      <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
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
      {open && (
        <div className="p-4 border-t border-gray-200">
          <div className={`${accentColor === 'teal' ? 'bg-teal-50' : 'bg-indigo-50'} rounded-lg p-3`}>
            <p className={`text-xs font-semibold ${accentColor === 'teal' ? 'text-teal-700' : 'text-indigo-700'}`}>
              Trial gratuito
            </p>
            <p className={`text-xs ${accentColor === 'teal' ? 'text-teal-500' : 'text-indigo-500'} mt-0.5`}>
              30 giorni rimanenti
            </p>
            <button className={`mt-2 w-full text-xs ${accentColor === 'teal' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-md py-1.5 font-medium transition-colors`}>
              Passa a Pro
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

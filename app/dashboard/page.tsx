import Link from 'next/link'
import type { ComponentType } from 'react'
import { IconUsers, IconClipboard, IconChat, IconCalendar, IconFork } from '../components/icons'

const stats: { label: string; value: string; Icon: ComponentType<{ className?: string }>; href: string }[] = [
  { label: 'Lead questo mese', value: '—', Icon: IconUsers, href: '/dashboard/clienti/crm' },
  { label: 'Richieste in attesa', value: '—', Icon: IconClipboard, href: '/dashboard/clienti/preventivi' },
  { label: 'Messaggi non letti', value: '—', Icon: IconChat, href: '/dashboard/clienti/inbox' },
  { label: 'Prenotazioni', value: '—', Icon: IconCalendar, href: '/dashboard/clienti/calendario' },
]

const modules = [
  {
    title: 'Lead & Client Hub',
    description: 'CRM, inbox unificata WhatsApp + email, preventivi e calendario.',
    Icon: IconUsers,
    links: [
      { label: 'CRM / Pipeline', href: '/dashboard/clienti/crm' },
      { label: 'Inbox Unificata', href: '/dashboard/clienti/inbox' },
      { label: 'Preventivi', href: '/dashboard/clienti/preventivi' },
    ],
  },
  {
    title: 'Sala & Cucina',
    description: 'Menu digitale, ordini QR in tempo reale e mappa tavoli.',
    Icon: IconFork,
    links: [
      { label: 'Menu', href: '/dashboard/menu' },
      { label: 'Ordini', href: '/dashboard/ordini' },
      { label: 'Tavoli & QR', href: '/dashboard/tavoli' },
    ],
  },
]

export default function DashboardHome() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-ink-navy">Benvenuto in Flowest</h1>
        <p className="text-ink-navy/50 mt-1">Ecco un riepilogo della tua attività.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white border border-ink-navy/10 rounded-xl p-4 hover:shadow-sm hover:border-electric-blue/30 transition-all"
          >
            <div className="w-6 h-6 text-electric-blue mb-3">
              <s.Icon />
            </div>
            <div className="text-2xl font-extrabold text-ink-navy">{s.value}</div>
            <div className="text-sm text-ink-navy/50 mt-0.5">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* Moduli */}
      <div className="grid md:grid-cols-2 gap-6">
        {modules.map((m) => (
          <div key={m.title} className="border border-ink-navy/10 bg-white rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-electric-blue/10 flex items-center justify-center p-2.5 text-electric-blue">
                <m.Icon />
              </div>
              <h2 className="font-bold text-ink-navy">{m.title}</h2>
            </div>
            <p className="text-sm text-ink-navy/50 mb-4">{m.description}</p>
            <div className="flex flex-col gap-1">
              {m.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm text-electric-blue hover:text-ink-navy font-medium flex items-center gap-1"
                >
                  → {l.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Banner setup */}
      <div className="bg-ink-navy rounded-xl p-5 text-white flex items-center justify-between">
        <div>
          <p className="font-semibold">Completa il setup del tuo account</p>
          <p className="text-white/50 text-sm mt-0.5">Configura il tuo locale e le preferenze AI.</p>
        </div>
        <Link
          href="/dashboard/impostazioni"
          className="bg-zest-lime text-ink-navy text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zest-lime/90 transition-colors shrink-0"
        >
          Configura →
        </Link>
      </div>
    </div>
  )
}

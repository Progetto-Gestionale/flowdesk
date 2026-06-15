import Link from 'next/link'

const stats = [
  { label: 'Lead questo mese', value: '—', icon: '👤', href: '/dashboard/clienti/crm' },
  { label: 'Post pubblicati', value: '—', icon: '📝', href: '/dashboard/marketing/piano' },
  { label: 'ROI campagne', value: '—', icon: '📈', href: '/dashboard/marketing/roi' },
  { label: 'Messaggi non letti', value: '—', icon: '💬', href: '/dashboard/clienti/inbox' },
]

const modules = [
  {
    title: 'Marketing Intelligence',
    description: 'Analytics social, content repurposing AI, piano editoriale e calcolo ROI.',
    icon: '📊',
    color: 'bg-violet-50 border-violet-200',
    iconBg: 'bg-violet-100',
    links: [
      { label: 'Analytics Social', href: '/dashboard/marketing/analytics' },
      { label: 'Content Repurposing', href: '/dashboard/marketing/content' },
      { label: 'Piano Editoriale', href: '/dashboard/marketing/piano' },
    ],
  },
  {
    title: 'Lead & Client Hub',
    description: 'CRM, inbox unificata WhatsApp + email, preventivi e calendario.',
    icon: '🤝',
    color: 'bg-emerald-50 border-emerald-200',
    iconBg: 'bg-emerald-100',
    links: [
      { label: 'CRM / Pipeline', href: '/dashboard/clienti/crm' },
      { label: 'Inbox Unificata', href: '/dashboard/clienti/inbox' },
      { label: 'Preventivi', href: '/dashboard/clienti/preventivi' },
    ],
  },
]

export default function DashboardHome() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Benvenuto in FlowDesk</h1>
        <p className="text-gray-500 mt-1">Ecco un riepilogo della tua attività.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
          >
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* Moduli */}
      <div className="grid md:grid-cols-2 gap-6">
        {modules.map((m) => (
          <div key={m.title} className={`border rounded-xl p-5 ${m.color}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg ${m.iconBg} flex items-center justify-center text-xl`}>
                {m.icon}
              </div>
              <h2 className="font-semibold text-gray-900">{m.title}</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">{m.description}</p>
            <div className="flex flex-col gap-1">
              {m.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                >
                  → {l.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Banner setup */}
      <div className="bg-indigo-600 rounded-xl p-5 text-white flex items-center justify-between">
        <div>
          <p className="font-semibold">Completa il setup del tuo account</p>
          <p className="text-indigo-200 text-sm mt-0.5">Collega i tuoi social e configura le preferenze AI.</p>
        </div>
        <Link
          href="/dashboard/impostazioni"
          className="bg-white text-indigo-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-50 transition-colors shrink-0"
        >
          Configura →
        </Link>
      </div>
    </div>
  )
}

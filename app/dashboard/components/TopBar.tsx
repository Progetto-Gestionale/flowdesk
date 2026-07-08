'use client'

import { UserButton } from '@clerk/nextjs'
import { IconBell } from '../../components/icons'

export default function TopBar() {
  return (
    <header className="h-14 bg-white border-b border-ink-navy/10 flex items-center justify-end px-5 shrink-0">
      <div className="flex items-center gap-4">
        <button className="w-5 h-5 text-ink-navy/50 hover:text-ink-navy transition-colors" aria-label="Notifiche">
          <IconBell />
        </button>
        <UserButton />
      </div>
    </header>
  )
}

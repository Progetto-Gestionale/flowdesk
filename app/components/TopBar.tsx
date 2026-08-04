'use client'

import { UserButton } from '@clerk/nextjs'
import type { ReactNode } from 'react'
import { IconBell } from '@/app/components/icons'

// Guscio comune ai due verticali: nessuna logica di dominio qui dentro.
// `notifiche` permette a un verticale di montare la propria campanella
// (Care lo fa); senza, resta l'icona statica come prima.
export default function TopBar({ notifiche }: { notifiche?: ReactNode }) {
  return (
    <header className="h-14 bg-white border-b border-ink-navy/10 flex items-center justify-end px-5 shrink-0">
      <div className="flex items-center gap-4">
        {notifiche ?? (
          <button className="w-5 h-5 text-ink-navy/50 hover:text-ink-navy transition-colors" aria-label="Notifiche">
            <IconBell />
          </button>
        )}
        <UserButton />
      </div>
    </header>
  )
}

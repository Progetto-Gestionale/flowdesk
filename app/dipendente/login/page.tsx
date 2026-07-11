'use client'

import Logo from '@/app/components/Logo'

export default function DipendenteLoginRoot() {
  return (
    <div className="min-h-screen bg-mist flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center mb-2">
          <Logo size={40} withWordmark />
        </div>
        <div className="bg-white rounded-3xl shadow-sm border border-ink-navy/10 p-8 text-center space-y-3">
          <h1 className="text-lg font-bold text-ink-navy">Area dipendenti</h1>
          <p className="text-sm text-ink-navy/50">
            Per accedere usa il link o il QR code fornito dal tuo responsabile.
          </p>
        </div>
      </div>
    </div>
  )
}

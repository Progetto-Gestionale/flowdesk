'use client'
import { useRouter } from 'next/navigation'

export default function RegistratiPage() {
  const router = useRouter()

  function scegli(verticale: 'food' | 'care') {
    document.cookie = `verticale_pending=${verticale}; path=/; max-age=600`
    router.push('/sign-up')
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Scegli il tuo prodotto</h1>
        <p className="text-gray-500 mt-2">Puoi cambiarlo in seguito dalle impostazioni</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 w-full max-w-2xl">
        {/* Food */}
        <button onClick={() => scegli('food')}
          className="bg-white border-2 border-gray-200 hover:border-indigo-400 rounded-2xl p-8 text-left transition-all hover:shadow-lg group">
          <div className="text-4xl mb-4">🍽️</div>
          <h2 className="text-xl font-bold text-gray-900 group-hover:text-indigo-700 transition-colors">
            Flowest Food
          </h2>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">
            Gestione tavoli, menu digitale, ordini QR, prenotazioni, staff e analytics per ristoranti e locali.
          </p>
          <span className="inline-block mt-4 text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">
            Ristoranti · Bar · Locali
          </span>
        </button>

        {/* Care */}
        <button onClick={() => scegli('care')}
          className="bg-white border-2 border-gray-200 hover:border-teal-400 rounded-2xl p-8 text-left transition-all hover:shadow-lg group">
          <div className="text-4xl mb-4">🏥</div>
          <h2 className="text-xl font-bold text-gray-900 group-hover:text-teal-700 transition-colors">
            Flowest Care
          </h2>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">
            Gestione pazienti, appuntamenti, cartelle cliniche, staff e analytics per strutture sanitarie.
          </p>
          <span className="inline-block mt-4 text-xs font-semibold bg-teal-50 text-teal-700 px-3 py-1 rounded-full">
            Cliniche · Studi · Ambulatori
          </span>
        </button>
      </div>

      <p className="mt-8 text-sm text-gray-400">
        Hai già un account?{' '}
        <a href="/sign-in" className="text-indigo-600 hover:underline font-medium">Accedi</a>
      </p>
    </main>
  )
}

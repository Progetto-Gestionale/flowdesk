'use client'
import { useAuth } from '@clerk/nextjs'

function scegli(verticale: 'food' | 'care') {
  document.cookie = `verticale_pending=${verticale}; path=/; max-age=600`
  window.location.href = '/sign-up'
}

export default function Home() {
  const { isSignedIn } = useAuth()
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900">Flowest</h1>
          <p className="text-sm text-gray-400 mt-1">Scegli il tuo prodotto</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <button onClick={() => scegli('food')} className="flex flex-col items-center justify-center gap-2 bg-white border-2 border-indigo-200 hover:border-indigo-500 rounded-2xl p-6 text-center transition-colors group">
            <span className="text-4xl">🍽️</span>
            <span className="font-bold text-indigo-700 group-hover:text-indigo-900">Flowest Food</span>
            <span className="text-xs text-gray-400">Ristoranti &amp; locali</span>
          </button>
          <button onClick={() => scegli('care')} className="flex flex-col items-center justify-center gap-2 bg-white border-2 border-teal-200 hover:border-teal-500 rounded-2xl p-6 text-center transition-colors group">
            <span className="text-4xl">🏥</span>
            <span className="font-bold text-teal-700 group-hover:text-teal-900">Flowest Care</span>
            <span className="text-xs text-gray-400">Studi medici &amp; cliniche</span>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {isSignedIn ? (
            <a href="/dashboard" className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl text-center hover:bg-gray-700 transition-colors">
              Vai alla dashboard
            </a>
          ) : (
            <a href="/sign-in" className="w-full py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl text-center hover:bg-gray-50 transition-colors">
              Accedi
            </a>
          )}
        </div>
      </div>
    </main>
  )
}

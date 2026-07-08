'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Logo from './components/Logo'
import { IconArrowRight } from './components/icons'


const VERTICALI = [
  {
    id: 'food',
    product: 'food' as const,
    title: 'Il ristorante,',
    titleAccent: 'ordinato.',
    description: 'Tavoli, menu digitale, ordini QR, prenotazioni, staff e analytics. Il cliente ordina dal tavolo, tu ricevi tutto già organizzato.',
    live: true,
  },
  {
    id: 'care',
    product: 'care' as const,
    title: 'Lo studio,',
    titleAccent: 'più sano.',
    description: 'Pazienti, appuntamenti e cartelle cliniche per professionisti sanitari, senza fogli sparsi e telefonate perse.',
    live: false,
    href: '/care',
  },
  {
    id: 'web',
    product: 'web' as const,
    title: 'Il tuo sito,',
    titleAccent: 'sempre attivo.',
    description: 'Siti web professionali, veloci e sempre aggiornati, gestiti senza pensieri tecnici.',
    live: false,
    href: '/web',
  },
]

export default function Home() {
  const cardsRef = useRef<HTMLDivElement>(null)
  const [cardsVisible, setCardsVisible] = useState(false)

  useEffect(() => {
    const el = cardsRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setCardsVisible(true); obs.disconnect() } },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  function scegliFood() {
    document.cookie = `verticale_pending=food; path=/; max-age=600`
    window.location.href = '/sign-up'
  }

  return (
    <main className="min-h-screen bg-mist overflow-hidden">
      {/* Hero — Ink Navy */}
      <section className="bg-ink-navy relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="animate-blob absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-electric-blue/25 blur-[110px]" />
          <div className="animate-blob-slow absolute top-10 right-[-140px] w-[460px] h-[460px] rounded-full bg-zest-lime/15 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: 'radial-gradient(currentColor 1.5px, transparent 1.5px)',
              backgroundSize: '18px 18px',
              color: '#D6FB3D',
              maskImage: 'linear-gradient(to bottom right, transparent 30%, black 100%)',
            }}
          />
        </div>

        <div className="max-w-6xl mx-auto px-6 relative">
          <div className="h-20 flex items-center justify-between">
            <Logo size={32} dark className="animate-fade-up" />
            <Link
              href="/sign-in"
              className="animate-fade-up text-sm font-semibold text-white border border-white/20 px-4 py-2 rounded-lg hover:border-white/40 hover:bg-white/5 transition-colors"
              style={{ animationDelay: '80ms' }}
            >
              Accedi
            </Link>
          </div>

          <div className="py-20 sm:py-28 max-w-2xl mx-auto text-center">
            <h1 className="animate-fade-up text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.05]" style={{ animationDelay: '120ms' }}>
              Il tuo business,<br />
              <span className="text-zest-lime">ordinato.</span>
            </h1>
            <p className="animate-fade-up mt-6 text-lg text-white/60 leading-relaxed max-w-xl mx-auto" style={{ animationDelay: '220ms' }}>
              Flowest è la piattaforma che semplifica la gestione quotidiana di ristoranti,
              studi sanitari e siti web: prenotazioni, clienti, staff e comunicazione in un unico posto.
            </p>
          </div>
        </div>
      </section>

      {/* Prodotti */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-ink-navy tracking-tight text-center">
          Un prodotto dedicato per ogni attività.
        </h2>

        <div ref={cardsRef} className="mt-10 grid md:grid-cols-3 gap-5">
          {VERTICALI.map((v, i) => {
            const inner = (
              <div
                className={`h-full bg-ink-navy rounded-2xl p-7 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-electric-blue/20 ${cardsVisible ? 'animate-fade-up' : 'opacity-0'}`}
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <Logo size={22} dark product={v.product} />
                <h3 className="mt-6 text-2xl font-extrabold text-white tracking-tight leading-tight">
                  {v.title}<br /><span className="text-zest-lime">{v.titleAccent}</span>
                </h3>
                <p className="mt-4 text-sm text-white/55 leading-relaxed flex-1">{v.description}</p>

                {v.live ? (
                  <button
                    onClick={scegliFood}
                    className="mt-6 inline-flex items-center justify-center gap-2 bg-zest-lime text-ink-navy font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-zest-lime/90 transition-colors w-fit"
                  >
                    Inizia gratis
                    <span className="w-4 h-4"><IconArrowRight /></span>
                  </button>
                ) : (
                  <span className="animate-pulse-soft mt-6 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-zest-lime/80 border border-zest-lime/25 rounded-lg px-3 py-1.5 w-fit">
                    In arrivo
                  </span>
                )}
              </div>
            )

            return v.live ? (
              <div key={v.id}>{inner}</div>
            ) : (
              <Link key={v.id} href={v.href!}>{inner}</Link>
            )
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-navy/10">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <span className="font-mono text-xs text-ink-navy/40">FLOWEST © 2026</span>
          <span className="font-mono text-xs text-ink-navy/40">flowest.it</span>
        </div>
      </footer>
    </main>
  )
}

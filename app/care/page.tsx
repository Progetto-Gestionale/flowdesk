'use client'

import Link from 'next/link'
import Logo from '../components/Logo'
import {
  IconArrowRight, IconStethoscope, IconCalendar, IconClipboard, IconClock, IconUsers, IconChartBar,
} from '../components/icons'

const FEATURES = [
  { Icon: IconStethoscope, title: 'Cartella paziente', description: 'Anagrafica, storico sedute e documenti sempre a portata di mano.' },
  { Icon: IconCalendar, title: 'Calendario', description: 'Orari standard e giornate personalizzate, tutto in un colpo d\'occhio.' },
  { Icon: IconClipboard, title: 'Prenotazione online', description: 'I pazienti prenotano da soli, tu ricevi tutto già organizzato.' },
  { Icon: IconClock, title: 'Sedute', description: 'Definisci i tuoi servizi con prezzo e durata in pochi click.' },
  { Icon: IconUsers, title: 'Staff', description: 'Gestisci il tuo team dello studio in un unico posto.' },
  { Icon: IconChartBar, title: 'Analytics', description: 'Pazienti, sedute e andamento dello studio sempre sotto controllo.' },
]

export default function CareLandingPage() {
  function scegliCare() {
    document.cookie = `verticale_pending=care; path=/; max-age=600`
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
            <Link href="/"><Logo size={32} dark /></Link>
            <Link
              href="/sign-in"
              className="text-sm font-semibold text-white border border-white/20 px-4 py-2 rounded-lg hover:border-white/40 hover:bg-white/5 transition-colors"
            >
              Accedi
            </Link>
          </div>

          <div className="py-20 sm:py-28 max-w-2xl mx-auto text-center">
            <div className="flex justify-center">
              <Logo size={26} dark product="care" withWordmark />
            </div>
            <h1 className="animate-fade-up mt-6 text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.05]" style={{ animationDelay: '80ms' }}>
              Lo studio,<br />
              <span className="text-zest-lime">più sano.</span>
            </h1>
            <p className="animate-fade-up mt-6 text-lg text-white/60 leading-relaxed max-w-xl mx-auto" style={{ animationDelay: '160ms' }}>
              Pazienti, calendario e prenotazioni online per professionisti sanitari.
              Il paziente prenota da solo, tu ricevi tutto già organizzato.
            </p>
            <button
              onClick={scegliCare}
              className="animate-fade-up mt-8 inline-flex items-center gap-2 bg-zest-lime text-ink-navy font-bold text-sm px-6 py-3 rounded-lg hover:bg-zest-lime/90 transition-colors"
              style={{ animationDelay: '240ms' }}
            >
              Inizia gratis
              <span className="w-4 h-4"><IconArrowRight /></span>
            </button>
          </div>
        </div>
      </section>

      {/* Funzionalità */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-ink-navy tracking-tight text-center">
          Tutto quello che serve al tuo studio.
        </h2>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white rounded-2xl border border-ink-navy/8 p-6 hover:border-electric-blue hover:shadow-lg transition-all">
              <div className="w-10 h-10 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-2.5">
                <f.Icon />
              </div>
              <h3 className="mt-4 font-bold text-ink-navy">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-navy/55 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 bg-ink-navy rounded-2xl p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div>
            <h3 className="text-xl font-extrabold text-white">Pronto a mettere in ordine il tuo studio?</h3>
            <p className="text-white/55 text-sm mt-1">Gratis per iniziare, nessuna carta richiesta.</p>
          </div>
          <button
            onClick={scegliCare}
            className="inline-flex items-center gap-2 bg-zest-lime text-ink-navy font-bold text-sm px-6 py-3 rounded-lg hover:bg-zest-lime/90 transition-colors shrink-0"
          >
            Inizia gratis
            <span className="w-4 h-4"><IconArrowRight /></span>
          </button>
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

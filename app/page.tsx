'use client'
import { useAuth } from '@clerk/nextjs'
import ChatWidget from './components/ChatWidget'

function NavbarAuth() {
  const { isSignedIn } = useAuth()
  
  if (isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <a href="/dashboard" className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Dashboard
        </a>
      </div>
    )
  }
  
  return (
    <div className="flex items-center gap-3">
      <a href="/sign-in" className="px-4 py-2 text-sm font-semibold border border-gray-200 rounded-lg hover:bg-gray-50">
        Accedi
      </a>
      <a href="/sign-up" className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Inizia gratis
      </a>
    </div>
  )
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white">

      {/* NAVBAR */}
      <nav className="flex items-center justify-between px-10 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2 font-bold text-lg">
          ⚡ Flow<span className="text-blue-600">Desk</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-500">
          <a href="#funzionalita" className="hover:text-gray-900">Funzionalità</a>
          <a href="#prezzi" className="hover:text-gray-900">Prezzi</a>
          <a href="#faq" className="hover:text-gray-900">FAQ</a>
        </div>
        <NavbarAuth />
      </nav>

      {/* HERO */}
      <section className="bg-gradient-to-br from-gray-900 via-blue-900 to-indigo-900 text-white text-center px-10 py-24">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1 text-sm text-blue-200 mb-6">
          ✨ Powered by Claude AI · Made in Italy
        </div>
        <h1 className="text-5xl font-extrabold leading-tight mb-5 max-w-2xl mx-auto">
          Il tuo business gestisce{" "}
          <span className="text-blue-400">se stesso.</span>
          <br />Tu pensi a crescere.
        </h1>
        <p className="text-lg text-white/60 max-w-lg mx-auto mb-8">
          FlowDesk è la piattaforma AI per freelancer e PMI italiane che
          automatizza marketing, lead e clienti in un unico posto.
        </p>
        <div className="flex gap-3 justify-center mb-4">
          <button className="px-7 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-base">
            Inizia gratis — 30 giorni
          </button>
          <button className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-base border border-white/20">
            ▶ Guarda la demo
          </button>
        </div>
        <p className="text-xs text-white/30">
          Nessuna carta di credito · Setup in 5 minuti · Cancella quando vuoi
        </p>
      </section>

      {/* LOGHI */}
      <section className="py-6 border-b border-gray-100 text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-4">
          Si integra con gli strumenti che già usi
        </p>
        <div className="flex justify-center gap-10 text-gray-300 font-semibold text-sm">
          <span>📷 Instagram</span>
          <span>👤 Facebook</span>
          <span>💬 WhatsApp</span>
          <span>🔍 Google</span>
          <span>💳 Stripe</span>
        </div>
      </section>

      {/* PROBLEMA */}
      <section className="bg-gray-50 py-20 px-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Il problema</p>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
          Gestire un business oggi<br />è diventato un secondo lavoro.
        </h2>
        <p className="text-gray-500 max-w-md mx-auto mb-12">
          Tra social, messaggi, preventivi e follow-up, i professionisti italiani
          perdono in media 3 ore al giorno in task ripetitivi.
        </p>
        <div className="grid grid-cols-3 gap-5 max-w-3xl mx-auto">
          {[
            { emoji: "⏰", title: "Rispondi manualmente a tutto", desc: "WhatsApp, DM Instagram, email — ogni messaggio richiede la tua attenzione personale." },
            { emoji: "📉", title: "Non sai cosa funziona", desc: "Pubblichi sui social ma non hai idea di quale contenuto porta clienti reali." },
            { emoji: "👻", title: "Perdi lead per strada", desc: "Un cliente interessato non riceve risposta in tempo e va dalla concorrenza." },
          ].map((item) => (
            <div key={item.title} className="bg-white border border-gray-100 rounded-2xl p-6 text-left">
              <div className="text-3xl mb-3">{item.emoji}</div>
              <h4 className="font-bold text-gray-900 mb-2">{item.title}</h4>
              <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MODULI */}
      <section id="funzionalita" className="bg-white py-20 px-10">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 text-center mb-3">La soluzione</p>
        <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-3">
          Due moduli. Un&apos;unica piattaforma. Zero caos.
        </h2>
        <p className="text-gray-500 text-center mb-12">Scegli solo quello che ti serve, o prendi tutto a prezzo scontato.</p>
        <div className="grid grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-7">
            <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">Modulo 1</span>
            <h3 className="text-xl font-bold text-blue-900 mt-4 mb-3">Marketing Intelligence</h3>
            <p className="text-blue-700 text-sm mb-5 leading-relaxed">Analizza tutti i tuoi social, calcola il ROI reale e genera contenuti personalizzati per ogni piattaforma.</p>
            <ul className="space-y-2 text-sm text-blue-800">
              {["Analytics Instagram, Facebook, Google", "ROI automatico per campagna", "Content repurposing AI", "Piano editoriale settimanale", "Report mensile automatico"].map(f => (
                <li key={f} className="flex items-center gap-2">✓ {f}</li>
              ))}
            </ul>
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-7">
            <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">Modulo 2</span>
            <h3 className="text-xl font-bold text-purple-900 mt-4 mb-3">Lead & Client Hub</h3>
            <p className="text-purple-700 text-sm mb-5 leading-relaxed">Centralizza tutti i messaggi, gestisci i lead con una pipeline visuale e lascia che l&apos;AI segua up al momento giusto.</p>
            <ul className="space-y-2 text-sm text-purple-800">
              {["CRM con pipeline kanban", "Inbox unificata (WA + email + IG)", "Follow-up automatici AI", "Preventivi e firme digitali", "Calendario con Google sync"].map(f => (
                <li key={f} className="flex items-center gap-2">✓ {f}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* NUMERI */}
      <section className="bg-gray-900 py-16 px-10">
        <div className="grid grid-cols-4 gap-8 max-w-3xl mx-auto text-center">
          {[
            { val: "3h", label: "risparmiate al giorno in media" },
            { val: "+40%", label: "lead convertiti in clienti" },
            { val: "5 min", label: "per completare il setup" },
            { val: "100%", label: "GDPR compliant" },
          ].map(s => (
            <div key={s.label}>
              <div className="text-4xl font-extrabold text-blue-400 mb-2">{s.val}</div>
              <div className="text-sm text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PREZZI */}
      <section id="prezzi" className="bg-gray-50 py-20 px-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Prezzi</p>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Semplice. Trasparente. Senza sorprese.</h2>
        <p className="text-gray-500 mb-12">30 giorni gratis su tutti i piani. Nessuna carta richiesta.</p>
        <div className="grid grid-cols-3 gap-5 max-w-3xl mx-auto">
          {[
            { badge: "Modulo 1", badgeColor: "bg-blue-100 text-blue-700", name: "Marketing Intelligence", desc: "Per chi vuole controllare i social e capire cosa funziona.", price: "€39", features: ["Analytics multi-social", "ROI campagne", "Contenuti AI", "Report mensile"], featured: false },
            { badge: "⚡ Più scelto", badgeColor: "bg-blue-600 text-white", name: "Bundle completo", desc: "Marketing + Lead Hub. Il massimo risultato al prezzo migliore.", price: "€69", features: ["Tutto il Modulo 1", "Tutto il Modulo 2", "Report unificato AI", "Onboarding dedicato"], featured: true },
            { badge: "Modulo 2", badgeColor: "bg-purple-100 text-purple-700", name: "Lead & Client Hub", desc: "Per chi vuole smettere di perdere lead e automatizzare.", price: "€49", features: ["CRM + pipeline", "Inbox unificata", "Follow-up AI", "Preventivi digitali"], featured: false },
          ].map(p => (
            <div key={p.name} className={`bg-white rounded-2xl p-6 text-left ${p.featured ? "border-2 border-blue-600" : "border border-gray-100"}`}>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${p.badgeColor}`}>{p.badge}</span>
              <h3 className="font-bold text-gray-900 mt-4 mb-2">{p.name}</h3>
              <p className="text-xs text-gray-400 mb-4 min-h-[40px]">{p.desc}</p>
              <div className="text-3xl font-extrabold text-gray-900 mb-1">{p.price} <span className="text-sm font-normal text-gray-400">/mese</span></div>
              <p className="text-xs text-green-600 mb-5">🎁 30 giorni gratuiti</p>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
                {p.features.map(f => <li key={f} className="flex items-center gap-2">✓ {f}</li>)}
              </ul>
              <button className={`w-full py-2 rounded-xl font-bold text-sm ${p.featured ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-700"}`}>
                Inizia gratis
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-white py-20 px-10">
        <h2 className="text-2xl font-extrabold text-gray-900 text-center mb-10">Domande frequenti</h2>
        <div className="max-w-xl mx-auto space-y-4">
          {[
            { q: "I miei dati sono al sicuro?", a: "Sì. Usiamo OAuth ufficiale per tutte le connessioni. I dati sono su server europei (Germania) e siamo GDPR compliant. Non vediamo mai le tue password." },
            { q: "Ho bisogno di un account WhatsApp Business?", a: "Sì, è necessario un numero WhatsApp Business. Se non ce l'hai ti guidiamo nella procedura — richiede circa 30 minuti." },
            { q: "Posso cambiare piano in seguito?", a: "Certo. Puoi passare da un modulo al bundle in qualsiasi momento. Gli importi vengono calcolati in proporzione ai giorni rimanenti." },
            { q: "L'AI pubblica contenuti senza chiedermi?", a: "No. FlowDesk genera e suggerisce contenuti ma non pubblica mai nulla senza la tua approvazione esplicita." },
            { q: "Funziona anche per chi ha poca esperienza digitale?", a: "È stato progettato proprio per questo. L'interfaccia è semplice, l'onboarding guidato richiede 5 minuti e il supporto è incluso in tutti i piani." },
          ].map(item => (
            <details key={item.q} className="border border-gray-100 rounded-xl overflow-hidden">
              <summary className="px-5 py-4 font-semibold text-gray-900 cursor-pointer hover:bg-gray-50 list-none flex justify-between items-center">
                {item.q} <span className="text-gray-400">﹢</span>
              </summary>
              <p className="px-5 pb-4 text-sm text-gray-500 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA FINALE */}
      <section className="bg-gradient-to-br from-blue-900 to-indigo-900 text-white text-center py-20 px-10">
        <h2 className="text-3xl font-extrabold mb-4">
          Pronto a riprendere il controllo<br />del tuo business?
        </h2>
        <p className="text-white/60 mb-8">
          Unisciti ai professionisti italiani che usano FlowDesk per lavorare meno e guadagnare di più.
        </p>
        <div className="flex gap-3 justify-center">
          <button className="px-7 py-3 bg-white text-blue-700 font-bold rounded-xl">
            Inizia gratis — 30 giorni
          </button>
          <button className="px-6 py-3 border border-white/30 text-white font-semibold rounded-xl">
            Prenota una demo
          </button>
        </div>
        <p className="text-xs text-white/30 mt-4">Nessuna carta · Setup 5 minuti · Cancella quando vuoi</p>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-900 text-gray-500 text-sm flex justify-between items-center px-10 py-6">
        <span className="text-white font-bold">⚡ Flow<span className="text-blue-400">Desk</span></span>
        <span>© 2025 FlowDesk · Privacy · Termini · GDPR · Made in Italy 🇮🇹</span>
      </footer>

      <ChatWidget ownerId={process.env.NEXT_PUBLIC_OWNER_ID} />
    </main>
  )
}
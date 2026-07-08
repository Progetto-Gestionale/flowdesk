'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

const SETTORI = [
  'Ristorazione', 'Biomedica', 'Consulenza', 'E-commerce',
  'Immobiliare', 'Fitness & Wellness', 'Avvocati & Studi legali',
  'Artigianato', 'Moda & Beauty', 'Educazione & Formazione', 'Altro',
]

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const GIORNI_LABEL: Record<string, string> = {
  lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì',
  ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica',
}

const GIORNI_LUNGHI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

const SEZIONI = [
  { id: 'generale', label: '🏠 Locale' },
  { id: 'orari', label: '🕐 Orari' },
  { id: 'turni', label: '🔄 Turni' },
  { id: 'staff', label: '👥 Staff' },
  { id: 'servizi', label: '⚙️ Servizi' },
  { id: 'prenotazioni', label: '📅 Prenotazioni' },
  { id: 'menu', label: '🍽️ Menu & Offerta' },
  { id: 'pagamenti', label: '💳 Pagamenti' },
  { id: 'info', label: 'ℹ️ Info pratiche' },
  { id: 'faq', label: '❓ FAQ' },
  { id: 'bot', label: '🤖 Bot' },
  { id: 'account', label: '👤 Account' },
]

interface TurnoServizio { id: string; nome: string; oraInizio: string; oraFine: string }
interface FabbisognoFascia { giorno: number; oraInizio: string; oraFine: string; persone: number; ruolo: string; fascia: string }

const SERVIZI_LISTA = [
  { id: 'tavolo', label: 'Prenotazione tavolo', icon: '🪑' },
  { id: 'asporto', label: 'Asporto', icon: '🥡' },
  { id: 'delivery', label: 'Delivery', icon: '🛵' },
  { id: 'eventi', label: 'Eventi privati', icon: '🎉' },
  { id: 'catering', label: 'Catering', icon: '🍱' },
  { id: 'aperitivo', label: 'Aperitivo / Cocktail', icon: '🍹' },
  { id: 'brunch', label: 'Brunch', icon: '🥞' },
  { id: 'degustazione', label: 'Menu degustazione', icon: '🍷' },
]

const PAGAMENTI_LISTA = [
  { id: 'contanti', label: 'Contanti' },
  { id: 'carta', label: 'Carta di credito/debito' },
  { id: 'satispay', label: 'Satispay' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'bonifico', label: 'Bonifico bancario' },
  { id: 'buoni', label: 'Buoni pasto' },
]

type Orari = Record<string, string>
type Servizi = Record<string, boolean>
type Pagamenti = string[]
interface Regole { preavvisoMin: string; copertiMin: string; copertiMax: string; durataMedia: string; walkIn: boolean; noteAggiuntive: string }
interface Menu { tipoCucina: string; specialita: string; nonDisponibile: string; allergeniGestiti: string }
interface InfoPratiche { parcheggio: string; accessibile: boolean; animali: boolean; dresscode: string; altro: string }
interface Faq { domanda: string; risposta: string }

function jp<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

const cls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

// Stato per-sezione
type SezioneStatus = { saving: boolean; saved: boolean; dirty: boolean }
const initStatus = (): SezioneStatus => ({ saving: false, saved: false, dirty: false })

export default function Impostazioni() {
  const searchParams = useSearchParams()
  const [sezioneAttiva, setSezioneAttiva] = useState(() => searchParams.get('sezione') ?? 'generale')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Record<string, SezioneStatus>>(() =>
    Object.fromEntries(SEZIONI.map(s => [s.id, initStatus()]))
  )

  // Dati per sezione
  const [name, setName] = useState('')
  const [niche, setNiche] = useState('')
  const [nomeLocale, setNomeLocale] = useState('')
  const [indirizzo, setIndirizzo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [sitoWeb, setSitoWeb] = useState('')
  const [maxCoperti, setMaxCoperti] = useState('')
  const [orari, setOrari] = useState<Orari>({})
  const [servizi, setServizi] = useState<Servizi>({})
  const [regole, setRegole] = useState<Regole>({ preavvisoMin: '', copertiMin: '', copertiMax: '', durataMedia: '', walkIn: true, noteAggiuntive: '' })
  const [menu, setMenu] = useState<Menu>({ tipoCucina: '', specialita: '', nonDisponibile: '', allergeniGestiti: '' })
  const [pagamenti, setPagamenti] = useState<Pagamenti>([])
  const [info, setInfo] = useState<InfoPratiche>({ parcheggio: '', accessibile: false, animali: false, dresscode: '', altro: '' })
  const [faq, setFaq] = useState<Faq[]>([])
  const [descrizioneBot, setDescrizioneBot] = useState('')
  const [publicId, setPublicId] = useState('')
  const [turniServizio, setTurniServizio] = useState<TurnoServizio[]>([])
  const [fabbisogno, setFabbisogno] = useState<FabbisognoFascia[]>([])

  // Marca la sezione come dirty quando l'utente modifica qualcosa
  const dirty = useCallback((id: string) => {
    setStatus(prev => ({ ...prev, [id]: { ...prev[id], dirty: true, saved: false } }))
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/profile', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/settings', { credentials: 'include' }).then(r => r.json()),
    ]).then(([profile, s]) => {
      if (profile.user) { setName(profile.user.name ?? ''); setNiche(profile.user.niche ?? '') }
      setNomeLocale(s.nomeLocale ?? '')
      setIndirizzo(s.indirizzo ?? '')
      setTelefono(s.telefono ?? '')
      setSitoWeb(s.sitoWeb ?? '')
      setMaxCoperti(s.maxCoperti?.toString() ?? '')
      setOrari(jp(s.orariApertura, {}))
      setServizi(jp(s.serviziOfferti, {}))
      setRegole(jp(s.regolePrenotazione, { preavvisoMin: '', copertiMin: '', copertiMax: '', durataMedia: '', walkIn: true, noteAggiuntive: '' }))
      setMenu(jp(s.menuOfferta, { tipoCucina: '', specialita: '', nonDisponibile: '', allergeniGestiti: '' }))
      setPagamenti(jp(s.pagamenti, []))
      setInfo(jp(s.infoPratiche, { parcheggio: '', accessibile: false, animali: false, dresscode: '', altro: '' }))
      setFaq(jp(s.faq, []))
      setDescrizioneBot(s.descrizioneBot ?? '')
      setPublicId(s.publicId ?? '')
      const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
      const ts: TurnoServizio[] = jp(s.turniServizio, [])
      ts.sort((a, b) => toMin(a.oraInizio) - toMin(b.oraInizio))
      setTurniServizio(ts)
      setFabbisogno(jp(s.fabbisognoStaff, []))
      // Marca come salvato solo le sezioni che hanno dati nel DB
      setStatus(prev => ({
        ...prev,
        generale: { saving: false, saved: !!(s.nomeLocale), dirty: false },
        orari: { saving: false, saved: !!s.orariApertura, dirty: false },
        servizi: { saving: false, saved: !!s.serviziOfferti, dirty: false },
        prenotazioni: { saving: false, saved: !!s.regolePrenotazione, dirty: false },
        menu: { saving: false, saved: !!s.menuOfferta, dirty: false },
        pagamenti: { saving: false, saved: !!s.pagamenti, dirty: false },
        info: { saving: false, saved: !!s.infoPratiche, dirty: false },
        faq: { saving: false, saved: !!s.faq, dirty: false },
        turni: { saving: false, saved: !!s.turniServizio, dirty: false },
        staff: { saving: false, saved: !!s.fabbisognoStaff, dirty: false },
        bot: { saving: false, saved: !!s.descrizioneBot, dirty: false },
        account: { saving: false, saved: !!(profile.user?.name), dirty: false },
      }))
    }).finally(() => setLoading(false))
  }, [])

  async function saveSezione(id: string, payload: Record<string, unknown>) {
    setStatus(prev => ({ ...prev, [id]: { ...prev[id], saving: true } }))
    try {
      const res = await fetch(id === 'account' ? '/api/profile' : '/api/settings', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id === 'account' ? { name, niche } : payload),
      })
      const json = await res.json()
      if (!res.ok) { console.error('[saveSezione]', res.status, json); throw new Error(json.error || `Errore ${res.status}`) }
      setStatus(prev => ({ ...prev, [id]: { saving: false, saved: true, dirty: false } }))
    } catch (e) {
      console.error('[saveSezione] catch:', e)
      setStatus(prev => ({ ...prev, [id]: { saving: false, saved: false, dirty: true } }))
    }
  }

  const widgetUrl = publicId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/chat/${publicId}` : null

  if (loading) return <div className="text-gray-400 text-sm p-6">Caricamento...</div>

  const st = (id: string) => status[id] ?? initStatus()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Impostazioni</h1>
        <p className="text-gray-500 mt-0.5">Più informazioni fornisci, più il bot sarà preciso con i tuoi clienti.</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 shrink-0">
          <nav className="space-y-0.5 sticky top-4">
            {SEZIONI.map(s => {
              const sst = st(s.id)
              return (
                <button key={s.id} onClick={() => setSezioneAttiva(s.id)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors font-medium flex items-center justify-between ${sezioneAttiva === s.id ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <span>{s.label}</span>
                  {sst.saved && !sst.dirty && <span className={`text-[10px] font-bold ${sezioneAttiva === s.id ? 'text-indigo-200' : 'text-green-500'}`}>✓</span>}
                  {sst.dirty && <span className={`w-1.5 h-1.5 rounded-full ${sezioneAttiva === s.id ? 'bg-indigo-200' : 'bg-amber-400'}`} />}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Contenuto */}
        <div className="flex-1 min-w-0">

          {sezioneAttiva === 'generale' && (
            <Section title="Il locale" subtitle="Informazioni di base che il bot usa per presentarsi ai clienti."
              onSave={() => saveSezione('generale', { nomeLocale, indirizzo, telefono, sitoWeb, maxCoperti: maxCoperti && !isNaN(parseInt(maxCoperti)) ? parseInt(maxCoperti) : null })}
              status={st('generale')}>
              <Field label="Nome del locale *">
                <input type="text" value={nomeLocale} onChange={e => { setNomeLocale(e.target.value); dirty('generale') }}
                  placeholder="Ristorante Da Mario" className={cls} />
              </Field>
              <Field label="Indirizzo">
                <input type="text" value={indirizzo} onChange={e => { setIndirizzo(e.target.value); dirty('generale') }}
                  placeholder="Via Roma 12, 00100 Roma" className={cls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefono">
                  <input type="tel" value={telefono} onChange={e => { setTelefono(e.target.value); dirty('generale') }}
                    placeholder="+39 06 1234567" className={cls} />
                </Field>
                <Field label="Sito web">
                  <input type="url" value={sitoWeb} onChange={e => { setSitoWeb(e.target.value); dirty('generale') }}
                    placeholder="https://ristorante.it" className={cls} />
                </Field>
              </div>
              <Field label="Capienza massima (coperti totali)">
                <input type="number" value={maxCoperti} onChange={e => { setMaxCoperti(e.target.value); dirty('generale') }}
                  placeholder="60" className={`${cls} max-w-32`} />
              </Field>
            </Section>
          )}

          {sezioneAttiva === 'orari' && (
            <Section title="Orari di apertura" subtitle="Indica gli orari per ogni giorno. Puoi specificare pranzo e cena separati da virgola."
              onSave={() => saveSezione('orari', { orariApertura: JSON.stringify(orari) })}
              status={st('orari')}>
              <div className="space-y-2">
                {GIORNI.map(g => (
                  <div key={g} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-24 shrink-0">{GIORNI_LABEL[g]}</span>
                    <input type="text" value={orari[g] ?? ''} onChange={e => { setOrari(prev => ({ ...prev, [g]: e.target.value })); dirty('orari') }}
                      placeholder='12:00-15:00, 19:00-23:00' className={cls} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">Lascia vuoto se chiuso quel giorno</p>
            </Section>
          )}

          {sezioneAttiva === 'turni' && (
            <Section title="Turni di servizio" subtitle="Definisci i turni della giornata. Verranno usati nella mappa tavoli per filtrare le prenotazioni per fascia oraria."
              onSave={() => saveSezione('turni', { turniServizio: JSON.stringify(turniServizio) })}
              status={st('turni')}>
              <div className="space-y-3">
                {turniServizio.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-3">Nessun turno configurato. Aggiungine uno.</p>
                )}
                {turniServizio.map((t, i) => (
                  <div key={t.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Turno {i + 1}</span>
                      <button onClick={() => { setTurniServizio(prev => prev.filter((_, j) => j !== i)); dirty('turni') }}
                        className="text-xs text-red-400 hover:text-red-600 font-medium">Rimuovi</button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nome turno</label>
                        <input type="text" value={t.nome}
                          onChange={e => { setTurniServizio(prev => prev.map((x, j) => j === i ? { ...x, nome: e.target.value } : x)); dirty('turni') }}
                          placeholder="es. Pranzo" className={cls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Inizio</label>
                        <input type="time" value={t.oraInizio}
                          onChange={e => { setTurniServizio(prev => prev.map((x, j) => j === i ? { ...x, oraInizio: e.target.value } : x)); dirty('turni') }}
                          className={cls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Fine</label>
                        <input type="time" value={t.oraFine}
                          onChange={e => { setTurniServizio(prev => prev.map((x, j) => j === i ? { ...x, oraFine: e.target.value } : x)); dirty('turni') }}
                          className={cls} />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => {
                  setTurniServizio(prev => [...prev, { id: crypto.randomUUID(), nome: '', oraInizio: '12:00', oraFine: '15:00' }])
                  dirty('turni')
                }} className="w-full text-sm text-indigo-600 font-semibold border-2 border-dashed border-indigo-200 rounded-xl py-3 hover:bg-indigo-50 transition-colors">
                  + Aggiungi turno
                </button>
                {turniServizio.length > 0 && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-xs text-indigo-700 space-y-1">
                    <p className="font-semibold">Turni configurati:</p>
                    {turniServizio.map(t => (
                      <p key={t.id}>{t.nome || '(senza nome)'} — {t.oraInizio}–{t.oraFine}</p>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {sezioneAttiva === 'staff' && (
            <Section title="Fabbisogno staff settimanale" subtitle="Definisci quante persone ti servono, con quale ruolo e in quali orari per ogni giorno della settimana. Queste impostazioni vengono usate dall'AI per generare i turni."
              onSave={() => saveSezione('staff', { fabbisognoStaff: JSON.stringify(fabbisogno) })}
              status={st('staff')}>
              <div className="space-y-3">
                {fabbisogno.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-3">Nessuna fascia configurata. Aggiungi le tue esigenze di personale.</p>
                )}
                {fabbisogno.length > 0 && (
                  <div className="grid grid-cols-[130px_80px_80px_60px_1fr_auto] gap-2 px-1 mb-1">
                    {['Giorno', 'Dalle', 'Alle', 'N°', 'Ruolo', ''].map((h, i) => (
                      <span key={i} className="text-xs font-semibold text-gray-400 uppercase">{h}</span>
                    ))}
                  </div>
                )}
                {fabbisogno.map((r, i) => (
                  <div key={i} className="grid grid-cols-[130px_80px_80px_60px_1fr_auto] gap-2 items-center bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                    <select value={r.giorno}
                      onChange={e => { setFabbisogno(f => f.map((x, idx) => idx === i ? { ...x, giorno: Number(e.target.value) } : x)); dirty('staff') }}
                      className={cls}>
                      {GIORNI_LUNGHI.map((g, idx) => <option key={idx} value={idx}>{g}</option>)}
                    </select>
                    <input type="time" value={r.oraInizio}
                      onChange={e => { setFabbisogno(f => f.map((x, idx) => idx === i ? { ...x, oraInizio: e.target.value } : x)); dirty('staff') }}
                      className={cls} />
                    <input type="time" value={r.oraFine}
                      onChange={e => { setFabbisogno(f => f.map((x, idx) => idx === i ? { ...x, oraFine: e.target.value } : x)); dirty('staff') }}
                      className={cls} />
                    <input type="number" min={1} max={20} value={r.persone}
                      onChange={e => { setFabbisogno(f => f.map((x, idx) => idx === i ? { ...x, persone: Number(e.target.value) } : x)); dirty('staff') }}
                      className={cls} />
                    <input placeholder="es. cameriere, chef..." value={r.ruolo}
                      onChange={e => { setFabbisogno(f => f.map((x, idx) => idx === i ? { ...x, ruolo: e.target.value } : x)); dirty('staff') }}
                      className={cls} />
                    <button onClick={() => { setFabbisogno(f => f.filter((_, idx) => idx !== i)); dirty('staff') }}
                      className="text-gray-300 hover:text-red-500 font-bold text-sm transition-colors px-1">✕</button>
                  </div>
                ))}
                <button onClick={() => { setFabbisogno(f => [...f, { giorno: 0, fascia: 'libera', oraInizio: '09:00', oraFine: '17:00', persone: 1, ruolo: '' }]); dirty('staff') }}
                  className="w-full text-sm text-indigo-600 font-semibold border-2 border-dashed border-indigo-200 rounded-xl py-3 hover:bg-indigo-50 transition-colors">
                  + Aggiungi fascia
                </button>
                {fabbisogno.length > 0 && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-xs text-indigo-700 space-y-1">
                    <p className="font-semibold mb-1">Riepilogo:</p>
                    {[0,1,2,3,4,5,6].map(g => {
                      const fasce = fabbisogno.filter(r => r.giorno === g)
                      if (fasce.length === 0) return null
                      return (
                        <p key={g}><span className="font-medium">{GIORNI_BREVI[g]}:</span> {fasce.map(r => `${r.oraInizio}–${r.oraFine} · ${r.persone}p${r.ruolo ? ` (${r.ruolo})` : ''}`).join(' / ')}</p>
                      )
                    })}
                  </div>
                )}
              </div>
            </Section>
          )}

          {sezioneAttiva === 'servizi' && (
            <Section title="Servizi disponibili" subtitle="Attiva solo i servizi che offri. Il bot saprà cosa proporre e cosa escludere."
              onSave={() => saveSezione('servizi', { serviziOfferti: JSON.stringify(servizi) })}
              status={st('servizi')}>
              <div className="grid grid-cols-2 gap-3">
                {SERVIZI_LISTA.map(s => (
                  <button key={s.id} onClick={() => { setServizi(prev => ({ ...prev, [s.id]: !prev[s.id] })); dirty('servizi') }}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${servizi[s.id] ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <span className="text-2xl">{s.icon}</span>
                    <div>
                      <p className={`text-sm font-semibold ${servizi[s.id] ? 'text-indigo-700' : 'text-gray-700'}`}>{s.label}</p>
                      <p className={`text-xs ${servizi[s.id] ? 'text-indigo-500' : 'text-gray-400'}`}>{servizi[s.id] ? 'Attivo' : 'Non disponibile'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {sezioneAttiva === 'prenotazioni' && (
            <Section title="Regole prenotazioni" subtitle="Il bot userà queste regole per gestire le richieste in modo corretto."
              onSave={() => saveSezione('prenotazioni', { regolePrenotazione: JSON.stringify(regole) })}
              status={st('prenotazioni')}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Preavviso minimo">
                  <input type="text" value={regole.preavvisoMin} onChange={e => { setRegole(r => ({ ...r, preavvisoMin: e.target.value })); dirty('prenotazioni') }}
                    placeholder="es. 2 ore, 1 giorno" className={cls} />
                </Field>
                <Field label="Durata media tavola">
                  <input type="text" value={regole.durataMedia} onChange={e => { setRegole(r => ({ ...r, durataMedia: e.target.value })); dirty('prenotazioni') }}
                    placeholder="es. 90 minuti" className={cls} />
                </Field>
                <Field label="Coperti minimi">
                  <input type="number" value={regole.copertiMin} onChange={e => { setRegole(r => ({ ...r, copertiMin: e.target.value })); dirty('prenotazioni') }}
                    placeholder="1" className={cls} />
                </Field>
                <Field label="Coperti massimi">
                  <input type="number" value={regole.copertiMax} onChange={e => { setRegole(r => ({ ...r, copertiMax: e.target.value })); dirty('prenotazioni') }}
                    placeholder="10" className={cls} />
                </Field>
              </div>
              <Toggle label="Accettate walk-in (senza prenotazione)" checked={regole.walkIn}
                onChange={v => { setRegole(r => ({ ...r, walkIn: v })); dirty('prenotazioni') }} />
              <Field label="Note aggiuntive per il bot">
                <textarea value={regole.noteAggiuntive} onChange={e => { setRegole(r => ({ ...r, noteAggiuntive: e.target.value })); dirty('prenotazioni') }}
                  rows={3} placeholder="es. Per gruppi superiori a 8 persone è richiesto un menu fisso." className={`${cls} resize-none`} />
              </Field>
            </Section>
          )}

          {sezioneAttiva === 'menu' && (
            <Section title="Menu & Offerta" subtitle="Descrivi cosa offri. Il bot potrà rispondere a domande su cucina, piatti e limitazioni."
              onSave={() => saveSezione('menu', { menuOfferta: JSON.stringify(menu) })}
              status={st('menu')}>
              <Field label="Tipo di cucina">
                <input type="text" value={menu.tipoCucina} onChange={e => { setMenu(m => ({ ...m, tipoCucina: e.target.value })); dirty('menu') }}
                  placeholder="es. Cucina romana tradizionale, pizza napoletana" className={cls} />
              </Field>
              <Field label="Specialità e piatti forti">
                <textarea value={menu.specialita} onChange={e => { setMenu(m => ({ ...m, specialita: e.target.value })); dirty('menu') }}
                  rows={3} placeholder="es. Cacio e pepe fatta in casa, carbonara, tiramisù artigianale" className={`${cls} resize-none`} />
              </Field>
              <Field label="Cosa NON è disponibile / limitazioni">
                <textarea value={menu.nonDisponibile} onChange={e => { setMenu(m => ({ ...m, nonDisponibile: e.target.value })); dirty('menu') }}
                  rows={3} placeholder="es. Non facciamo pizza, non abbiamo menu vegetariano completo" className={`${cls} resize-none`} />
              </Field>
              <Field label="Allergeni e diete gestite">
                <textarea value={menu.allergeniGestiti} onChange={e => { setMenu(m => ({ ...m, allergeniGestiti: e.target.value })); dirty('menu') }}
                  rows={2} placeholder="es. Opzioni vegane disponibili, non gestiamo allergie ai crostacei" className={`${cls} resize-none`} />
              </Field>
            </Section>
          )}

          {sezioneAttiva === 'pagamenti' && (
            <Section title="Metodi di pagamento" subtitle="Il bot informerà i clienti su come possono pagare."
              onSave={() => saveSezione('pagamenti', { pagamenti: JSON.stringify(pagamenti) })}
              status={st('pagamenti')}>
              <div className="grid grid-cols-2 gap-3">
                {PAGAMENTI_LISTA.map(p => (
                  <button key={p.id} onClick={() => { setPagamenti(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]); dirty('pagamenti') }}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${pagamenti.includes(p.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${pagamenti.includes(p.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                      {pagamenti.includes(p.id) && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>
                    <span className={`text-sm font-medium ${pagamenti.includes(p.id) ? 'text-indigo-700' : 'text-gray-700'}`}>{p.label}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {sezioneAttiva === 'info' && (
            <Section title="Info pratiche" subtitle="Dettagli logistici che i clienti chiedono spesso."
              onSave={() => saveSezione('info', { infoPratiche: JSON.stringify(info) })}
              status={st('info')}>
              <Field label="Parcheggio">
                <input type="text" value={info.parcheggio} onChange={e => { setInfo(i => ({ ...i, parcheggio: e.target.value })); dirty('info') }}
                  placeholder="es. Parcheggio gratuito sul retro, zona ZTL" className={cls} />
              </Field>
              <Toggle label="Accessibile a persone con disabilità" checked={info.accessibile}
                onChange={v => { setInfo(i => ({ ...i, accessibile: v })); dirty('info') }} />
              <Toggle label="Animali ammessi" checked={info.animali}
                onChange={v => { setInfo(i => ({ ...i, animali: v })); dirty('info') }} />
              <Field label="Dress code">
                <input type="text" value={info.dresscode} onChange={e => { setInfo(i => ({ ...i, dresscode: e.target.value })); dirty('info') }}
                  placeholder="es. Smart casual, nessun dress code" className={cls} />
              </Field>
              <Field label="Altre informazioni utili">
                <textarea value={info.altro} onChange={e => { setInfo(i => ({ ...i, altro: e.target.value })); dirty('info') }}
                  rows={3} placeholder="es. Aria condizionata, terrazza esterna, musica dal vivo il venerdì" className={`${cls} resize-none`} />
              </Field>
            </Section>
          )}

          {sezioneAttiva === 'faq' && (
            <Section title="Domande frequenti" subtitle="Aggiungi le domande che i clienti ti fanno più spesso. Il bot risponderà automaticamente."
              onSave={() => saveSezione('faq', { faq: JSON.stringify(faq) })}
              status={st('faq')}>
              <div className="space-y-3">
                {faq.map((f, i) => (
                  <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Domanda {i + 1}</span>
                      <button onClick={() => { setFaq(prev => prev.filter((_, j) => j !== i)); dirty('faq') }}
                        className="text-xs text-red-400 hover:text-red-600">Rimuovi</button>
                    </div>
                    <input type="text" value={f.domanda} onChange={e => { setFaq(prev => prev.map((x, j) => j === i ? { ...x, domanda: e.target.value } : x)); dirty('faq') }}
                      placeholder="Es. Avete il menu per celiaci?" className={cls} />
                    <textarea value={f.risposta} onChange={e => { setFaq(prev => prev.map((x, j) => j === i ? { ...x, risposta: e.target.value } : x)); dirty('faq') }}
                      rows={2} placeholder="Es. Sì, abbiamo pasta e pizza senza glutine disponibili su richiesta." className={`${cls} resize-none`} />
                  </div>
                ))}
                <button onClick={() => { setFaq(prev => [...prev, { domanda: '', risposta: '' }]); dirty('faq') }}
                  className="w-full text-sm text-indigo-600 font-semibold border-2 border-dashed border-indigo-200 rounded-xl py-3 hover:bg-indigo-50 transition-colors">
                  + Aggiungi domanda
                </button>
              </div>
            </Section>
          )}

          {sezioneAttiva === 'bot' && (
            <Section title="Configurazione bot" subtitle="Istruzioni comportamentali e link pubblico del chatbot."
              onSave={() => saveSezione('bot', { descrizioneBot, publicId: publicId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || null })}
              status={st('bot')}>
              <Field label="Istruzioni personalizzate per il bot" hint="Scrivi qui le regole specifiche che il bot deve seguire: tono di voce, vincoli particolari, come gestire certi tipi di richieste, cosa dire o non dire. Queste istruzioni hanno la priorità su tutto il resto.">
                <textarea value={descrizioneBot} onChange={e => { setDescrizioneBot(e.target.value); dirty('bot') }} rows={8}
                  placeholder={"Esempi:\n- Rispondi sempre in modo formale usando 'Lei'\n- Non accettare prenotazioni per meno di 2 persone\n- Se chiedono del menu, di' che lo trovano sul sito\n- Per eventi aziendali chiedi sempre anche il numero di telefono"} className={`${cls} resize-none`} />
              </Field>
              <Field label="ID pubblico del chatbot">
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-gray-400 shrink-0">/chat/</span>
                  <input type="text" value={publicId} onChange={e => { setPublicId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); dirty('bot') }}
                    placeholder="ristorante-mario" className={cls} />
                </div>
                {widgetUrl && (
                  <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-indigo-700 font-mono truncate">{widgetUrl}</span>
                    <button onClick={() => navigator.clipboard.writeText(widgetUrl)}
                      className="text-xs text-indigo-600 font-semibold shrink-0 hover:text-indigo-800">Copia</button>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">Link pubblico del chatbot — condividilo sul sito o sui social.</p>
              </Field>
            </Section>
          )}

          {sezioneAttiva === 'account' && (
            <Section title="Profilo account" subtitle="Il tuo nome e settore di appartenenza."
              onSave={() => saveSezione('account', {})}
              status={st('account')}>
              <Field label="Il tuo nome">
                <input type="text" value={name} onChange={e => { setName(e.target.value); dirty('account') }}
                  placeholder="Mario Rossi" className={cls} />
              </Field>
              <Field label="Settore">
                <select value={niche} onChange={e => { setNiche(e.target.value); dirty('account') }} className={cls}>
                  <option value="">Seleziona settore</option>
                  {SETTORI.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>

              <div className="border-t border-gray-100 pt-4 mt-2">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Integrazioni</h3>
                <div className="space-y-3">
                  {[
                    { name: 'WhatsApp Business', icon: '💬', desc: 'Ricevi prenotazioni dai messaggi WhatsApp' },
                    { name: 'Instagram DM', icon: '📸', desc: 'Bot attivo sui DM del profilo Instagram' },
                    { name: 'Google Calendar', icon: '🗓️', desc: 'Sync automatico delle prenotazioni' },
                    { name: 'Google Business', icon: '📍', desc: 'Pulsante "Prenota" su Google Maps' },
                    { name: 'Stripe', icon: '💳', desc: 'Acconti online per eventi e catering' },
                  ].map(i => (
                    <div key={i.name} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{i.icon}</span>
                        <div>
                          <span className="text-sm font-medium text-gray-700">{i.name}</span>
                          <p className="text-xs text-gray-400">{i.desc}</p>
                        </div>
                      </div>
                      <button className="text-xs text-gray-400 font-semibold cursor-not-allowed bg-gray-100 px-3 py-1 rounded-full">Prossimamente</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 mt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Piano attivo: Trial gratuito</p>
                    <p className="text-sm text-gray-500">Accesso completo durante il periodo di prova</p>
                  </div>
                  <button className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700">Passa a Pro</button>
                </div>
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Componenti helper ──

function Section({ title, subtitle, children, onSave, status }: {
  title: string; subtitle?: string; children: React.ReactNode
  onSave: () => void; status: { saving: boolean; saved: boolean; dirty: boolean }
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={onSave} disabled={status.saving || (status.saved && !status.dirty)}
          className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors shrink-0 ml-4 ${
            status.saved && !status.dirty
              ? 'bg-green-100 text-green-700 cursor-default'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
          }`}>
          {status.saving ? 'Salvataggio...' : status.saved && !status.dirty ? '✓ Salvato' : 'Salva'}
        </button>
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <button onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

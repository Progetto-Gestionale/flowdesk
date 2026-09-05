import { prisma } from '@/lib/prisma'
import { attribuzioneCoperti } from './staff/attribuzione'

// ─────────────────────────────────────────────────────────────────────────────
// Strumenti dell'Assistente AI — SOLA LETTURA.
// Filosofia: NON uno strumento per ogni domanda. C'è UN accesso generale a tutte
// le tabelle del locale ("interroga_dati") più poche funzioni per i calcoli
// pesanti (incassi, classifica piatti, ritardi). Ogni query è SEMPRE scoped su
// userId → nessun rischio di vedere dati di altri ristoranti. Nulla scrive.
// ─────────────────────────────────────────────────────────────────────────────

// Elenco delle "entità" (tabelle) che l'assistente può leggere.
const ENTITA = [
  'ordini',
  'dipendenti',
  'turni',
  'timbrature',
  'richieste_staff',
  'prenotazioni',
  'richieste_prenotazione',
  'clienti',
  'menu_categorie',
  'menu_piatti',
  'tavoli',
  'sale',
] as const

export const copilotTools = [
  {
    name: 'interroga_dati',
    description:
      'Accesso generale ai dati del locale (sola lettura). Scegli quale tabella leggere con "entita" e, dove ha senso, un intervallo di date. Restituisce le righe grezze: sei tu a contarle, filtrarle o analizzarle per rispondere. Usalo per QUALSIASI domanda sui dati che non sia coperta dagli strumenti di calcolo (incassi, classifica piatti, ritardi). Entità disponibili: ' +
      'ordini (createdAt, tipo, stato, totale, coperti); dipendenti (nome, ruolo, email); turni (giorno, dipendente, orario); timbrature (entrate/uscite del personale); richieste_staff (ferie, assenze, permessi con tipo/date/stato); prenotazioni (prenotazioni tavolo confermate: cliente, giorno, coperti, stato); richieste_prenotazione (richieste di prenotazione in arrivo/preventivi); clienti (rubrica contatti/lead); menu_categorie; menu_piatti (nome, prezzo, disponibile, allergeni, categoria); tavoli; sale.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entita: { type: 'string', enum: ENTITA as unknown as string[], description: 'Quale tabella leggere' },
        dal: { type: 'string', description: 'Opzionale. Data inizio inclusa, YYYY-MM-DD (per le entità con una data)' },
        al: { type: 'string', description: 'Opzionale. Data fine inclusa, YYYY-MM-DD' },
        limite: { type: 'number', description: 'Quante righe al massimo (default 50, max 150). Alza solo se ti servono davvero più righe.' },
      },
      required: ['entita'],
    },
  },
  {
    name: 'incasso_periodo',
    description:
      "Incasso totale del locale in un intervallo di date, con numero di ordini e coperti, suddiviso per tipo (tavolo/asporto/delivery). Usalo per \"quanto ho incassato ieri/questa settimana/questo mese\".",
    input_schema: {
      type: 'object' as const,
      properties: {
        dal: { type: 'string', description: 'Data inizio inclusa, YYYY-MM-DD' },
        al: { type: 'string', description: 'Data fine inclusa, YYYY-MM-DD' },
      },
      required: ['dal', 'al'],
    },
  },
  {
    name: 'classifica_piatti',
    description:
      'Classifica dei piatti per quantità venduta in un intervallo di date. Usalo per "piatto più/meno venduto", "top piatti", "cosa vende di meno".',
    input_schema: {
      type: 'object' as const,
      properties: {
        dal: { type: 'string', description: 'Data inizio inclusa, YYYY-MM-DD' },
        al: { type: 'string', description: 'Data fine inclusa, YYYY-MM-DD' },
        ordine: { type: 'string', enum: ['alto', 'basso'], description: '"alto" = più venduti (default), "basso" = meno venduti' },
        limite: { type: 'number', description: 'Quanti piatti restituire (default 5)' },
      },
      required: ['dal', 'al'],
    },
  },
  {
    name: 'presenze_timbrature',
    description:
      'Presenze e RITARDI del personale in un intervallo, calcolati dalle timbrature confrontate con i turni programmati. Per dipendente: giorni di presenza, minuti di ritardo totali, giorni in ritardo. Usalo per "chi è il più ritardatario", "chi arriva tardi".',
    input_schema: {
      type: 'object' as const,
      properties: {
        dal: { type: 'string', description: 'Data inizio inclusa, YYYY-MM-DD' },
        al: { type: 'string', description: 'Data fine inclusa, YYYY-MM-DD' },
      },
      required: ['dal', 'al'],
    },
  },
  {
    name: 'coperti_per_dipendente',
    description:
      'Coperti SERVITI da ciascun dipendente in un intervallo. Attribuisce i coperti di ogni tavolo (sessione chiusa, finestra oraria reale) al personale presente in quella fascia — dalle timbrature, o dai turni pianificati se non ci sono timbri — dividendoli in parti uguali tra i presenti. Per dipendente: coperti serviti, ore lavorate, coperti per ora. Restituisce anche il totale e il rapporto coperti/ora del locale. Usalo per "quanti coperti ha servito X", "chi ha servito più coperti", "quanti coperti a testa", "sto mettendo abbastanza personale rispetto ai coperti".',
    input_schema: {
      type: 'object' as const,
      properties: {
        dal: { type: 'string', description: 'Data inizio inclusa, YYYY-MM-DD' },
        al: { type: 'string', description: 'Data fine inclusa, YYYY-MM-DD' },
      },
      required: ['dal', 'al'],
    },
  },
] as const

// ── Helper date/orari ────────────────────────────────────────────────────────
function inizioGiornoUTC(giorno: string): Date {
  const [y, m, d] = giorno.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}
function intervallo(dal: string, al: string) {
  const from = inizioGiornoUTC(dal)
  const to = inizioGiornoUTC(al)
  to.setUTCDate(to.getUTCDate() + 1)
  return { from, to }
}
const euro = (n: number) => `${n.toFixed(2)} €`
// Orari in fuso Italia (turni in ora locale, timbrature in UTC) → confronto corretto.
const dayRome = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
const oraRome = (d: Date) =>
  d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome' })
const hhmmToMin = (h: string) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + (mm || 0) }
const minToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// ── Accesso generale ai dati ─────────────────────────────────────────────────
async function interrogaDati(userId: string, entita: string, dal?: string, al?: string, limite = 50) {
  const take = Math.max(1, Math.min(150, Math.floor(limite) || 50))
  const range = dal && al ? intervallo(dal, al) : null
  const dr = (col: string) => (range ? { [col]: { gte: range.from, lt: range.to } } : {})

  switch (entita) {
    case 'ordini': {
      const r = await prisma.ordine.findMany({
        where: { userId, ...dr('createdAt') }, orderBy: { createdAt: 'desc' }, take,
        select: { createdAt: true, tipo: true, status: true, totale: true, coperti: true, tavolo: true },
      })
      return r.map((o) => ({ giorno: dayRome(o.createdAt), ora: oraRome(o.createdAt), tipo: o.tipo, stato: o.status, totale: euro(o.totale ?? 0), coperti: o.coperti ?? undefined, tavolo: o.tavolo || undefined }))
    }
    case 'dipendenti': {
      const r = await prisma.dipendente.findMany({ where: { userId }, orderBy: [{ ordine: 'asc' }, { nome: 'asc' }], take, select: { nome: true, ruolo: true, email: true } })
      return r.map((d) => ({ nome: d.nome, ruolo: d.ruolo || 'non specificato', email: d.email }))
    }
    case 'turni': {
      const r = await prisma.turno.findMany({ where: { userId, ...dr('data') }, orderBy: [{ data: 'asc' }, { oraInizio: 'asc' }], take, include: { dipendente: { select: { nome: true } } } })
      return r.map((t) => ({ giorno: dayRome(t.data), dipendente: t.dipendente?.nome ?? '—', dalle: t.oraInizio, alle: t.oraFine, ruolo: t.ruolo || undefined }))
    }
    case 'timbrature': {
      const r = await prisma.timbratura.findMany({ where: { userId, ...dr('timestamp') }, orderBy: { timestamp: 'asc' }, take, include: { dipendente: { select: { nome: true } } } })
      return r.map((t) => ({ dipendente: t.dipendente?.nome ?? '—', tipo: t.tipo, giorno: dayRome(t.timestamp), ora: oraRome(t.timestamp) }))
    }
    case 'richieste_staff': {
      const where: Record<string, unknown> = { dipendente: { userId } }
      if (range) where.data = { gte: range.from, lt: range.to }
      const r = await prisma.richiestaDipendente.findMany({ where, orderBy: { createdAt: 'desc' }, take, include: { dipendente: { select: { nome: true } } } })
      return r.map((x) => ({ dipendente: x.dipendente?.nome ?? '—', tipo: x.tipo, dal: x.data ? dayRome(x.data) : undefined, al: x.dataFine ? dayRome(x.dataFine) : undefined, stato: x.status, note: x.note || undefined }))
    }
    case 'prenotazioni': {
      const r = await prisma.appuntamento.findMany({ where: { userId, ...dr('data') }, orderBy: { data: 'asc' }, take, select: { clienteNome: true, data: true, coperti: true, status: true, note: true } })
      return r.map((a) => ({ cliente: a.clienteNome || '—', giorno: dayRome(a.data), ora: oraRome(a.data), coperti: a.coperti ?? 0, stato: a.status, note: a.note || undefined }))
    }
    case 'richieste_prenotazione': {
      const r = await prisma.preventivo.findMany({ where: { userId, ...dr('createdAt') }, orderBy: { createdAt: 'desc' }, take, select: { clienteName: true, clienteEmail: true, status: true, note: true, createdAt: true } })
      return r.map((p) => ({ cliente: p.clienteName, email: p.clienteEmail || undefined, stato: p.status, note: p.note || undefined, ricevuta_il: dayRome(p.createdAt) }))
    }
    case 'clienti': {
      const r = await prisma.lead.findMany({ where: { userId, cancellato: false }, orderBy: { createdAt: 'desc' }, take, select: { name: true, email: true, phone: true, status: true } })
      return r.map((c) => ({ nome: c.name, email: c.email || undefined, telefono: c.phone || undefined, stato: c.status }))
    }
    case 'menu_categorie': {
      const r = await prisma.menuCategoria.findMany({ where: { userId }, orderBy: [{ tipo: 'asc' }, { ordine: 'asc' }], take, select: { nome: true, tipo: true, reparto: true } })
      return r.map((c) => ({ nome: c.nome, menu: c.tipo, reparto: c.reparto || 'Cucina' }))
    }
    case 'menu_piatti': {
      const r = await prisma.menuPiatto.findMany({ where: { userId }, orderBy: [{ ordine: 'asc' }], take, select: { nome: true, prezzo: true, disponibile: true, allergeni: true, categoria: { select: { nome: true } } } })
      return r.map((p) => ({ nome: p.nome, prezzo: euro(p.prezzo), disponibile: p.disponibile, allergeni: p.allergeni, categoria: p.categoria?.nome || undefined }))
    }
    case 'tavoli': {
      const r = await prisma.tavolo.findMany({ where: { userId }, orderBy: { numero: 'asc' }, take, select: { numero: true, etichetta: true, posti: true } })
      return r.map((t) => ({ numero: t.numero, etichetta: t.etichetta || undefined, posti: t.posti }))
    }
    case 'sale': {
      const r = await prisma.sala.findMany({ where: { userId }, orderBy: { ordine: 'asc' }, take, select: { nome: true } })
      return r.map((s) => ({ nome: s.nome }))
    }
    default:
      return { errore: `Entità sconosciuta: ${entita}. Valide: ${ENTITA.join(', ')}.` }
  }
}

// ── Calcoli pesanti (aggregazioni fatte lato server) ─────────────────────────
async function incassoPeriodo(userId: string, dal: string, al: string) {
  const { from, to } = intervallo(dal, al)
  const ordini = await prisma.ordine.findMany({ where: { userId, createdAt: { gte: from, lt: to } }, select: { tipo: true, totale: true, coperti: true } })
  const perTipo: Record<string, { incasso: number; ordini: number }> = {}
  let incassoTotale = 0, copertiTotali = 0
  for (const o of ordini) {
    incassoTotale += o.totale ?? 0
    copertiTotali += o.coperti ?? 0
    const t = o.tipo || 'tavolo'
    perTipo[t] = perTipo[t] || { incasso: 0, ordini: 0 }
    perTipo[t].incasso += o.totale ?? 0
    perTipo[t].ordini += 1
  }
  return {
    periodo: `dal ${dal} al ${al}`,
    incasso_totale: euro(incassoTotale),
    numero_ordini: ordini.length,
    coperti_totali: copertiTotali,
    dettaglio_per_tipo: Object.fromEntries(Object.entries(perTipo).map(([t, v]) => [t, { incasso: euro(v.incasso), ordini: v.ordini }])),
  }
}

async function classificaPiatti(userId: string, dal: string, al: string, ordine: 'alto' | 'basso', limite: number) {
  const { from, to } = intervallo(dal, al)
  const righe = await prisma.rigaOrdine.findMany({ where: { ordine: { userId, createdAt: { gte: from, lt: to } } }, select: { nome: true, quantita: true, prezzo: true } })
  const agg = new Map<string, { quantita: number; incasso: number }>()
  for (const r of righe) {
    const cur = agg.get(r.nome) || { quantita: 0, incasso: 0 }
    cur.quantita += r.quantita
    cur.incasso += r.quantita * r.prezzo
    agg.set(r.nome, cur)
  }
  const lista = [...agg.entries()]
    .map(([nome, v]) => ({ piatto: nome, quantita: v.quantita, incasso: euro(v.incasso) }))
    .sort((a, b) => (ordine === 'basso' ? a.quantita - b.quantita : b.quantita - a.quantita))
    .slice(0, limite)
  return { periodo: `dal ${dal} al ${al}`, criterio: ordine === 'basso' ? 'meno venduti' : 'più venduti', piatti: lista, nota: lista.length === 0 ? 'Nessun piatto venduto nel periodo.' : undefined }
}

async function presenzeTimbrature(userId: string, dal: string, al: string) {
  const { from, to } = intervallo(dal, al)
  const [timbri, turni] = await Promise.all([
    prisma.timbratura.findMany({ where: { userId, timestamp: { gte: from, lt: to } }, orderBy: { timestamp: 'asc' }, select: { dipendenteId: true, tipo: true, timestamp: true, dipendente: { select: { nome: true } } } }),
    prisma.turno.findMany({ where: { userId, data: { gte: from, lt: to } }, select: { dipendenteId: true, data: true, oraInizio: true } }),
  ])
  const startMap = new Map<string, number>()
  for (const t of turni) {
    const key = `${t.dipendenteId}|${dayRome(t.data)}`
    const m = hhmmToMin(t.oraInizio)
    if (!startMap.has(key) || m < startMap.get(key)!) startMap.set(key, m)
  }
  const primaEntrata = new Map<string, { d: Date; nome: string }>()
  for (const t of timbri) {
    if (t.tipo !== 'entrata') continue
    const key = `${t.dipendenteId}|${dayRome(t.timestamp)}`
    if (!primaEntrata.has(key)) primaEntrata.set(key, { d: t.timestamp, nome: t.dipendente?.nome ?? '—' })
  }
  type Rec = { nome: string; giorni: Set<string>; ritardoTot: number; giorniRitardo: number; dettaglio: { data: string; entrata: string; turno_inizio: string; ritardo_min: number }[] }
  const perDip = new Map<string, Rec>()
  for (const [key, { d, nome }] of primaEntrata) {
    const [dipId, day] = key.split('|')
    if (!perDip.has(dipId)) perDip.set(dipId, { nome, giorni: new Set(), ritardoTot: 0, giorniRitardo: 0, dettaglio: [] })
    const rec = perDip.get(dipId)!
    rec.giorni.add(day)
    const startM = startMap.get(key)
    const entrataStr = oraRome(d)
    if (startM != null) {
      const ritardo = hhmmToMin(entrataStr) - startM
      if (ritardo > 0) { rec.ritardoTot += ritardo; rec.giorniRitardo += 1; rec.dettaglio.push({ data: day, entrata: entrataStr, turno_inizio: minToHHMM(startM), ritardo_min: ritardo }) }
    }
  }
  const dipendenti = [...perDip.values()]
    .map((r) => ({ nome: r.nome, giorni_di_presenza: r.giorni.size, giorni_in_ritardo: r.giorniRitardo, ritardo_totale_minuti: r.ritardoTot, dettaglio_ritardi: r.dettaglio.slice(0, 10) }))
    .sort((a, b) => b.ritardo_totale_minuti - a.ritardo_totale_minuti)
  return {
    periodo: `dal ${dal} al ${al}`,
    dipendenti,
    nota: timbri.length === 0 ? 'Nessuna timbratura nel periodo.' : turni.length === 0 ? 'Ci sono timbrature ma nessun turno programmato: senza gli orari previsti non posso calcolare i ritardi.' : undefined,
  }
}

// Coperti serviti per dipendente: stesso motore della insight card "Organico"
// (attribuzione dei coperti al personale presente). Numeri esatti, non stime.
async function copertiPerDipendente(userId: string, dal: string, al: string) {
  const { from, to } = intervallo(dal, al)
  const attr = await attribuzioneCoperti(userId, from, to)
  return {
    periodo: `dal ${dal} al ${al}`,
    fonte_presenza: attr.fonte === 'cartellino' ? 'timbrature' : 'turni pianificati',
    coperti_totali: attr.totaleCoperti,
    ore_uomo_totali: attr.totaleOreLavorate,
    coperti_per_ora_locale: attr.copertiPerOraLocale,
    coperti_non_attribuiti: attr.copertiNonAttribuiti || undefined,
    dipendenti: attr.perDipendente.map((d) => ({
      nome: d.nome,
      ruolo: d.ruolo || undefined,
      coperti_serviti: d.copertiServiti,
      ore_lavorate: d.oreLavorate,
      coperti_per_ora: d.copertiPerOra,
    })),
    nota: attr.totaleCoperti === 0 ? 'Nessun coperto servito (nessun tavolo chiuso) nel periodo.' : undefined,
  }
}

// ── Dispatcher: esegue lo strumento richiesto. Sempre scoped su userId. ───────
export async function eseguiCopilotTool(name: string, input: Record<string, unknown>, userId: string): Promise<unknown> {
  try {
    if (name === 'interroga_dati') {
      return await interrogaDati(userId, String(input.entita), input.dal ? String(input.dal) : undefined, input.al ? String(input.al) : undefined, Number(input.limite) || 50)
    }
    if (name === 'incasso_periodo') {
      return await incassoPeriodo(userId, String(input.dal), String(input.al))
    }
    if (name === 'classifica_piatti') {
      const ordine = input.ordine === 'basso' ? 'basso' : 'alto'
      const limite = Number.isFinite(Number(input.limite)) ? Math.max(1, Math.min(20, Number(input.limite))) : 5
      return await classificaPiatti(userId, String(input.dal), String(input.al), ordine, limite)
    }
    if (name === 'presenze_timbrature') {
      return await presenzeTimbrature(userId, String(input.dal), String(input.al))
    }
    if (name === 'coperti_per_dipendente') {
      return await copertiPerDipendente(userId, String(input.dal), String(input.al))
    }
    return { errore: `Strumento sconosciuto: ${name}` }
  } catch (e) {
    console.error('[COPILOT] errore tool', name, e)
    return { errore: 'Non sono riuscito a recuperare questo dato. Riprova o riformula la domanda.' }
  }
}

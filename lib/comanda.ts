import { parseReparti, repartoDefault } from '@/lib/reparti'
import { ALLERGENE_LABEL } from '@/lib/allergeni'

// La "comanda" è la stampa che parte verso una postazione (reparto): cosa preparare, per quale
// tavolo/ordine, a che ora. È il modello COMUNE, indipendente dalla stampante e da come la si
// consegna. Da un Ordine con le sue righe si ricava UNA comanda per ogni reparto coinvolto
// (raggruppando le righe sul reparto snapshot della riga): la cucina riceve i piatti, il bar le
// bevande, ecc. — esattamente come instrada già la board Ordini.

export interface RigaComanda {
  nome: string
  quantita: number
  note?: string | null
  mandata: number // portata/coursing: 1=insieme, 2, 3
}

export interface Comanda {
  ordineId: string
  tipo: 'tavolo' | 'asporto' | 'delivery'
  etichetta: string // "Tavolo 5" | "Asporto — Mario" | "Delivery — Via Roma 12"
  reparto: string
  ora: string // HH:MM ora di Roma
  righe: RigaComanda[]
  noteOrdine?: string | null
  allergeni?: string[] // union delle label allergeni dei piatti della comanda (avviso in cucina)
}

// Forme minime accettate in input: un Ordine con le righe (e, se disponibile, il piatto per gli allergeni).
export interface RigaComandaInput {
  nome: string
  quantita: number
  note?: string | null
  mandata?: number | null
  reparto?: string | null
  piatto?: { allergeni?: string[] | null } | null
}
export interface OrdineComandaInput {
  id: string
  tavolo: string
  tipo?: string | null
  clienteInfo?: string | null
  note?: string | null
  createdAt?: Date | string | null
  righe: RigaComandaInput[]
}

function oraDiRoma(at?: Date | string | null): string {
  const d = at ? new Date(at) : new Date()
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

// Etichetta della comanda in base al tipo: al tavolo basta il numero; asporto/delivery mostrano il
// nome del cliente (e per il delivery l'indirizzo), letti dal clienteInfo JSON.
function etichettaOrdine(o: OrdineComandaInput, tipo: Comanda['tipo']): string {
  if (tipo === 'tavolo') return `Tavolo ${o.tavolo}`
  let ci: { nome?: string; indirizzo?: string } = {}
  try { ci = JSON.parse(o.clienteInfo ?? '{}') } catch {}
  const nome = ci.nome?.trim()
  if (tipo === 'delivery') {
    const dett = [nome, ci.indirizzo?.trim()].filter(Boolean).join(' — ')
    return dett ? `Delivery — ${dett}` : 'Delivery'
  }
  return nome ? `Asporto — ${nome}` : 'Asporto'
}

// Da un ordine ricava una comanda per ogni reparto presente nelle righe (ordine reparti = quello
// del locale, così Cucina viene prima di Bar). Le righe senza reparto (ordini vecchi / piatti senza
// categoria) confluiscono nel reparto di default. Righe ordinate per mandata (coursing).
export function comandePerOrdine(o: OrdineComandaInput, repartiJson?: string | null): Comanda[] {
  const reparti = parseReparti(repartiJson)
  const def = repartoDefault(reparti)
  const tipo = (o.tipo === 'asporto' || o.tipo === 'delivery' ? o.tipo : 'tavolo') as Comanda['tipo']
  const ora = oraDiRoma(o.createdAt)
  const etichetta = etichettaOrdine(o, tipo)

  // Raggruppa le righe per reparto snapshot (fallback al reparto principale).
  const perReparto = new Map<string, RigaComandaInput[]>()
  for (const r of o.righe) {
    const rep = (r.reparto && r.reparto.trim()) || def
    if (!perReparto.has(rep)) perReparto.set(rep, [])
    perReparto.get(rep)!.push(r)
  }

  // Ordina i reparti come nel locale (quelli non elencati in coda, stabile).
  const ordineReparti = [...perReparto.keys()].sort((a, b) => {
    const ia = reparti.indexOf(a), ib = reparti.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })

  const comande: Comanda[] = []
  for (const rep of ordineReparti) {
    const righeRep = perReparto.get(rep)!
    const righe: RigaComanda[] = righeRep
      .map((r) => ({
        nome: r.nome,
        quantita: r.quantita,
        note: r.note ?? null,
        mandata: Number.isFinite(r.mandata) && (r.mandata as number) >= 1 ? Math.floor(r.mandata as number) : 1,
      }))
      .sort((a, b) => a.mandata - b.mandata)

    // Union degli allergeni dei piatti presenti (se il chiamante ha incluso piatto.allergeni).
    const allergeniKeys = new Set<string>()
    for (const r of righeRep) for (const k of r.piatto?.allergeni ?? []) allergeniKeys.add(k)
    const allergeni = [...allergeniKeys].map((k) => ALLERGENE_LABEL[k] ?? k)

    comande.push({
      ordineId: o.id,
      tipo,
      etichetta,
      reparto: rep,
      ora,
      righe,
      noteOrdine: o.note?.trim() || null,
      allergeni: allergeni.length ? allergeni : undefined,
    })
  }
  return comande
}

// Comanda d'esempio (per l'anteprima UI senza un ordine reale).
export function comandaEsempio(reparto = 'Cucina'): Comanda {
  return {
    ordineId: 'esempio',
    tipo: 'tavolo',
    etichetta: 'Tavolo 5',
    reparto,
    ora: oraDiRoma(),
    righe: [
      { nome: 'Spaghetti alle vongole', quantita: 2, note: 'senza aglio', mandata: 1 },
      { nome: 'Tagliata di manzo', quantita: 1, note: 'al sangue', mandata: 2 },
      { nome: 'Tiramisù', quantita: 2, note: null, mandata: 3 },
    ],
    noteOrdine: 'Tavolo con bambini',
    allergeni: ['Glutine', 'Latte e lattosio'],
  }
}

import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Strumenti dell'Assistente AI — FASE 1: SOLA LETTURA.
// Ogni strumento interroga il DB via Prisma ed è SEMPRE scoped su userId (il
// locale loggato) → nessun rischio di vedere dati di altri ristoranti.
// Nessuno di questi strumenti scrive o modifica alcunché.
// ─────────────────────────────────────────────────────────────────────────────

// Definizioni passate a Claude (tool use). Nomi e descrizioni in italiano:
// Claude le usa per decidere quale strumento chiamare e con quali parametri.
export const copilotTools = [
  {
    name: 'incasso_periodo',
    description:
      "Calcola l'incasso totale del locale in un intervallo di date, con numero di ordini e coperti, suddiviso per tipo (tavolo/asporto/delivery). Usalo per domande come \"quanto ho incassato ieri/questa settimana/questo mese\".",
    input_schema: {
      type: 'object' as const,
      properties: {
        dal: { type: 'string', description: 'Data inizio inclusa, formato YYYY-MM-DD' },
        al: { type: 'string', description: 'Data fine inclusa, formato YYYY-MM-DD' },
      },
      required: ['dal', 'al'],
    },
  },
  {
    name: 'classifica_piatti',
    description:
      'Restituisce la classifica dei piatti per quantità venduta in un intervallo di date. Usalo per "piatto più/meno venduto", "top piatti", "cosa vende di meno".',
    input_schema: {
      type: 'object' as const,
      properties: {
        dal: { type: 'string', description: 'Data inizio inclusa, formato YYYY-MM-DD' },
        al: { type: 'string', description: 'Data fine inclusa, formato YYYY-MM-DD' },
        ordine: {
          type: 'string',
          enum: ['alto', 'basso'],
          description: '"alto" = più venduti (default), "basso" = meno venduti',
        },
        limite: { type: 'number', description: 'Quanti piatti restituire (default 5)' },
      },
      required: ['dal', 'al'],
    },
  },
] as const

// Converte "YYYY-MM-DD" nell'istante di mezzanotte UTC (coerente con Analytics).
function inizioGiornoUTC(giorno: string): Date {
  const [y, m, d] = giorno.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

// Intervallo [dal 00:00 UTC, al+1giorno 00:00 UTC) → così "al" è incluso.
function intervallo(dal: string, al: string) {
  const from = inizioGiornoUTC(dal)
  const to = inizioGiornoUTC(al)
  to.setUTCDate(to.getUTCDate() + 1)
  return { from, to }
}

const euro = (n: number) => `${n.toFixed(2)} €`

async function incassoPeriodo(userId: string, dal: string, al: string) {
  const { from, to } = intervallo(dal, al)
  const ordini = await prisma.ordine.findMany({
    where: { userId, createdAt: { gte: from, lt: to } },
    select: { tipo: true, totale: true, coperti: true },
  })

  const perTipo: Record<string, { incasso: number; ordini: number }> = {}
  let incassoTotale = 0
  let copertiTotali = 0
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
    dettaglio_per_tipo: Object.fromEntries(
      Object.entries(perTipo).map(([t, v]) => [t, { incasso: euro(v.incasso), ordini: v.ordini }])
    ),
  }
}

async function classificaPiatti(
  userId: string,
  dal: string,
  al: string,
  ordine: 'alto' | 'basso',
  limite: number,
) {
  const { from, to } = intervallo(dal, al)
  const righe = await prisma.rigaOrdine.findMany({
    where: { ordine: { userId, createdAt: { gte: from, lt: to } } },
    select: { nome: true, quantita: true, prezzo: true },
  })

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

  return {
    periodo: `dal ${dal} al ${al}`,
    criterio: ordine === 'basso' ? 'meno venduti' : 'più venduti',
    piatti: lista,
    nota: lista.length === 0 ? 'Nessun piatto venduto nel periodo indicato.' : undefined,
  }
}

// Dispatcher: esegue lo strumento richiesto da Claude. Sempre scoped su userId.
export async function eseguiCopilotTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<unknown> {
  try {
    if (name === 'incasso_periodo') {
      return await incassoPeriodo(userId, String(input.dal), String(input.al))
    }
    if (name === 'classifica_piatti') {
      const ordine = input.ordine === 'basso' ? 'basso' : 'alto'
      const limite = Number.isFinite(Number(input.limite)) ? Math.max(1, Math.min(20, Number(input.limite))) : 5
      return await classificaPiatti(userId, String(input.dal), String(input.al), ordine, limite)
    }
    return { errore: `Strumento sconosciuto: ${name}` }
  } catch (e) {
    console.error('[COPILOT] errore tool', name, e)
    return { errore: 'Non sono riuscito a recuperare questo dato. Riprova o riformula la domanda.' }
  }
}

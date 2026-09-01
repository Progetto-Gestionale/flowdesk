import { prisma } from '@/lib/prisma'
import { repartoPerPiatti, foodCostPerPiatti } from '@/lib/reparti'
import { parseInfoOrdine, type RigaPreventivo } from '@/lib/ordineInfo'
import { enqueueComande } from '@/lib/print/enqueue'

// Un preventivo asporto/delivery accettato diventa un Ordine vero (che entra in cucina e nella
// pagina Asporto & Delivery). Le voci del carrello stanno negli items; i dati di consegna in note,
// dietro il marker INFO:{...} (più DATA_ISO per l'orario, riusato anche dalle email).
export { parseInfoOrdine, buildNoteOrdine } from '@/lib/ordineInfo'
export type { RigaPreventivo, InfoOrdine } from '@/lib/ordineInfo'

interface PreventivoLike { id: string; tipo: string; clienteName: string; clienteEmail: string | null; items: string; totale: number; note: string | null }

// Crea l'Ordine reale da un preventivo asporto/delivery. Idempotente: se esiste già un ordine
// collegato a questo preventivo (marker richiestaId in clienteInfo) non ne crea un altro.
export async function creaOrdineDaPreventivo(preventivo: PreventivoLike, userId: string): Promise<string | null> {
  const tipo = preventivo.tipo === 'delivery' ? 'delivery' : 'asporto'
  const info = parseInfoOrdine(preventivo.note)
  const isDelivery = tipo === 'delivery'

  // Guardia idempotenza (doppio click / doppia risposta al token).
  const esistente = await prisma.ordine.findFirst({
    where: { userId, clienteInfo: { contains: `"richiestaId":"${preventivo.id}"` } },
    select: { id: true },
  })
  if (esistente) return esistente.id

  let righe: RigaPreventivo[] = []
  try { const a = JSON.parse(preventivo.items ?? '[]'); if (Array.isArray(a)) righe = a } catch {}
  righe = righe.filter(r => r && r.nome && Number(r.quantita) > 0)
  if (righe.length === 0) return null

  const clienteInfo = JSON.stringify({
    nome: preventivo.clienteName,
    email: preventivo.clienteEmail ?? info.email ?? null,
    telefono: info.telefono ?? null,
    indirizzo: isDelivery ? (info.indirizzo ?? null) : null,
    data: info.data ?? null,
    ora: info.ora ?? null,
    richiestaId: preventivo.id, // marker per idempotenza + collegamento richiesta→ordine
  })

  const repMap = await repartoPerPiatti(righe.map(r => r.piattoId))
  const fcMap = await foodCostPerPiatti(righe.map(r => r.piattoId))

  // Un carrello può referenziare piatti ELIMINATI dal menu (menu ricreato/modificato tra
  // richiesta e accettazione). RigaOrdine.piattoId ha una foreign key verso MenuPiatto:
  // inserire un id che non esiste più fa fallire tutto l'ordine (P2003). Quindi teniamo il
  // piattoId SOLO se il piatto esiste ancora; altrimenti null (nome e prezzo restano sulla
  // riga → l'ordine nasce comunque, giusto senza il collegamento vivo al piatto).
  const idsCarrello = [...new Set(righe.map(r => r.piattoId).filter((x): x is string => !!x))]
  const idsEsistenti = idsCarrello.length
    ? new Set((await prisma.menuPiatto.findMany({ where: { id: { in: idsCarrello } }, select: { id: true } })).map(p => p.id))
    : new Set<string>()

  const ordine = await prisma.ordine.create({
    data: {
      userId,
      tavolo: isDelivery ? 'Delivery' : 'Asporto',
      tipo,
      clienteInfo,
      totale: preventivo.totale,
      note: info.noteCliente || null,
      status: 'nuovo',
      righe: {
        create: righe.map(r => {
          const pid = r.piattoId && idsEsistenti.has(r.piattoId) ? r.piattoId : null
          return {
            piattoId: pid,
            nome: r.nome,
            prezzo: r.prezzo,
            foodCost: pid ? (fcMap[pid] ?? null) : null,
            quantita: r.quantita,
            note: r.note ?? null,
            reparto: pid ? (repMap[pid] ?? null) : null,
          }
        }),
      },
    },
  })
  // Stampa comande (non invasivo: un errore qui non deve far fallire l'accettazione della richiesta).
  await enqueueComande(ordine.id).catch(() => {})
  return ordine.id
}

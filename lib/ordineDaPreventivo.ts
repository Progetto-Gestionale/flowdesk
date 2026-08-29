import { prisma } from '@/lib/prisma'
import { repartoPerPiatti } from '@/lib/reparti'
import { parseInfoOrdine, type RigaPreventivo } from '@/lib/ordineInfo'

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
        create: righe.map(r => ({
          piattoId: r.piattoId ?? null,
          nome: r.nome,
          prezzo: r.prezzo,
          quantita: r.quantita,
          note: r.note ?? null,
          reparto: r.piattoId ? (repMap[r.piattoId] ?? null) : null,
        })),
      },
    },
  })
  return ordine.id
}

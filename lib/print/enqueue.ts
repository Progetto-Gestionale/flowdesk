import { prisma } from '@/lib/prisma'
import { comandePerOrdine } from '@/lib/comanda'
import { escposComanda, testoComanda } from '@/lib/escpos'
import { getTransport, type JobDaStampare } from '@/lib/print/transport'

// Innesco della stampa. Alla creazione di un ordine, genera UN PrintJob per ogni reparto presente
// (una comanda ciascuno) e lo mette in coda, poi lo consegna con il transport attivo (oggi Mock).
// È volutamente NON invasivo: viene chiamato con `await …catch(()=>{})` dopo la creazione dell'ordine,
// quindi un qualunque errore qui NON rompe il flusso d'ordine (l'ordine è già salvato).

// Manda un singolo job al transport e ne aggiorna lo stato. Ritorna true se stampato.
async function eseguiStampa(jobId: string): Promise<boolean> {
  const job = await prisma.printJob.findUnique({
    where: { id: jobId },
    include: { stampante: true },
  })
  if (!job) return false

  const daStampare: JobDaStampare = {
    id: job.id,
    reparto: job.reparto,
    contenuto: job.contenuto,
    anteprima: job.anteprima,
    stampante: job.stampante
      ? { id: job.stampante.id, nome: job.stampante.nome, indirizzo: job.stampante.indirizzo, tipo: job.stampante.tipo }
      : null,
  }

  try {
    const res = await getTransport().invia(daStampare)
    await prisma.printJob.update({
      where: { id: job.id },
      data: res.ok
        ? { stato: 'stampata', stampataAt: new Date(), errore: null, tentativi: { increment: 1 } }
        : { stato: 'errore', errore: res.errore ?? 'Errore sconosciuto', tentativi: { increment: 1 } },
    })
    return res.ok
  } catch (e) {
    await prisma.printJob.update({
      where: { id: job.id },
      data: { stato: 'errore', errore: e instanceof Error ? e.message : String(e), tentativi: { increment: 1 } },
    }).catch(() => {})
    return false
  }
}

// Accoda le comande di un ordine (una per reparto) e le consegna. Non rilancia mai.
// opts.soloRigheIds: stampa solo quelle righe (usato quando si aggiunge un piatto a un ordine già
// aperto → si stampa una comanda per il solo piatto aggiunto, non si ristampa l'intero ordine).
// opts.quantitaPerRiga: forza la quantità stampata di una riga (es. su aggiunta a riga esistente si
// stampa solo il DELTA aggiunto, non il totale accumulato).
export async function enqueueComande(
  ordineId: string,
  opts?: { soloRigheIds?: string[]; quantitaPerRiga?: Record<string, number> },
): Promise<void> {
  try {
    const ordine = await prisma.ordine.findUnique({
      where: { id: ordineId },
      include: {
        user: { select: { reparti: true } },
        righe: { include: { piatto: { select: { allergeni: true } } } },
      },
    })
    if (!ordine) return

    const soloIds = opts?.soloRigheIds ? new Set(opts.soloRigheIds) : null
    const righeDaStampare = soloIds ? ordine.righe.filter((r) => soloIds.has(r.id)) : ordine.righe
    if (righeDaStampare.length === 0) return

    const comande = comandePerOrdine(
      {
        id: ordine.id,
        tavolo: ordine.tavolo,
        tipo: ordine.tipo,
        clienteInfo: ordine.clienteInfo,
        note: ordine.note,
        createdAt: ordine.createdAt,
        righe: righeDaStampare.map((r) => ({
          nome: r.nome,
          quantita: opts?.quantitaPerRiga?.[r.id] ?? r.quantita,
          note: r.note,
          mandata: r.mandata,
          reparto: r.reparto,
          piatto: r.piatto ? { allergeni: r.piatto.allergeni } : null,
        })),
      },
      ordine.user.reparti,
    )
    if (comande.length === 0) return

    // Stampanti attive del locale, per instradare ogni comanda alla stampante del suo reparto.
    const stampanti = await prisma.stampante.findMany({
      where: { userId: ordine.userId, attiva: true },
    })
    const perReparto = new Map(stampanti.map((s) => [s.reparto, s]))

    for (const c of comande) {
      const stampante = perReparto.get(c.reparto) ?? null
      const job = await prisma.printJob.create({
        data: {
          userId: ordine.userId,
          ordineId: ordine.id,
          stampanteId: stampante?.id ?? null,
          reparto: c.reparto,
          contenuto: escposComanda(c).toString('base64'),
          anteprima: testoComanda(c),
          stato: 'in_attesa',
        },
      })
      await eseguiStampa(job.id)
    }
  } catch (e) {
    // Non invasivo: la stampa non deve mai far fallire la creazione dell'ordine.
    console.error('[enqueueComande] errore (ignorato):', e)
  }
}

// Ristampa: riaccoda un job esistente (nuovo tentativo di consegna con il transport attivo).
export async function ristampaJob(jobId: string, userId: string): Promise<boolean> {
  const job = await prisma.printJob.findFirst({ where: { id: jobId, userId } })
  if (!job) return false
  await prisma.printJob.update({ where: { id: job.id }, data: { stato: 'in_attesa', errore: null } })
  return eseguiStampa(job.id)
}

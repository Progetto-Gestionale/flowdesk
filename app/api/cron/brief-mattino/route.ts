import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateRestaurantBrief } from '@/lib/copilot/brief'
import { salvaBrief } from '@/lib/copilot/brief/persist'
import { registraSpesaBrief } from '@/lib/copilot/spesa'

// ─────────────────────────────────────────────────────────────────────────────
// Cron del MATTINO (Fase proattività). Per ogni locale Food che IERI ha venduto:
// genera il brief giornaliero e lo SALVA (BriefSalvato). Così il titolare, aprendo
// l'app, lo trova già pronto ("recap di ieri + prenotazioni di oggi") invece di
// generarlo a mano. Il brief usa Haiku (economico) e la spesa finisce nel contatore
// del mese; i numeri li calcola sempre riepilogoContabile live.
//
// In vercel.json è schedulato alle 04:00 UTC = 06:00 (ora legale) / 05:00 (solare)
// italiana: i cron Vercel sono in UTC e non seguono l'ora legale, quindi d'inverno
// anticipa a 05:00 — va bene, il brief dev'essere solo PRONTO prima che il titolare
// apra l'app, non è una notifica. Ieri è comunque una giornata già chiusa.
// Il calcolo dei giorni usa il fuso di Roma, non l'ora del server.
// Protetto dal CRON_SECRET in produzione.
// ─────────────────────────────────────────────────────────────────────────────

// Ancora di IERI a mezzanotte UTC del giorno-di-Roma (coerente con il resto del
// Copilota, che costruisce i confini su UTC a partire dal giorno di Roma).
function ieriMezzanotteUTC(): Date {
  const ymd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) // oggi YYYY-MM-DD
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const ieri = ieriMezzanotteUTC()
  const oggi = new Date(ieri.getTime() + 86_400_000)

  // Brief solo per i locali Food che ieri hanno avuto ordini.
  const attivi = await prisma.ordine.findMany({
    where: { createdAt: { gte: ieri, lt: oggi }, user: { verticale: 'food' } },
    select: { userId: true },
    distinct: ['userId'],
  })

  let generati = 0
  let errori = 0
  for (const { userId } of attivi) {
    try {
      const r = await generateRestaurantBrief(userId, 'daily')
      await salvaBrief(userId, 'daily', r)
      await registraSpesaBrief(userId, r.usage)
      generati++
    } catch (e) {
      errori++
      console.error('[CRON brief-mattino] brief fallito per', userId, e)
    }
  }

  return NextResponse.json({
    ok: true,
    giorno: ieri.toISOString().slice(0, 10),
    briefGenerati: generati,
    briefFalliti: errori,
    eseguitoAlle: new Date().toISOString(),
  })
}

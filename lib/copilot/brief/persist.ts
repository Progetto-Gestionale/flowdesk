// Persistenza server-side dei brief (Fase proattività). Il cron del mattino
// genera il brief e lo salva qui; il frontend lo carica già pronto invece di
// generarlo al click. Un record per (locale, periodo): l'ultimo sostituisce il
// precedente. Mai lancia: un problema di salvataggio non deve rompere il brief.

import { prisma } from '@/lib/prisma'
import type { Brief, BriefContext, Timeframe } from '@/lib/copilot/ai'

export interface BriefPersistito {
  brief: Brief
  context: BriefContext
  generatedAt: string // ISO
}

// Giorno di riferimento del brief: mezzanotte italiana di oggi, come le chiusure.
function giornoRiferimento(): Date {
  const ymd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

export async function salvaBrief(
  userId: string,
  timeframe: Timeframe,
  r: { brief: Brief; context: BriefContext },
): Promise<void> {
  try {
    const payload = {
      data: giornoRiferimento(),
      brief: JSON.stringify(r.brief),
      context: JSON.stringify(r.context),
      generatedAt: new Date(), // @default(now()) vale solo in create → lo settiamo sempre
    }
    await prisma.briefSalvato.upsert({
      where: { userId_timeframe: { userId, timeframe } },
      create: { userId, timeframe, ...payload },
      update: payload,
    })
  } catch (e) {
    console.error('[BRIEF] salvataggio fallito:', e)
  }
}

export async function caricaBrief(userId: string, timeframe: Timeframe): Promise<BriefPersistito | null> {
  try {
    const row = await prisma.briefSalvato.findUnique({
      where: { userId_timeframe: { userId, timeframe } },
    })
    if (!row) return null
    return {
      brief: JSON.parse(row.brief) as Brief,
      context: JSON.parse(row.context) as BriefContext,
      generatedAt: row.generatedAt.toISOString(),
    }
  } catch (e) {
    console.error('[BRIEF] caricamento fallito:', e)
    return null
  }
}

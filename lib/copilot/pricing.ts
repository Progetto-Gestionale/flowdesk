// Pricing e registrazione spesa AI — UNICO posto (Dup.3). Prima c'erano due tabelle
// prezzi parallele (route.ts della chat + spesa.ts dei brief) e due funzioni che
// scrivevano sulla stessa tabella CopilotUsage. Qui stanno insieme: quando cambi
// modello o prezzo aggiorni UN posto solo.
//
// Fonte prezzi: reference Anthropic ($/1M token) — da verificare su fattura.
// cr = cache-read (~0,1x); cw = cache-write (~1,25x).

import { prisma } from '@/lib/prisma'

// Cambio approssimativo USD→EUR (la fatturazione Anthropic è in dollari).
export const USD_TO_EUR = 0.92

// Mese corrente "YYYY-MM" in fuso Europe/Rome (così il taglio del mese è locale).
export function meseCorrente(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 7)
}

export interface TokenUsage {
  input: number // input non-cached
  output: number
  cacheRead: number // input serviti dalla cache (~10%)
  cacheCreation: number // input scritti in cache (~1,25x); 0 dove non si usa cache-write
}

const PRICING: Record<string, { in: number; out: number; cr: number; cw: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5, cr: 0.1, cw: 1.25 },
  'claude-sonnet-5': { in: 2, out: 10, cr: 0.2, cw: 2.5 },
  'claude-opus-4-8': { in: 5, out: 25, cr: 0.5, cw: 6.25 },
  'gemini-2.0-flash': { in: 0.075, out: 0.3, cr: 0.075, cw: 0.075 },
}

export function stimaCostoUsd(u: TokenUsage, model: string): number {
  const p = PRICING[model] ?? PRICING['claude-sonnet-5']
  return (u.input * p.in + u.output * p.out + u.cacheRead * p.cr + u.cacheCreation * p.cw) / 1_000_000
}

// Somma un costo (già stimato) al totale del mese del locale, sulla tabella
// CopilotUsage condivisa da chat e brief → il contatore mostra la spesa AI totale.
// In try/catch: se il DB fallisce, il chiamante funziona comunque, solo il contatore
// non si aggiorna. Restituisce il totale del mese aggiornato in euro.
export async function registraSpesa(
  userId: string,
  costoUsd: number,
  tokenInput: number,
  tokenOutput: number,
): Promise<{ costoEur: number } | null> {
  try {
    const mese = meseCorrente()
    const row = await prisma.copilotUsage.upsert({
      where: { userId_mese: { userId, mese } },
      create: { userId, mese, costoUsd, tokenInput, tokenOutput },
      update: {
        costoUsd: { increment: costoUsd },
        tokenInput: { increment: tokenInput },
        tokenOutput: { increment: tokenOutput },
      },
    })
    return { costoEur: row.costoUsd * USD_TO_EUR }
  } catch (e) {
    console.error('[COPILOT] registrazione spesa fallita:', e)
    return null
  }
}

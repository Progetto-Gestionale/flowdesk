import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { costoOrarioReale } from '@/lib/contabilita/labor'

// Anagrafica retributiva dei dipendenti (paga netta + moltiplicatore costi azienda).
// Owner-only. I dati di paga sono sensibili: mai esposti alle rotte pubbliche dipendente.
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const dip = await prisma.dipendente.findMany({
    where: { userId: user.id },
    orderBy: { ordine: 'asc' },
    select: { id: true, nome: true, ruolo: true, pagaOrariaBaseNetta: true, moltiplicatoreCostoAzienda: true },
  })
  const cfg = await prisma.contabilitaConfig.findUnique({ where: { userId: user.id } })
  return NextResponse.json({
    dipendenti: dip.map(d => ({ ...d, costoOrarioReale: costoOrarioReale(d.pagaOrariaBaseNetta, d.moltiplicatoreCostoAzienda) })),
    moltiplicatoreDefault: cfg?.moltiplicatoreLaborDefault ?? 1.4,
  })
}

// Mezzanotte di OGGI nel fuso di Roma, ancorata a UTC (coerente con le date dello storico
// e con il resto del Copilota, che costruisce i confini su UTC a partire dal giorno di Roma).
function mezzanotteRomaUTC(): Date {
  const ymd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) // YYYY-MM-DD
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const id = String(b.id ?? '')
  const dip = await prisma.dipendente.findFirst({ where: { id, userId: user.id } })
  if (!dip) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const paga = b.pagaOrariaBaseNetta === null || b.pagaOrariaBaseNetta === '' ? null : Number(b.pagaOrariaBaseNetta)
  if (paga !== null && (!Number.isFinite(paga) || paga < 0)) return NextResponse.json({ error: 'Paga non valida' }, { status: 400 })
  const moltRaw = Number(b.moltiplicatoreCostoAzienda)
  const molt = Number.isFinite(moltRaw) && moltRaw >= 1 ? moltRaw : 1.4

  // ── Storico tariffe (date di validità) ──────────────────────────────────────
  // - Primo inserimento (nessuno storico): la tariffa vale da SEMPRE (epoch) → copre le ore
  //   già lavorate quando la paga non era ancora impostata.
  // - Variazione successiva (aumento ecc.): vale da OGGI in avanti; i turni passati restano
  //   sulla vecchia tariffa e la contabilità storica non cambia.
  // - Ri-modifica nello stesso giorno: aggiorno il record di oggi invece di duplicarlo.
  const ultima = await prisma.dipendentePagaStorico.findFirst({
    where: { dipendenteId: dip.id },
    orderBy: { dataInizio: 'desc' },
  })
  const cambiato = !ultima || ultima.pagaOrariaBaseNetta !== paga || ultima.moltiplicatoreCostoAzienda !== molt
  if (cambiato) {
    const oggi = mezzanotteRomaUTC()
    if (!ultima) {
      await prisma.dipendentePagaStorico.create({
        data: { dipendenteId: dip.id, userId: user.id, dataInizio: new Date(0), pagaOrariaBaseNetta: paga, moltiplicatoreCostoAzienda: molt },
      })
    } else if (ultima.dataInizio.getTime() === oggi.getTime()) {
      await prisma.dipendentePagaStorico.update({
        where: { id: ultima.id },
        data: { pagaOrariaBaseNetta: paga, moltiplicatoreCostoAzienda: molt },
      })
    } else {
      await prisma.dipendentePagaStorico.create({
        data: { dipendenteId: dip.id, userId: user.id, dataInizio: oggi, pagaOrariaBaseNetta: paga, moltiplicatoreCostoAzienda: molt },
      })
    }
  }

  // Specchio "corrente" su Dipendente (usato dalla UI in GET e come default del form).
  const upd = await prisma.dipendente.update({
    where: { id: dip.id },
    data: { pagaOrariaBaseNetta: paga, moltiplicatoreCostoAzienda: molt },
    select: { id: true, nome: true, pagaOrariaBaseNetta: true, moltiplicatoreCostoAzienda: true },
  })
  return NextResponse.json({ ...upd, costoOrarioReale: costoOrarioReale(upd.pagaOrariaBaseNetta, upd.moltiplicatoreCostoAzienda) })
}

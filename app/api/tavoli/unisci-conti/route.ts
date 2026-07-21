import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// POST — unisce due o più conti/tavoli in un unico GruppoTavoli.
// Gli ordini aperti dei tavoli coinvolti vengono agganciati al gruppo (gruppoId),
// restando comunque record separati = sottogruppi distinti nel conto unito.
// Il gruppo si scioglie alla chiusura del conto (vedi /api/tavoli/chiudi-conto).
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { tavoliIds } = await req.json()
  if (!Array.isArray(tavoliIds) || tavoliIds.length < 2)
    return NextResponse.json({ error: 'Servono almeno 2 tavoli' }, { status: 400 })

  // Data odierna (fuso Europe/Rome), coerente con /api/ordina che cerca il gruppo per data
  const oggi = new Date()
  const localOggi = new Date(oggi.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
  const dataStr = `${localOggi.getFullYear()}-${String(localOggi.getMonth() + 1).padStart(2, '0')}-${String(localOggi.getDate()).padStart(2, '0')}`

  // Se uno dei tavoli è già in un gruppo di oggi, aggiungo gli altri a quello; altrimenti ne creo uno nuovo
  const esistente = await prisma.gruppoTavoli.findFirst({
    where: { userId: user.id, data: dataStr, tavoli: { some: { id: { in: tavoliIds } } } },
  })

  let gruppoId: string
  if (esistente) {
    gruppoId = esistente.id
    await prisma.gruppoTavoli.update({
      where: { id: gruppoId },
      data: { tavoli: { connect: tavoliIds.map((id: string) => ({ id })) } },
    })
  } else {
    const g = await prisma.gruppoTavoli.create({
      data: { userId: user.id, label: '', data: dataStr, tavoli: { connect: tavoliIds.map((id: string) => ({ id })) } },
    })
    gruppoId = g.id
  }

  // Ricalcolo la label dai tavoli effettivamente nel gruppo (es. "5+6+7")
  const tavoliGruppo = await prisma.tavolo.findMany({ where: { gruppoId }, select: { id: true, numero: true } })
  const label = tavoliGruppo.map(t => t.numero).sort((a, b) => a - b).join('+')
  await prisma.gruppoTavoli.update({ where: { id: gruppoId }, data: { label } })

  // Aggancio gli ordini aperti di questi tavoli al gruppo (restano sottogruppi separati)
  await prisma.ordine.updateMany({
    where: { userId: user.id, tavoloId: { in: tavoliGruppo.map(t => t.id) }, status: { notIn: ['chiuso', 'consegnato'] } },
    data: { gruppoId, tavolo: `T${label}` },
  })

  return NextResponse.json({ ok: true, gruppoId, label })
}

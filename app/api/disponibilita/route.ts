import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// GET — titolare legge disponibilità per un mese, o dipendente legge le sue tramite token
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mese = url.searchParams.get('mese')
  const token = url.searchParams.get('token')
  if (!mese) return NextResponse.json({ error: 'mese obbligatorio' }, { status: 400 })

  if (token) {
    // Dipendente che legge le proprie disponibilità
    const dipendente = await prisma.dipendente.findUnique({ where: { token } })
    if (!dipendente) return NextResponse.json({ error: 'Token non valido' }, { status: 401 })
    const disponibilita = await prisma.disponibilitaDipendente.findMany({
      where: { dipendenteId: dipendente.id, mese: new Date(mese) },
    })
    return NextResponse.json({ disponibilita })
  }

  // Titolare autenticato
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const disponibilita = await prisma.disponibilitaDipendente.findMany({
    where: { mese: new Date(mese), dipendente: { userId: user.id } },
    include: { dipendente: { select: { id: true, nome: true, ruolo: true } } },
  })
  return NextResponse.json({ disponibilita })
}

// POST — dipendente salva le sue disponibilità mensili
export async function POST(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token mancante' }, { status: 401 })

  const dipendente = await prisma.dipendente.findUnique({ where: { token } })
  if (!dipendente) return NextResponse.json({ error: 'Token non valido' }, { status: 401 })
  if (dipendente.tokenExpiry && dipendente.tokenExpiry < new Date())
    return NextResponse.json({ error: 'Link scaduto' }, { status: 401 })

  const { mese, giorni } = await req.json()

  const record = await prisma.disponibilitaDipendente.upsert({
    where: { dipendenteId_mese: { dipendenteId: dipendente.id, mese: new Date(mese) } },
    update: { giorni: JSON.stringify(giorni) },
    create: { dipendenteId: dipendente.id, mese: new Date(mese), giorni: JSON.stringify(giorni) },
  })
  return NextResponse.json({ record })
}

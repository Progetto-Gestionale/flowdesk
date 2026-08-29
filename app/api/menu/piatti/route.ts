import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'
import { normQuantita, normSoglia, normEtichetta, normColore } from '@/lib/menuPiatto'

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const { categoriaId, nome, descrizione, prezzo, immagineUrl, allergeni, quantita, quantitaSoglia, etichetta, etichettaColore } = await req.json()
  const count = await prisma.menuPiatto.count({ where: { categoriaId } })
  const piatto = await prisma.menuPiatto.create({
    data: {
      userId: user.id, categoriaId, nome, descrizione, prezzo: parseFloat(prezzo), immagineUrl,
      allergeni: Array.isArray(allergeni) ? allergeni : [], ordine: count,
      quantita: normQuantita(quantita),
      quantitaSoglia: normSoglia(quantitaSoglia),
      etichetta: normEtichetta(etichetta),
      etichettaColore: normColore(etichettaColore),
    },
  })
  return NextResponse.json({ piatto })
}

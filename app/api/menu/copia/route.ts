import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/getAuthUser'

// POST: copia tutto il menù da un tipo all'altro (sovrascrive la destinazione)
export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { da, a } = await req.json() // da: 'locale'|'asporto', a: 'locale'|'asporto'
  if (!da || !a || da === a) return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 })

  try {
    // Elimina le categorie e i piatti della destinazione. I piatti già ordinati
    // restano referenziati dalle righe ordine: grazie a onDelete SetNull la delete
    // stacca il riferimento (le righe conservano nome/prezzo) invece di fallire.
    const catDaEliminare = await prisma.menuCategoria.findMany({
      where: { userId: user.id, tipo: a },
      select: { id: true },
    })
    if (catDaEliminare.length > 0) {
      await prisma.menuPiatto.deleteMany({
        where: { categoriaId: { in: catDaEliminare.map(c => c.id) } },
      })
      await prisma.menuCategoria.deleteMany({
        where: { userId: user.id, tipo: a },
      })
    }

    // Leggi le categorie sorgente con i piatti
    const sorgente = await prisma.menuCategoria.findMany({
      where: { userId: user.id, tipo: da },
      include: { piatti: { orderBy: { ordine: 'asc' } } },
      orderBy: { ordine: 'asc' },
    })

    // Ricrea nella destinazione (immagini incluse)
    for (const cat of sorgente) {
      const nuovaCat = await prisma.menuCategoria.create({
        data: { userId: user.id, nome: cat.nome, ordine: cat.ordine, tipo: a },
      })
      for (const piatto of cat.piatti) {
        await prisma.menuPiatto.create({
          data: {
            userId: user.id,
            categoriaId: nuovaCat.id,
            nome: piatto.nome,
            descrizione: piatto.descrizione,
            prezzo: piatto.prezzo,
            immagineUrl: piatto.immagineUrl,
            disponibile: piatto.disponibile,
            ordine: piatto.ordine,
          },
        })
      }
    }

    return NextResponse.json({ ok: true, categorieCreate: sorgente.length })
  } catch (e) {
    console.error('[MENU/COPIA] errore:', e)
    return NextResponse.json({ error: 'Impossibile importare il menù. Riprova.' }, { status: 500 })
  }
}

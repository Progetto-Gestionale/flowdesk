import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/public/disponibilita?publicId=xxx&data=2024-07-20[&ora=19:30&durata=90]
// Senza ora/durata: ritorna disponibilità per ogni turno configurato
// Con ora+durata: ritorna { disponibile: boolean } per quello specifico slot
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const publicId = searchParams.get('publicId')
  const data = searchParams.get('data') // YYYY-MM-DD
  const ora = searchParams.get('ora')   // HH:MM (opzionale)
  const durata = searchParams.get('durata') // minuti (opzionale)

  if (!publicId || !data) return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })

  const user = await prisma.user.findFirst({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const regole = (() => { try { return JSON.parse(user.regolePrenotazione ?? '{}') } catch { return {} } })()
  if (!regole.bloccoAutoTavoli) return NextResponse.json({ turni: null, disponibile: true })

  const totaleTavoli = await prisma.tavolo.count({ where: { userId: user.id } })
  if (totaleTavoli === 0) return NextResponse.json({ turni: null, disponibile: true })

  // Conversione HH:MM → minuti del giorno
  function toMin(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }

  // Converte un Date UTC in minuti locali italiani (evita bug timezone)
  function appToLocalMin(d: Date): number {
    const local = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
    return local.getHours() * 60 + local.getMinutes()
  }

  // Appuntamenti del giorno (±1 giorno per coprire il bordo UTC)
  const inizioGiorno = new Date(`${data}T00:00:00Z`)
  const fineGiorno = new Date(`${data}T23:59:59Z`)
  // Espandiamo di 12 ore per sicurezza rispetto al timezone
  inizioGiorno.setHours(inizioGiorno.getHours() - 12)
  fineGiorno.setHours(fineGiorno.getHours() + 12)

  const appuntamenti = await prisma.appuntamento.findMany({
    where: {
      userId: user.id,
      status: { not: 'cancellato' },
      data: { gte: inizioGiorno, lte: fineGiorno },
      OR: [{ tavoloId: { not: null } }, { tavoliIds: { not: null } }],
    },
    select: { data: true, durata: true, tavoloId: true, tavoliIds: true },
  })

  // Filtra solo gli appuntamenti che cadono nel giorno richiesto (ora locale)
  const appDelGiorno = appuntamenti.filter(app => {
    const local = new Date(app.data.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
    const localDateStr = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
    return localDateStr === data
  })

  // Conta tavoli occupati in una fascia (in minuti locali)
  function tavoliOccupatiInFascia(inizioMin: number, fineMin: number): number {
    const occupati = new Set<string>()
    for (const app of appDelGiorno) {
      const appStart = appToLocalMin(app.data)
      const appEnd = appStart + app.durata
      if (appStart < fineMin && appEnd > inizioMin) {
        if (app.tavoloId) occupati.add(app.tavoloId)
        if (app.tavoliIds) {
          try { (JSON.parse(app.tavoliIds) as string[]).forEach(id => occupati.add(id)) } catch {}
        }
      }
    }
    return occupati.size
  }

  // ── Modalità slot puntuale ────────────────────────────────────────────────
  if (ora && durata) {
    const slotInizio = toMin(ora)
    const slotFine = slotInizio + Number(durata)
    const occupati = tavoliOccupatiInFascia(slotInizio, slotFine)
    return NextResponse.json({ disponibile: occupati < totaleTavoli })
  }

  // ── Modalità turni ────────────────────────────────────────────────────────
  const turniServizio: { id: string; nome: string; oraInizio: string; oraFine: string }[] =
    (() => { try { return JSON.parse(user.turniServizio ?? '[]') } catch { return [] } })()

  const turniConDisponibilita = turniServizio.map(turno => {
    const occupati = tavoliOccupatiInFascia(toMin(turno.oraInizio), toMin(turno.oraFine))
    return { id: turno.id, disponibile: occupati < totaleTavoli }
  })

  return NextResponse.json({ turni: turniConDisponibilita })
}

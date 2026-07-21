import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const STEP_MIN = 15

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
function toHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function parseRanges(raw: string | undefined | null): [number, number][] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(r => {
    const [ini, fine] = r.split('-').map(s => s.trim())
    return [toMin(ini), toMin(fine)] as [number, number]
  }).filter(([ini, fine]) => !isNaN(ini) && !isNaN(fine) && fine > ini)
}

// GET /api/public/care-disponibilita?publicId=xxx&data=YYYY-MM-DD&durata=45
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const publicId = searchParams.get('publicId')
  const data = searchParams.get('data')
  const durata = Number(searchParams.get('durata') ?? 45)

  if (!publicId || !data) return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })

  const user = await prisma.user.findFirst({ where: { publicId } })
  if (!user) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  // Range di apertura del giorno: override specifico, altrimenti template settimanale
  const dataDate = new Date(`${data}T00:00:00Z`)
  const override = await prisma.disponibilitaOverride.findUnique({
    where: { userId_data: { userId: user.id, data: dataDate } },
  })

  let ranges: [number, number][]
  if (override) {
    try { ranges = (JSON.parse(override.slots) as string[]).map(r => {
      const [ini, fine] = r.split('-').map(s => s.trim())
      return [toMin(ini), toMin(fine)] as [number, number]
    }) } catch { ranges = [] }
  } else {
    const orari = (() => { try { return JSON.parse(user.orariApertura ?? '{}') } catch { return {} } })() as Record<string, string>
    const giorno = GIORNI[new Date(`${data}T12:00:00Z`).getUTCDay()]
    ranges = parseRanges(orari[giorno])
  }

  // Appuntamenti già presenti quel giorno
  const inizioGiorno = new Date(`${data}T00:00:00Z`); inizioGiorno.setHours(inizioGiorno.getHours() - 12)
  const fineGiorno = new Date(`${data}T23:59:59Z`); fineGiorno.setHours(fineGiorno.getHours() + 12)
  const appuntamenti = await prisma.appuntamento.findMany({
    where: { userId: user.id, status: { not: 'cancellato' }, data: { gte: inizioGiorno, lte: fineGiorno } },
    select: { data: true, durata: true },
  })
  const occupati = appuntamenti
    .map(a => {
      const local = new Date(a.data.toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
      const localDateStr = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
      if (localDateStr !== data) return null
      const start = local.getHours() * 60 + local.getMinutes()
      return [start, start + a.durata] as [number, number]
    })
    .filter((x): x is [number, number] => x !== null)

  const oraCorrente = new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' })
  const now = new Date(oraCorrente)
  const oggiStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const minutiOra = now.getHours() * 60 + now.getMinutes()

  const slots: string[] = []
  for (const [ini, fine] of ranges) {
    for (let t = ini; t + durata <= fine; t += STEP_MIN) {
      if (data === oggiStr && t <= minutiOra) continue
      const conflitto = occupati.some(([os, oe]) => t < oe && t + durata > os)
      if (!conflitto) slots.push(toHHMM(t))
    }
  }

  return NextResponse.json({ slots })
}

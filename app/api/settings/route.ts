import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/getAuthUser'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    return NextResponse.json({
      nomeLocale: user.nomeLocale,
      indirizzo: user.indirizzo,
      telefono: user.telefono,
      sitoWeb: user.sitoWeb,
      descrizioneBot: user.descrizioneBot,
      maxCoperti: user.maxCoperti,
      orariApertura: user.orariApertura,
      publicId: user.publicId,
      serviziOfferti: user.serviziOfferti,
      regolePrenotazione: user.regolePrenotazione,
      menuOfferta: user.menuOfferta,
      pagamenti: user.pagamenti,
      infoPratiche: user.infoPratiche,
      faq: user.faq,
      turniServizio: user.turniServizio,
      fabbisognoStaff: user.fabbisognoStaff,
      mapElementi: user.mapElementi,
    })
  } catch (e) {
    console.error('[SETTINGS GET]', e)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const data = await req.json()
    const allowed = ['nomeLocale', 'indirizzo', 'telefono', 'sitoWeb', 'descrizioneBot', 'maxCoperti', 'orariApertura', 'publicId', 'serviziOfferti', 'regolePrenotazione', 'menuOfferta', 'pagamenti', 'infoPratiche', 'faq', 'menuLogoUrl', 'menuColoreP', 'menuColoreS', 'turniServizio', 'fabbisognoStaff', 'mapElementi']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in data) update[key] = data[key]
    }

    const pid = update.publicId as string | null | undefined
    if (pid && typeof pid === 'string' && pid.trim()) {
      const existing = await prisma.user.findFirst({ where: { publicId: pid.trim() } })
      if (existing && existing.id !== user.id) {
        return NextResponse.json({ error: 'Questo ID pubblico è già in uso' }, { status: 409 })
      }
      update.publicId = pid.trim()
    } else if (pid === '' || pid === null) {
      update.publicId = null
    }

    // publicId impostato manualmente: garantisce l'unicità tra gli utenti Flowest
    // (se già preso da un altro locale, aggiunge un suffisso -1, -2, … invece di andare in errore)
    if (typeof update.publicId === 'string' && update.publicId) {
      const base = update.publicId
      let slug = base
      let n = 1
      while (await prisma.user.findFirst({ where: { publicId: slug, NOT: { id: user.id } } })) {
        slug = `${base}-${n++}`
      }
      update.publicId = slug
    }
    // Auto-genera publicId dal nomeLocale se non esiste ancora e non è stato impostato a mano
    else if (!user.publicId && !update.publicId && update.nomeLocale) {
      const base = (update.nomeLocale as string)
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
      let slug = base
      let n = 1
      while (await prisma.user.findFirst({ where: { publicId: slug, NOT: { id: user.id } } })) {
        slug = `${base}-${n++}`
      }
      update.publicId = slug
    }

    await prisma.user.update({ where: { id: user.id }, data: update })
    return NextResponse.json({ ok: true, publicId: update.publicId ?? user.publicId ?? null })
  } catch (e) {
    console.error('[SETTINGS PATCH]', e)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}

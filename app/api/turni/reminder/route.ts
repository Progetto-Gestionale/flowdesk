import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_DISABLED = process.env.DISABLE_EMAIL === 'true'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

function getDayIndex(date: Date) {
  const d = date.getDay()
  return d === 0 ? 6 : d - 1
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { settimana } = await req.json()
  if (!settimana) return NextResponse.json({ error: 'settimana obbligatoria' }, { status: 400 })

  const lunedi = new Date(settimana)
  const domenica = new Date(lunedi)
  domenica.setDate(domenica.getDate() + 6)
  domenica.setHours(23, 59, 59, 999)

  const turni = await prisma.turno.findMany({
    where: { userId: user.id, data: { gte: lunedi, lte: domenica } },
    include: { dipendente: true },
    orderBy: { data: 'asc' },
  })

  if (turni.length === 0)
    return NextResponse.json({ error: 'Nessun turno questa settimana' }, { status: 400 })

  // Raggruppa turni per dipendente
  const perDipendente: Record<string, { nome: string; email: string; token: string | null; turni: typeof turni }> = {}
  for (const t of turni) {
    if (!perDipendente[t.dipendenteId]) {
      perDipendente[t.dipendenteId] = { nome: t.dipendente.nome, email: t.dipendente.email, token: t.dipendente.token, turni: [] }
    }
    perDipendente[t.dipendenteId].turni.push(t)
  }

  const nomeLocale = user.nomeLocale || 'Il tuo datore di lavoro'
  const settimanaLabel = `${lunedi.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – ${domenica.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`

  let inviati = 0

  for (const dip of Object.values(perDipendente)) {
    const righe = dip.turni.map(t => {
      const giorno = GIORNI[getDayIndex(new Date(t.data))]
      const data = new Date(t.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px;">${giorno} ${data}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:700;color:#4f46e5;font-size:14px;">${t.oraInizio} – ${t.oraFine}</td>
        ${t.ruolo ? `<td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">${t.ruolo}</td>` : '<td></td>'}
      </tr>`
    }).join('')

    const linkArea = dip.token ? `<p style="margin:20px 0 0;text-align:center;"><a href="${BASE_URL}/staff/${dip.token}" style="background:#4f46e5;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Vai alla tua area personale</a></p>` : ''

    const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:#4f46e5;padding:24px 32px;">
          <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${nomeLocale}</p>
          <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700;">📅 I tuoi turni della settimana</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">${settimanaLabel}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;">Ciao <strong>${dip.nome}</strong>, ecco i tuoi turni per questa settimana:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Giorno</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Orario</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Ruolo</th>
              </tr>
            </thead>
            <tbody>${righe}</tbody>
          </table>
          ${linkArea}
        </td></tr>
        <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">${nomeLocale}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

    if (EMAIL_DISABLED || !process.env.RESEND_API_KEY) {
      console.log(`[REMINDER] Turni per ${dip.nome} (${dip.email}): ${dip.turni.length} turni`)
    } else {
      await resend.emails.send({
        from: `${nomeLocale} <info@flowest.it>`,
        to: dip.email,
        subject: `I tuoi turni — ${settimanaLabel}`,
        html,
      })
    }
    inviati++
  }

  return NextResponse.json({ ok: true, inviati })
}

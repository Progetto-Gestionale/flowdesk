import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_DISABLED = process.env.DISABLE_EMAIL === 'true'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

export async function sendEmailAccessoDipendente(email: string, nome: string, username: string, loginUrl: string) {
  if (EMAIL_DISABLED || !process.env.RESEND_API_KEY) {
    console.log(`[EMAIL DIPENDENTE] Accesso per ${nome}: ${loginUrl} (username: ${username})`)
    return
  }
  await resend.emails.send({
    from: 'Flowest Staff <info@flowest.it>',
    to: email,
    subject: 'Accesso alla tua area personale',
    html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F5F6FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FB;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(11,21,51,0.08);">
        <tr><td style="background:#0B1533;padding:28px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">La tua area personale</h1>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;">Ciao <strong>${nome}</strong>,</p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;">Ecco le tue credenziali per accedere alla tua area personale:</p>
          <div style="background:#F5F6FB;border:1px solid #E6E8F2;border-left:3px solid #1F52FF;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Nome utente</p>
            <p style="margin:0;color:#1F52FF;font-size:18px;font-weight:700;font-family:monospace;">${username}</p>
          </div>
          <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Usa la password che ti è stata comunicata dal tuo responsabile. Potrai cambiarla dopo il primo accesso.</p>
          <a href="${loginUrl}" style="display:inline-block;background:#1F52FF;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;">Accedi all'area personale</a>
          <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Oppure copia questo link: ${loginUrl}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })
}

interface EmailConfermaParams {
  clienteEmail: string
  clienteNome: string
  nomeLocale: string
  tipo: string
  data?: string
  ora?: string
  coperti?: number
  allergie?: string
  occasione?: string
  servizio?: string
  messaggioProposta?: string // messaggio dell'host incluso nella proposta accettata
}

interface EmailPropostaParams extends EmailConfermaParams {
  token: string
  messaggio?: string
}

interface EmailRifiutoParams {
  clienteEmail: string
  clienteNome: string
  nomeLocale: string
  tipo: string
}

function buildDettagliRighe(p: Partial<EmailConfermaParams>) {
  const { tipo, data, ora, coperti, allergie, occasione, servizio } = p
  const isTavolo = tipo === 'tavolo'
  const dataFormattata = data
    ? new Date(data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return [
    dataFormattata && `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:120px;">Data</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#0B1533;">${dataFormattata}</td></tr>`,
    ora && `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Orario</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#0B1533;">${ora}</td></tr>`,
    isTavolo && coperti && `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Coperti</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#0B1533;">${coperti} ${coperti === 1 ? 'persona' : 'persone'}</td></tr>`,
    !isTavolo && servizio && `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Servizio</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#0B1533;">${servizio}</td></tr>`,
    allergie && allergie.toLowerCase() !== 'nessuna' && `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Allergie</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#0B1533;">${allergie}</td></tr>`,
    occasione && `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Occasione</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#0B1533;">${occasione}</td></tr>`,
  ].filter(Boolean).join('\n')
}

function wrapEmail(nomeLocale: string, headerColor: string, headerEmoji: string, titolo: string, body: string) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F5F6FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FB;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(11,21,51,0.08);">
        <tr><td style="background:${headerColor};padding:28px 32px;">
          <p style="margin:0;color:rgba(255,255,255,0.6);font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">${nomeLocale}</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">${headerEmoji ? `${headerEmoji} ` : ''}${titolo}</h1>
        </td></tr>
        <tr><td style="padding:28px 32px;">${body}</td></tr>
        <tr><td style="background:#F5F6FB;padding:16px 32px;border-top:1px solid #E6E8F2;">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">${nomeLocale}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendEmailConferma(params: EmailConfermaParams) {
  if (EMAIL_DISABLED || !process.env.RESEND_API_KEY || !params.clienteEmail) return
  const isTavolo = params.tipo === 'tavolo'
  const dettagli = buildDettagliRighe(params)

  const html = wrapEmail(
    params.nomeLocale,
    '#0B1533',
    '',
    isTavolo ? 'Prenotazione confermata' : 'Appuntamento confermato',
    `<p style="margin:0 0 20px;color:#374151;font-size:15px;">
      Ciao <strong>${params.clienteNome}</strong>,<br>
      la tua ${isTavolo ? 'prenotazione' : 'richiesta'} è stata confermata. Ecco il riepilogo:
    </p>
    ${params.messaggioProposta ? `<div style="background:#F5F6FB;border:1px solid #E6E8F2;border-left:3px solid #1F52FF;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <p style="margin:0 0 4px;color:#1F52FF;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Dettagli concordati</p>
      <p style="margin:0;color:#0B1533;font-size:14px;">${params.messaggioProposta}</p>
    </div>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-bottom:24px;">${dettagli}</table>
    <p style="margin:0;color:#6b7280;font-size:13px;">Per qualsiasi informazione o modifica, contattaci direttamente.<br>A presto!</p>`
  )

  await resend.emails.send({
    from: `${params.nomeLocale} <info@flowest.it>`,
    to: params.clienteEmail,
    subject: isTavolo ? `Prenotazione confermata — ${params.nomeLocale}` : `Appuntamento confermato — ${params.nomeLocale}`,
    html,
  })
}

export async function sendEmailProposta(params: EmailPropostaParams) {
  if (EMAIL_DISABLED || !process.env.RESEND_API_KEY || !params.clienteEmail) return
  const isTavolo = params.tipo === 'tavolo'
  const dettagli = buildDettagliRighe(params)
  const linkAccetta = `${BASE_URL}/food/risposta/${params.token}?azione=accetta`
  const linkRifiuta = `${BASE_URL}/food/risposta/${params.token}?azione=rifiuta`

  const html = wrapEmail(
    params.nomeLocale,
    '#0B1533',
    '',
    'Proposta di modifica',
    `<p style="margin:0 0 16px;color:#374151;font-size:15px;">
      Ciao <strong>${params.clienteNome}</strong>,<br>
      abbiamo ricevuto la tua richiesta e vorremmo proporti alcune modifiche.
    </p>
    ${params.messaggio ? `<div style="background:#F5F6FB;border:1px solid #E6E8F2;border-left:3px solid #1F52FF;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <p style="margin:0;color:#0B1533;font-size:14px;">${params.messaggio}</p>
    </div>` : ''}
    <p style="margin:0 0 8px;color:#374151;font-size:14px;font-weight:600;">Dettagli proposti:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E6E8F2;margin-bottom:24px;">${dettagli}</table>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;">Cosa vuoi fare?</p>
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-right:12px;">
          <a href="${linkAccetta}" style="display:inline-block;background:#1F52FF;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">Accetto</a>
        </td>
        <td>
          <a href="${linkRifiuta}" style="display:inline-block;background:#ffffff;color:#0B1533;font-size:15px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;border:2px solid #0B1533;">Rifiuto</a>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">I link scadono dopo la risposta. Per assistenza contattaci direttamente.</p>`
  )

  await resend.emails.send({
    from: `${params.nomeLocale} <info@flowest.it>`,
    to: params.clienteEmail,
    subject: `Proposta di modifica — ${params.nomeLocale}`,
    html,
  })
}

export async function sendEmailRifiuto(params: EmailRifiutoParams) {
  if (EMAIL_DISABLED || !process.env.RESEND_API_KEY || !params.clienteEmail) return
  const isTavolo = params.tipo === 'tavolo'

  const html = wrapEmail(
    params.nomeLocale,
    '#0B1533',
    '',
    isTavolo ? 'Prenotazione non disponibile' : 'Richiesta non accettata',
    `<p style="margin:0 0 16px;color:#374151;font-size:15px;">
      Ciao <strong>${params.clienteNome}</strong>,<br>
      siamo spiacenti ma al momento non possiamo accettare la tua ${isTavolo ? 'prenotazione' : 'richiesta'}.
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;">Ti invitiamo a contattarci direttamente per trovare un'alternativa.<br>Ci scusiamo per l'inconveniente.</p>`
  )

  await resend.emails.send({
    from: `${params.nomeLocale} <info@flowest.it>`,
    to: params.clienteEmail,
    subject: `${params.nomeLocale} — risposta alla tua richiesta`,
    html,
  })
}

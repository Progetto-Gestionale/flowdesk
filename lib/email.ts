import { Resend } from 'resend'
import { getBaseUrl } from '@/lib/baseUrl'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_DISABLED = process.env.DISABLE_EMAIL === 'true'

// URL di base per i link nelle email (es. Accetto/Rifiuto della prenotazione). Vedi lib/baseUrl.ts.
const BASE_URL = getBaseUrl()

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


// ── Flowest Care ────────────────────────────────────────────────────────────
// Palette brand: electric blue #1F52FF, ink navy #0B1533, zest lime #D6FB3D, mist #F5F6FB

const CARE_BLUE = '#1F52FF'
const CARE_NAVY = '#0B1533'

interface DatiSeduta {
  tipoSeduta?: string
  data?: string   // YYYY-MM-DD
  ora?: string    // HH:MM
  durata?: number
}

function fmtDataLunga(data?: string) {
  if (!data) return null
  const d = new Date(`${data}T12:00:00`)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function careRiepilogo(p: DatiSeduta) {
  const righe = [
    p.tipoSeduta && ['Trattamento', p.tipoSeduta],
    fmtDataLunga(p.data) && ['Data', fmtDataLunga(p.data)!],
    p.ora && ['Orario', p.ora],
    p.durata && ['Durata', `${p.durata} minuti`],
  ].filter(Boolean) as [string, string][]

  if (!righe.length) return ''

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FB;border-radius:12px;padding:4px 16px;margin:0 0 24px;">
    ${righe.map(([k, v]) => `<tr>
      <td style="padding:8px 0;color:${CARE_NAVY};opacity:0.5;font-size:13px;width:110px;">${k}</td>
      <td style="padding:8px 0;color:${CARE_NAVY};font-size:14px;font-weight:600;text-transform:capitalize;">${v}</td>
    </tr>`).join('')}
  </table>`
}

function wrapEmailCare(nomeStudio: string, accento: string, occhiello: string, titolo: string, body: string) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F5F6FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FB;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 2px 12px rgba(11,21,51,0.08);">
        <tr><td style="background:${CARE_NAVY};padding:28px 32px;">
          <p style="margin:0;color:rgba(255,255,255,0.45);font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">${occhiello}</p>
          <h1 style="margin:10px 0 0;color:#ffffff;font-size:23px;font-weight:800;letter-spacing:-0.01em;">${titolo}</h1>
          <div style="width:36px;height:3px;background:${accento};border-radius:2px;margin-top:14px;"></div>
        </td></tr>
        <tr><td style="padding:30px 32px;">${body}</td></tr>
        <tr><td style="background:#F5F6FB;padding:18px 32px;border-top:1px solid rgba(11,21,51,0.06);">
          <p style="margin:0;color:${CARE_NAVY};opacity:0.4;font-size:12px;text-align:center;">${nomeStudio} · gestito con Flowest Care</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

interface CarePazienteParams extends DatiSeduta {
  pazienteEmail?: string | null
  pazienteNome: string
  nomeStudio: string
}

/** Al paziente: abbiamo ricevuto la tua richiesta (in attesa di conferma) */
export async function sendEmailCareRichiestaRicevuta(p: CarePazienteParams) {
  if (EMAIL_DISABLED || !process.env.RESEND_API_KEY || !p.pazienteEmail) return

  const html = wrapEmailCare(p.nomeStudio, CARE_BLUE, p.nomeStudio, 'Richiesta ricevuta',
    `<p style="margin:0 0 22px;color:${CARE_NAVY};font-size:15px;line-height:1.6;">
      Ciao <strong>${p.pazienteNome}</strong>,<br>
      abbiamo ricevuto la tua richiesta di appuntamento. Ecco cosa hai chiesto:
    </p>
    ${careRiepilogo(p)}
    <div style="background:rgba(31,82,255,0.06);border-left:3px solid ${CARE_BLUE};border-radius:8px;padding:14px 18px;">
      <p style="margin:0;color:${CARE_NAVY};font-size:14px;line-height:1.5;">
        <strong>L'appuntamento non è ancora confermato.</strong><br>
        Riceverai una seconda email non appena lo studio avrà verificato la disponibilità.
      </p>
    </div>`
  )

  await resend.emails.send({
    from: `${p.nomeStudio} <info@flowest.it>`,
    to: p.pazienteEmail,
    subject: `Richiesta ricevuta — ${p.nomeStudio}`,
    html,
  })
}

interface CareStudioParams extends DatiSeduta {
  studioEmail?: string | null
  nomeStudio: string
  pazienteNome: string
  pazienteEmail?: string | null
  pazienteTelefono?: string | null
  note?: string | null
}

/** Al professionista: è arrivata una nuova richiesta */
export async function sendEmailCareNuovaRichiesta(p: CareStudioParams) {
  if (EMAIL_DISABLED || !process.env.RESEND_API_KEY || !p.studioEmail) return

  const contatti = [
    p.pazienteEmail && `<tr><td style="padding:8px 0;color:${CARE_NAVY};opacity:0.5;font-size:13px;width:110px;">Email</td><td style="padding:8px 0;color:${CARE_NAVY};font-size:14px;font-weight:600;">${p.pazienteEmail}</td></tr>`,
    p.pazienteTelefono && `<tr><td style="padding:8px 0;color:${CARE_NAVY};opacity:0.5;font-size:13px;">Telefono</td><td style="padding:8px 0;color:${CARE_NAVY};font-size:14px;font-weight:600;">${p.pazienteTelefono}</td></tr>`,
  ].filter(Boolean).join('')

  const html = wrapEmailCare(p.nomeStudio, '#D6FB3D', 'Nuova richiesta', p.pazienteNome,
    `<p style="margin:0 0 22px;color:${CARE_NAVY};font-size:15px;line-height:1.6;">
      Hai ricevuto una nuova richiesta di appuntamento dalla tua pagina di prenotazione.
    </p>
    ${careRiepilogo(p)}
    ${contatti ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(11,21,51,0.08);margin:0 0 22px;">${contatti}</table>` : ''}
    ${p.note ? `<div style="background:#F5F6FB;border-radius:10px;padding:14px 18px;margin-bottom:22px;">
      <p style="margin:0 0 4px;color:${CARE_NAVY};opacity:0.45;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Note del paziente</p>
      <p style="margin:0;color:${CARE_NAVY};font-size:14px;line-height:1.5;">${p.note}</p>
    </div>` : ''}
    <a href="${BASE_URL}/care/dashboard/richieste" style="display:inline-block;background:${CARE_BLUE};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 30px;border-radius:10px;">Gestisci la richiesta</a>
    <p style="margin:18px 0 0;color:${CARE_NAVY};opacity:0.4;font-size:12px;">Puoi confermare, proporre un altro orario o rifiutare.</p>`
  )

  await resend.emails.send({
    from: `Flowest Care <info@flowest.it>`,
    to: p.studioEmail,
    subject: `Nuova richiesta — ${p.pazienteNome}`,
    html,
  })
}

/** Al paziente: appuntamento confermato */
export async function sendEmailCareConferma(p: CarePazienteParams & { indirizzo?: string | null; messaggio?: string | null }) {
  if (EMAIL_DISABLED || !process.env.RESEND_API_KEY || !p.pazienteEmail) return

  const html = wrapEmailCare(p.nomeStudio, '#D6FB3D', p.nomeStudio, 'Appuntamento confermato',
    `<p style="margin:0 0 22px;color:${CARE_NAVY};font-size:15px;line-height:1.6;">
      Ciao <strong>${p.pazienteNome}</strong>,<br>
      il tuo appuntamento è confermato. Ti aspettiamo.
    </p>
    ${p.messaggio ? `<div style="background:rgba(214,251,61,0.25);border-radius:10px;padding:14px 18px;margin-bottom:22px;">
      <p style="margin:0 0 4px;color:${CARE_NAVY};opacity:0.5;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Dettagli concordati</p>
      <p style="margin:0;color:${CARE_NAVY};font-size:14px;line-height:1.5;">${p.messaggio}</p>
    </div>` : ''}
    ${careRiepilogo(p)}
    ${p.indirizzo ? `<p style="margin:0 0 18px;color:${CARE_NAVY};font-size:14px;"><span style="opacity:0.5;">Dove</span> &nbsp;<strong>${p.indirizzo}</strong></p>` : ''}
    <p style="margin:0;color:${CARE_NAVY};opacity:0.5;font-size:13px;line-height:1.6;">
      Se non puoi presentarti, avvisaci con almeno 24 ore di anticipo rispondendo a questa email.
    </p>`
  )

  await resend.emails.send({
    from: `${p.nomeStudio} <info@flowest.it>`,
    to: p.pazienteEmail,
    subject: `Appuntamento confermato — ${p.nomeStudio}`,
    html,
  })
}

/** Al paziente: appuntamento annullato / richiesta non accettata */
export async function sendEmailCareAnnullata(p: CarePazienteParams & { messaggio?: string | null }) {
  if (EMAIL_DISABLED || !process.env.RESEND_API_KEY || !p.pazienteEmail) return

  const html = wrapEmailCare(p.nomeStudio, '#E11D48', p.nomeStudio, 'Appuntamento annullato',
    `<p style="margin:0 0 22px;color:${CARE_NAVY};font-size:15px;line-height:1.6;">
      Ciao <strong>${p.pazienteNome}</strong>,<br>
      purtroppo non possiamo accogliere la tua richiesta per la data indicata.
    </p>
    ${careRiepilogo(p)}
    ${p.messaggio ? `<div style="background:#F5F6FB;border-radius:10px;padding:14px 18px;margin-bottom:22px;">
      <p style="margin:0;color:${CARE_NAVY};font-size:14px;line-height:1.5;">${p.messaggio}</p>
    </div>` : ''}
    <p style="margin:0;color:${CARE_NAVY};opacity:0.5;font-size:13px;line-height:1.6;">
      Contattaci pure per trovare un'alternativa: saremo felici di trovarti un altro spazio.
    </p>`
  )

  await resend.emails.send({
    from: `${p.nomeStudio} <info@flowest.it>`,
    to: p.pazienteEmail,
    subject: `Appuntamento annullato — ${p.nomeStudio}`,
    html,
  })
}

/** Al paziente: proposta di un orario diverso, accettabile via email */
export async function sendEmailCareProposta(p: CarePazienteParams & { token: string; messaggio?: string | null }) {
  if (EMAIL_DISABLED || !process.env.RESEND_API_KEY || !p.pazienteEmail) return

  const linkAccetta = `${BASE_URL}/care/risposta/${p.token}?azione=accetta`
  const linkRifiuta = `${BASE_URL}/care/risposta/${p.token}?azione=rifiuta`

  const html = wrapEmailCare(p.nomeStudio, '#F59E0B', p.nomeStudio, 'Nuovo orario proposto',
    `<p style="margin:0 0 22px;color:${CARE_NAVY};font-size:15px;line-height:1.6;">
      Ciao <strong>${p.pazienteNome}</strong>,<br>
      l'orario che avevi chiesto non è disponibile. Ti proponiamo questa alternativa:
    </p>
    ${careRiepilogo(p)}
    ${p.messaggio ? `<div style="background:#FFFBEB;border-left:3px solid #F59E0B;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;color:#78350F;font-size:14px;line-height:1.5;">${p.messaggio}</p>
    </div>` : ''}
    <p style="margin:0 0 14px;color:${CARE_NAVY};font-size:14px;font-weight:600;">Ti va bene?</p>
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-right:10px;">
          <a href="${linkAccetta}" style="display:inline-block;background:${CARE_BLUE};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 30px;border-radius:10px;">Accetto</a>
        </td>
        <td>
          <a href="${linkRifiuta}" style="display:inline-block;background:#ffffff;color:${CARE_NAVY};font-size:15px;font-weight:700;text-decoration:none;padding:11px 28px;border-radius:10px;border:2px solid rgba(11,21,51,0.15);">Non posso</a>
        </td>
      </tr>
    </table>
    <p style="margin:18px 0 0;color:${CARE_NAVY};opacity:0.4;font-size:12px;">
      Se accetti, l'appuntamento viene fissato subito e non devi fare altro. I link valgono una sola volta.
    </p>`
  )

  await resend.emails.send({
    from: `${p.nomeStudio} <info@flowest.it>`,
    to: p.pazienteEmail,
    subject: `Nuovo orario proposto — ${p.nomeStudio}`,
    html,
  })
}

/** Al professionista: il paziente ha risposto alla proposta */
export async function sendEmailCareRispostaProposta(p: CareStudioParams & { accettata: boolean }) {
  if (EMAIL_DISABLED || !process.env.RESEND_API_KEY || !p.studioEmail) return

  const html = wrapEmailCare(
    p.nomeStudio,
    p.accettata ? '#D6FB3D' : '#E11D48',
    'Risposta alla proposta',
    p.accettata ? `${p.pazienteNome} ha accettato` : `${p.pazienteNome} ha rifiutato`,
    `<p style="margin:0 0 22px;color:${CARE_NAVY};font-size:15px;line-height:1.6;">
      ${p.accettata
        ? 'Il paziente ha accettato il nuovo orario. L&apos;appuntamento è già stato inserito in calendario.'
        : 'Il paziente non può nell&apos;orario proposto. Lo slot è di nuovo libero.'}
    </p>
    ${careRiepilogo(p)}
    <a href="${BASE_URL}/care/dashboard/calendario" style="display:inline-block;background:${CARE_BLUE};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 30px;border-radius:10px;">Apri il calendario</a>`
  )

  await resend.emails.send({
    from: `Flowest Care <info@flowest.it>`,
    to: p.studioEmail,
    subject: p.accettata ? `Proposta accettata — ${p.pazienteNome}` : `Proposta rifiutata — ${p.pazienteNome}`,
    html,
  })
}

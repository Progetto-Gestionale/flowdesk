interface BotSettings {
  nomeLocale?: string | null
  indirizzo?: string | null
  telefono?: string | null
  sitoWeb?: string | null
  descrizioneBot?: string | null
  orariApertura?: string | null
  serviziOfferti?: string | null
  regolePrenotazione?: string | null
  menuOfferta?: string | null
  pagamenti?: string | null
  infoPratiche?: string | null
  faq?: string | null
  maxCoperti?: number | null
}

function json<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

export function buildSystemPrompt(s: BotSettings): string {
  const nome = s.nomeLocale || 'questa attività'
  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const sezioni: string[] = []

  // Istruzioni personalizzate — messe per prime, alta priorità
  if (s.descrizioneBot) sezioni.push(`## ISTRUZIONI PERSONALIZZATE (PRIORITÀ MASSIMA)\nIl titolare ha fornito le seguenti istruzioni specifiche. Seguile sempre, hanno la precedenza su tutto il resto:\n\n${s.descrizioneBot}`)

  // Info generali
  const infoGenerali: string[] = [`Nome: ${nome}`]
  if (s.indirizzo) infoGenerali.push(`Indirizzo: ${s.indirizzo}`)
  if (s.telefono) infoGenerali.push(`Telefono: ${s.telefono}`)
  if (s.sitoWeb) infoGenerali.push(`Sito web: ${s.sitoWeb}`)
  if (s.maxCoperti) infoGenerali.push(`Capienza massima: ${s.maxCoperti} coperti`)
  sezioni.push(`## LOCALE\n${infoGenerali.join('\n')}`)

  // Orari
  const orari = json<Record<string, string>>(s.orariApertura, {})
  const righeOrari = Object.entries(orari).filter(([, v]) => v).map(([g, v]) => `- ${g}: ${v}`)
  if (righeOrari.length > 0) sezioni.push(`## ORARI DI APERTURA\n${righeOrari.join('\n')}`)

  // Servizi
  const servizi = json<Record<string, boolean>>(s.serviziOfferti, {})
  const serviziAttivi = Object.entries(servizi).filter(([, v]) => v).map(([k]) => k)
  const serviziNonAttivi = Object.entries(servizi).filter(([, v]) => !v).map(([k]) => k)
  if (Object.keys(servizi).length > 0) {
    const righe = []
    if (serviziAttivi.length > 0) righe.push(`Disponibili: ${serviziAttivi.join(', ')}`)
    if (serviziNonAttivi.length > 0) righe.push(`NON disponibili: ${serviziNonAttivi.join(', ')}`)
    sezioni.push(`## SERVIZI\n${righe.join('\n')}`)
  }

  // Regole prenotazione
  const regole = json<Record<string, unknown>>(s.regolePrenotazione, {})
  const righeRegole: string[] = []
  if (regole.preavvisoMin) righeRegole.push(`Preavviso minimo: ${regole.preavvisoMin}`)
  if (regole.copertiMin) righeRegole.push(`Coperti minimi: ${regole.copertiMin}`)
  if (regole.copertiMax) righeRegole.push(`Coperti massimi per prenotazione: ${regole.copertiMax}`)
  if (regole.durataMedia) righeRegole.push(`Durata media tavola: ${regole.durataMedia}`)
  if (typeof regole.walkIn === 'boolean') righeRegole.push(`Walk-in senza prenotazione: ${regole.walkIn ? 'sì' : 'no'}`)
  if (regole.noteAggiuntive) righeRegole.push(`Note: ${regole.noteAggiuntive}`)
  if (righeRegole.length > 0) sezioni.push(`## REGOLE PRENOTAZIONI\n${righeRegole.join('\n')}`)

  // Menu
  const menu = json<Record<string, string>>(s.menuOfferta, {})
  const righeMenu: string[] = []
  if (menu.tipoCucina) righeMenu.push(`Tipo di cucina: ${menu.tipoCucina}`)
  if (menu.specialita) righeMenu.push(`Specialità: ${menu.specialita}`)
  if (menu.nonDisponibile) righeMenu.push(`Non disponibile: ${menu.nonDisponibile}`)
  if (menu.allergeniGestiti) righeMenu.push(`Allergeni e diete: ${menu.allergeniGestiti}`)
  if (righeMenu.length > 0) sezioni.push(`## MENU E OFFERTA\n${righeMenu.join('\n')}`)

  // Pagamenti
  const pag = json<string[]>(s.pagamenti, [])
  if (pag.length > 0) sezioni.push(`## PAGAMENTI ACCETTATI\n${pag.join(', ')}`)

  // Info pratiche
  const info = json<Record<string, unknown>>(s.infoPratiche, {})
  const righeInfo: string[] = []
  if (info.parcheggio) righeInfo.push(`Parcheggio: ${info.parcheggio}`)
  if (typeof info.accessibile === 'boolean') righeInfo.push(`Accessibile disabili: ${info.accessibile ? 'sì' : 'no'}`)
  if (typeof info.animali === 'boolean') righeInfo.push(`Animali ammessi: ${info.animali ? 'sì' : 'no'}`)
  if (info.dresscode) righeInfo.push(`Dress code: ${info.dresscode}`)
  if (info.altro) righeInfo.push(info.altro as string)
  if (righeInfo.length > 0) sezioni.push(`## INFO PRATICHE\n${righeInfo.join('\n')}`)

  // FAQ
  const faq = json<Array<{ domanda: string; risposta: string }>>(s.faq, [])
  const faqCompilate = faq.filter(f => f.domanda && f.risposta)
  if (faqCompilate.length > 0) {
    const righeFaq = faqCompilate.map(f => `D: ${f.domanda}\nR: ${f.risposta}`).join('\n\n')
    sezioni.push(`## DOMANDE FREQUENTI\n${righeFaq}`)
  }

  return `Sei l'assistente virtuale di ${nome}. Aiuta i clienti in modo naturale e cordiale.

DATA DI OGGI: ${oggi}

${sezioni.join('\n\n')}

## COME RACCOGLIERE LE INFORMAZIONI

Fai le domande in modo naturale e conversazionale — non come un form. Puoi raggruppare più domande in un unico messaggio. Non mandare messaggi separati solo per chiedere informazioni facoltative: se il cliente non le ha fornite spontaneamente, omettile dal riepilogo senza menzionarle.

### PRENOTAZIONE TAVOLO
**Obbligatori** (non procedere senza):
- Data e ora
- Numero di persone
- Email

**Facoltativi** (suggeriscili nel primo messaggio, ma se il cliente non risponde non insistere):
- Allergie o intolleranze — chiedi con "ci sono allergie o intolleranze da segnalare?" ma se non risponde va bene
- Occasione speciale — menzionala solo se sembra rilevante (es. prenotazione per molte persone)

### ORDINE ASPORTO
**Obbligatori**:
- Nome e cognome
- Email
- Cosa vogliono ordinare (piatti)
- Orario di ritiro

Nel campo servizio di DATI_RACCOLTI scrivi sempre "Ordine asporto".

### ORDINE DELIVERY / CONSEGNA A DOMICILIO
**Obbligatori**:
- Nome e cognome
- Email
- Cosa vogliono ordinare
- Indirizzo di consegna
- Orario di consegna

Nel campo servizio di DATI_RACCOLTI scrivi sempre "Delivery".

### CATERING / EVENTI / RICHIESTE COMPLESSE
**Obbligatori** (non procedere senza):
- Nome e cognome
- Email
- Numero di telefono
- Numero indicativo di persone
- Località / zona dell'evento

**Non chiedere** (vengono definiti direttamente con il proprietario in seguito):
- Tipo di menu, pietanze specifiche
- Orario preciso, luogo esatto
- Budget, dettagli logistici

### INFORMAZIONI GENERALI
- Nome e cognome: sempre obbligatorio
- Email: sempre obbligatoria — verifica il formato (deve avere @ e dominio tipo .com/.it); se errata chiedila di nuovo

Se il cliente chiede qualcosa che non è disponibile (servizio non attivo, orario chiuso, ecc.), digli chiaramente che non è possibile e suggerisci alternative se esistono.

Quando hai tutti i dati obbligatori, fai un riepilogo sintetico e di' chiaramente che la richiesta è stata ricevuta e che riceverà una **conferma via email** entro breve. NON dire mai che la prenotazione o l'appuntamento è già confermato — la conferma arriva solo via email dal titolare.

Poi aggiungi in fondo su riga separata (non mostrata al cliente):
DATI_RACCOLTI:{"nome":"...","email":"...","richiesta":"...","servizio":"...","dataISO":"YYYY-MM-DD","oraISO":"HH:MM","coperti":0,"allergie":"...","occasione":"..."}

## REGOLE
- Scrivi sempre in italiano
- Non inventare informazioni non presenti sopra
- Se non sai qualcosa, di' al cliente di contattarci direttamente
- Non fare più di 2 domande per messaggio`
}

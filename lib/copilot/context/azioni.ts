// Catalogo UNICO dei deep-link che l'AI può proporre come pulsanti (Dup.4). Prima le
// stesse voci (apri_menu, apri_acquisti, apri_costi, apri_staff, …) erano ridefinite
// in brief/context.ts, financial/context.ts e staff/context.ts con descrizioni un po'
// diverse. Ora l'href e la descrizione stanno qui una volta sola; ogni contesto sceglie
// gli id che gli servono con `azioni('apri_x', 'apri_y', …)`, nell'ordine voluto.
//
// La `description` serve all'AI per scegliere quale azione proporre: NON è ciò che vede
// il titolare (il pulsante mostra il label deciso dall'AI e naviga all'href). Gli href
// combaciano con la mappa ACTION_HREF del frontend (AiInsightCard.tsx).

import type { AllowedAction } from '@/lib/copilot/ai'

const CATALOGO: Record<string, AllowedAction> = {
  apri_contabilita: {
    id: 'apri_contabilita', kind: 'link', target: { href: '/food/dashboard/contabilita' },
    description: 'Apri la Contabilità per vedere la cassa del locale (incassi, costi principali, quanto resta).',
  },
  apri_acquisti: {
    id: 'apri_acquisti', kind: 'link', target: { href: '/food/dashboard/contabilita/acquisti' },
    description: 'Apri Acquisti/Bolle per registrare quanto spendi dai fornitori e confrontarlo col consumato.',
  },
  apri_menu: {
    id: 'apri_menu', kind: 'link', target: { href: '/food/dashboard/menu' },
    description: 'Apri la sezione Menu per intervenire su un piatto (prezzo, food cost, disponibilità, ordine nel menu).',
  },
  apri_costi: {
    id: 'apri_costi', kind: 'link', target: { href: '/food/dashboard/contabilita/costi' },
    description: 'Apri Costi & Personale per registrare costi fissi (affitto, utenze, servizi) o rivedere le paghe del personale.',
  },
  apri_staff: {
    id: 'apri_staff', kind: 'link', target: { href: '/food/dashboard/staff' },
    description: 'Apri Staff per rivedere i turni e il costo del personale/organico (aggiungere/togliere una persona su un certo giorno, rigenerare i turni).',
  },
  apri_impostazioni: {
    id: 'apri_impostazioni', kind: 'link', target: { href: '/food/dashboard/contabilita/impostazioni' },
    description: 'Apri Impostazioni contabili (moltiplicatore costo personale).',
  },
  apri_analytics: {
    id: 'apri_analytics', kind: 'link', target: { href: '/food/dashboard/analytics' },
    description: 'Apri Analytics per approfondire i numeri (Analisi Menu / Ordini / Tavoli).',
  },
  apri_analitica_personale: {
    id: 'apri_analitica_personale', kind: 'link', target: { href: '/food/dashboard/analytics' },
    description: 'Apri Analytics · Personale per vedere i coperti serviti per dipendente e lo storico dell’organico per giorno della settimana.',
  },
  apri_prenotazioni: {
    id: 'apri_prenotazioni', kind: 'link', target: { href: '/food/dashboard/clienti/preventivi' },
    description: 'Apri Prenotazioni tavoli per gestire le prenotazioni.',
  },
}

export type AzioneId = keyof typeof CATALOGO

// Restituisce le azioni per gli id richiesti, nell'ordine dato. Ignora id sconosciuti.
export function azioni(...ids: AzioneId[]): AllowedAction[] {
  return ids.map((id) => CATALOGO[id]).filter(Boolean)
}

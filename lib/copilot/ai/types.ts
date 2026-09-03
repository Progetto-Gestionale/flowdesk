// ─────────────────────────────────────────────────────────────────────────────
// Contratti del motore dei Brief del Copilota.
//
// Questi tipi sono AGNOSTICI sia rispetto al modello AI sia al database: lo strato
// dati deterministico (codice tuo, legato allo schema Prisma) produce un
// BriefContext; il "narratore" AI lo trasforma in un Brief. Qui dentro non si
// importa nessun SDK di modello.
// ─────────────────────────────────────────────────────────────────────────────

export type Timeframe = 'daily' | 'weekly' | 'monthly'
export type HealthStatus = 'green' | 'yellow' | 'red'
export type Urgency = 'low' | 'medium' | 'high'

// Un singolo numero GIÀ CALCOLATO. L'AI non calcola mai queste cifre: le calcola
// il tuo strato dati, in modo deterministico. L'AI le interpreta soltanto.
export interface Metric {
  // Id stabile, citato dagli insight come "evidenza". Es. "fatturato_delta_wow".
  key: string
  // Etichetta leggibile mostrata nell'interfaccia. Es. "Fatturato vs settimana scorsa".
  label: string
  // Valore già calcolato. Lo mostra il frontend, NON lo scrive l'AI nel testo.
  value: number | string
  // Unità opzionale per la formattazione lato frontend. Es. "EUR", "%", "coperti".
  unit?: string
  // Delta con segno opzionale rispetto al periodo di confronto.
  delta?: number
  // Etichetta leggibile opzionale del delta. Es. "+12% vs 7gg fa".
  deltaLabel?: string
}

// Un gruppo di metriche con un titolo, es. "Menu engineering" o "Vendite".
export interface ContextSection {
  key: string
  title: string
  metrics: Metric[]
}

// Un'azione che l'AI PUÒ proporre. Non esegue mai: esegue la tua app, dopo la
// conferma del titolare (human-in-the-loop). È la giuntura verso la Fase 2 (write).
export interface AllowedAction {
  // Id stabile che il tuo frontend/backend sa eseguire.
  id: string
  // Descrizione in parole semplici: serve all'AI per sapere QUANDO proporla.
  description: string
  // Suggerimento dei parametri che l'AI deve riempire. Nome -> descrizione.
  params?: Record<string, string>
  // Come il frontend esegue l'azione: 'link' = navigazione; le altre = scrittura
  // con conferma (human-in-the-loop). Assente = trattata come 'link'.
  kind?: 'link' | 'sposta_in_cima' | 'cambia_prezzo' | 'imposta_disponibilita' | 'imposta_aliquota'
  // Payload FIDATO per l'esecuzione, riempito dal NOSTRO codice (non dall'AI):
  // l'AI sceglie solo l'id, i parametri veri (piatto, prezzo suggerito…) arrivano da qui.
  target?: {
    href?: string
    piattoId?: string
    piattoNome?: string
    prezzoAttuale?: number // prezzo corrente (lordo), per mostrare "da X a Y"
    prezzoSuggerito?: number // prezzo proposto dal codice per rientrare nel margine medio
    aliquota?: number // per imposta_aliquota
    disponibile?: boolean // per imposta_disponibilita
  }
}

// Input deterministico del narratore. Prodotto interamente dal tuo codice.
export interface BriefContext {
  restaurantId: string
  timeframe: Timeframe
  period: { start: string; end: string } // date ISO
  locale: string // es. "it-IT"
  restaurantName?: string
  sections: ContextSection[]
  // Azioni che l'AI può proporre per questo brief.
  allowedActions: AllowedAction[]
  // Semaforo DETERMINISTICO (calcolato dal codice, es. dal margine netto della
  // contabilità). Se presente, sovrascrive lo status scelto dall'AI: un dato
  // certo non va lasciato all'interpretazione del modello. Assente = decide l'AI.
  statusHint?: HealthStatus
  // Solo per periodi di CALENDARIO che possono essere ancora in corso (contabilità:
  // oggi/settimana/mese/anno correnti). Se `inProgress`, i totali sono PARZIALI: il
  // narratore deve dichiararlo e NON deve confrontare un periodo parziale con uno
  // concluso come se fosse definitivo. Assente = periodo concluso o finestra mobile.
  periodProgress?: {
    inProgress: boolean
    elapsedDays: number // giorni già trascorsi del periodo (min 1)
    totalDays: number // giorni totali del periodo
    pct: number // 0..100, quota del periodo trascorsa
  }
}

// Un punto del "perché". `evidence` cita i Metric.key presenti nel contesto.
export interface Insight {
  title: string
  detail: string
  // Chiavi delle metriche che sostengono l'insight. Per tracciabilità/rendering.
  evidence: string[]
}

// Un'azione concreta proposta dall'AI, pronta a diventare un pulsante di conferma.
export interface ProposedAction {
  // Garantito essere uno degli AllowedAction.id presenti nel contesto.
  id: string
  label: string
  urgency: Urgency
  params?: Record<string, unknown>
}

// L'output del narratore: il contratto UX fisso a 3 blocchi.
export interface Brief {
  status: HealthStatus // blocco 1: semaforo
  headline: string // riga unica di sintesi dello stato
  why: Insight[] // blocco 2: massimo 2 punti
  actions: ProposedAction[] // blocco 3: pulsanti di conferma
  meta: {
    timeframe: Timeframe
    period: { start: string; end: string }
    provider: string
    generatedAt: string
  }
}

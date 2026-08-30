import type { BriefContext } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Costruisce il JSON Schema a cui l'output del narratore deve conformarsi. Gli id
// delle azioni sono vincolati (enum) alle azioni consentite del contesto: così il
// modello NON può, a livello di schema, emettere un'azione che non esiste.
// (La validazione lato codice in narrator.ts è comunque la rete finale.)
// ─────────────────────────────────────────────────────────────────────────────

export function buildBriefSchema(context: BriefContext): Record<string, unknown> {
  const actionIds = context.allowedActions.map((a) => a.id)

  return {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'headline', 'why', 'actions'],
    properties: {
      status: { type: 'string', enum: ['green', 'yellow', 'red'] },
      headline: { type: 'string' },
      why: {
        // NB: niente 'maxItems' — gli structured output non supportano i vincoli
        // numerici sugli array (l'API risponde 400). Il limite di 2 è garantito
        // dal prompt e dal codice (narrator.enforceGrounding → slice(0, 2)).
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'detail', 'evidence'],
          properties: {
            title: { type: 'string' },
            detail: { type: 'string' },
            evidence: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'label', 'urgency'],
          // NB: niente 'params' qui. Gli structured output vogliono
          // additionalProperties:false su ogni oggetto, incompatibile con un
          // oggetto params a chiavi libere. In Fase A i params non servono (le
          // azioni sono deep-link). In Fase 2 si tipizzeranno per-azione.
          properties: {
            id: actionIds.length
              ? { type: 'string', enum: actionIds }
              : { type: 'string' },
            label: { type: 'string' },
            urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
        },
      },
    },
  }
}

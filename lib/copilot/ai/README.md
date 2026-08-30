# Copilota — Strato AI agnostico (motore dei Brief)

Questo modulo è il **narratore** dei brief: prende un contesto di dati **già calcolati**
e produce un brief a 3 blocchi (semaforo / perché / azioni). È **agnostico rispetto al
provider**: Claude e Gemini sono intercambiabili con una riga di config, perché il
narratore parla solo l'interfaccia `AIProvider`.

## Architettura a 3 strati (regola d'oro)

```
[1] Strato dati (TUO codice, deterministico)  →  BriefContext   (numeri veri, in SQL/TS)
[2] Narratore AI (questo modulo)              →  Brief          (interpreta, non calcola)
[3] Frontend                                   →  i numeri li stampa dal context, non dal testo AI
```

**L'AI non calcola e non inventa numeri.** Cita solo le metriche presenti nel contesto
(via `evidence`). I numeri "ufficiali" li renderizza il frontend dal `BriefContext`.
`narrator.ts` fa un `enforceGrounding` che **scarta** a livello di codice ogni chiave o
azione non presente nel contesto: è una garanzia, non solo una richiesta al prompt.

## File

| File | Ruolo |
|---|---|
| `types.ts` | Contratti: `BriefContext` (input), `Brief` (output), `Metric`, `AllowedAction`… |
| `provider.ts` | L'interfaccia `AIProvider` (la giuntura) + `parseJsonLoose` |
| `providers/claude.ts` | Provider Claude (output strutturato + caching del system) |
| `providers/gemini.ts` | Provider Gemini (import lazy dell'SDK Google) |
| `registry.ts` | `getProvider()` — sceglie dal flag `COPILOT_AI_PROVIDER` |
| `schema.ts` | JSON Schema dinamico (vincola gli id azione a quelli consentiti) |
| `prompts.ts` | System prompt fisso (la tesi: spiega il perché, proponi il come) |
| `narrator.ts` | `generateBrief(context)` — il motore |
| `index.ts` | API pubblica: `import { generateBrief } from '@/lib/copilot/ai'` |

## Config (env)

```bash
COPILOT_AI_PROVIDER=claude          # 'claude' (default) | 'gemini'
ANTHROPIC_API_KEY=...               # già presente per la chat del Copilota
COPILOT_BRIEF_MODEL=claude-haiku-4-5  # opzionale; per più qualità: claude-sonnet-5

# Solo se usi Gemini (prima: npm i @google/generative-ai)
GEMINI_API_KEY=...
COPILOT_GEMINI_MODEL=gemini-2.0-flash
```

Vuoi confrontare i due? Imposta `COPILOT_AI_PROVIDER=gemini`, rigenera lo stesso brief e
paragona costo/qualità sui tuoi ristoranti veri. Nessuna riscrittura.

## Come si usa (uguale per cron e chat: UN motore, due ingressi)

```ts
import { generateBrief, type BriefContext } from '@/lib/copilot/ai'

// 1) Lo strato dati (DA SCRIVERE) costruisce il contesto dai TUOI dati Prisma.
//    Qui i numeri sono già calcolati: incassi, delta WoW, margini per piatto…
const context: BriefContext = await buildBriefContext(userId, 'weekly')

// 2) Il narratore lo trasforma in brief.
const { brief, usage } = await generateBrief(context)

// 3) usa `usage` per il tuo tracciamento spesa (vedi app/api/copilot/route.ts →
//    registraSpesa), e restituisci `brief` al frontend che disegna i 3 blocchi.
```

`buildBriefContext` è **specifico del tuo schema** e va scritto nel prossimo step
(non è qui perché dipende dalle tabelle reali). Esempio di forma attesa:

```ts
const context: BriefContext = {
  restaurantId: userId,
  timeframe: 'weekly',
  period: { start: '2026-08-24', end: '2026-08-30' },
  locale: 'it-IT',
  restaurantName: user.nomeLocale,
  sections: [
    {
      key: 'vendite', title: 'Vendite',
      metrics: [
        { key: 'fatturato_wow', label: 'Fatturato vs settimana scorsa', value: 8420, unit: 'EUR', delta: 5, deltaLabel: '+5%' },
        { key: 'scontrino_medio', label: 'Scontrino medio', value: 27, unit: 'EUR' },
      ],
    },
    {
      key: 'menu', title: 'Menu engineering',
      metrics: [
        { key: 'tortelli_margine', label: 'Margine Tortelli di zucca', value: 78, unit: '%' },
        { key: 'tortelli_qta', label: 'Tortelli venduti', value: 5, unit: 'porzioni' },
      ],
    },
  ],
  allowedActions: [
    { id: 'sposta_piatto_in_cima', description: 'Sposta un piatto in cima al menu digitale', params: { piatto: 'nome del piatto' } },
  ],
}
```

## Prossimi step (nel repo)

1. **`buildBriefContext(userId, timeframe)`** — lo strato dati: query Prisma + calcoli
   deterministici (fatturato, delta WoW, menu engineering con il food cost del piatto
   che già hai). Questo è il vero lavoro, ed è dove il progetto diventa utile.
2. **Endpoint** `app/api/copilot/brief/route.ts` — chiama `generateBrief` on-demand.
3. **Cron** — stesso `generateBrief`, a orario, per il brief automatico.
4. **UI a 3 blocchi** — semaforo, il perché, i pulsanti azione (Fase 2: con conferma).

Fase A (giornaliero + settimanale, Vendite + Prenotazioni + Menu engineering, sola
lettura) è il punto di partenza: dati che già hai, dimostra la tesi.

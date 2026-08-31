# Flowest Food — Modulo **Contabilità / Controllo di Gestione**
### Progetto tecnico completo (v1)

> Documento di progetto, non codice pronto. Ancorato allo schema e alle convenzioni reali del repo (`schema.prisma`, `lib/copilot`, `getAuthUser`, `MenuPiatto.foodCost`, `RigaOrdine.foodCost`, `Timbratura`, `Turno`, `exceljs`, `@anthropic-ai/sdk`).

---

## 0. Principio guida (la tesi del prodotto)

Il ristoratore fallisce per **una** ragione contabile ricorrente: guarda la **cassa** (lordo) e la scambia per **guadagno**. La cassa piena del sabato contiene già soldi che non sono suoi — IVA da versare, fornitori, personale, quota dei costi fissi. Lunedì è tecnicamente in perdita senza saperlo.

Il modulo Contabilità esiste per **rendere visibile in tempo reale la differenza tra "cassa" e "soldi realmente tuoi"**, e per accantonare automaticamente ciò che non è suo.

Non sostituisce il commercialista. Fa due cose che il commercialista **non** fa:
1. **Dati puliti ed esportabili** (netto, IVA per aliquota, prima nota) da consegnare al commercialista.
2. **Interpretazione AI quotidiana**: cosa sta succedendo e cosa fare, senza leggere tabelle.

### Le due sezioni restano separate (decisione architetturale)

| | **Analytics** (esiste già) | **Contabilità** (nuovo) |
|---|---|---|
| Dominio | Operativo / servizio | Finanziario / gestionale |
| Numeri | **Lordo**, coperti, ordini, classifiche piatti, performance camerieri | **Netto** (imponibile), IVA, food/labor/fixed cost, margine reale, cassetto fiscale |
| Chi la vede | Owner + (in prospettiva) capiturno | **Solo Owner** |
| Scopo | Governare il servizio mentre è aperto | Capire se il locale guadagna davvero |

L'**AI è il ponte**: unisce il comportamento operativo (Analytics) con l'impatto economico (Contabilità) e produce un verdetto in 3 righe.

> ⚠️ **Regola d'oro contabile** che governa tutto lo schema: il food cost e i margini si calcolano **sempre al NETTO IVA**. L'IVA sugli acquisti è una partita di giro (IVA a credito), **non è un costo**. Chi inserisce food cost con IVA sballa tutti i margini.

---

## 1. Fondamenta contabili (le formule che il codice deve implementare)

### 1.1 Scorporo IVA sulle vendite (IVA a debito)
I prezzi in `MenuPiatto.prezzo`, `RigaOrdine.prezzo`, `Ordine.totale` sono **lordi** (quello che paga il cliente). Da lì si scorpora:

```
imponibile = lordo / (1 + aliquota)
iva_debito = lordo - imponibile
```

Esempio panino 12 € al 10%: imponibile 10,91 € · IVA a debito 1,09 €.

**Aliquota di vendita**: default **10%** (somministrazione al tavolo, cibo + bevande servite). Ma va resa **configurabile per canale e categoria**, perché:
- Tavolo (somministrazione) → 10%
- Asporto/Delivery → alcuni prodotti restano 10%, alcune bevande (alcolici, alcune bibite) → 22%

→ Vedi campo `aliquotaVendita` su `MenuCategoria`/`MenuPiatto` (§2.2).

### 1.2 IVA sugli acquisti (IVA a credito) — **neutra, non è food cost**
Sulle fatture fornitori l'IVA è variabile per prodotto:
- 4% → pane, farina, verdura, latte
- 10% → carne, pesce, uova, cereali
- 22% → vino, alcolici, acqua in bottiglia, bibite, packaging, detersivi, servizi

Il ristoratore la paga al fornitore e **la recupera** compensandola. Quindi:

```
food_cost_reale = SOLO imponibile della fattura (senza IVA)
iva_credito     = imponibile * aliquota_acquisto
```

### 1.3 Liquidazione IVA (il "cassetto fiscale virtuale")
Ogni sera a chiusura:

```
iva_netta_periodo = Σ iva_debito(vendite) - Σ iva_credito(acquisti)
```

Questa cifra viene **congelata** in un fondo tasse virtuale e **sottratta** dal "fatturato spendibile". Widget: *"Oggi hai accumulato 120 € di debito IVA verso lo Stato. Già messi da parte nel tuo fondo."*

### 1.4 Conto economico gestionale (il P&L reale, in cascata)

```
Fatturato Lordo                    (da Ordine.totale — già disponibile)
− IVA a debito (scorporo)          →  = Fatturato Netto / Imponibile
− Food & Beverage cost (netto)     →  = Primo Margine (contribuzione)
− Labor cost (netto azienda)       →  = Margine dopo personale
− Costi fissi (quota del periodo)  →  = EBITDA gestionale
− Accantonamento imposte (stima %) →  = Utile netto stimato
```

Il **Break-Even giornaliero** = (costi fissi mensili / 30) + labor medio giornaliero, confrontato col fatturato netto del giorno.

### 1.5 "Soldi realmente tuoi spendibili oggi" (il Semaforo Anti-Fallimento)
Formula a strati, dal più grezzo al più fine (l'MVP può fermarsi al livello 1):

```
Livello 1 (MVP):  spendibile = lordo − iva_debito − food_cost_venduto
Livello 2:        − quota_giornaliera_costi_fissi
Livello 3:        − labor_cost_del_giorno
Livello 4:        − accantonamento_imposte_stimato
```

Dashboard: `Cassa Totale: 2.000 €` e sotto, in grassetto, `Soldi realmente tuoi: 650 €`.

---

## 2. Modello dati (delta sullo schema esistente)

Convenzione: tutto scoping su `userId` (il tenant = `User`), come nel resto dello schema. Nessun nuovo concetto di "ristorante": **il `User` è il locale**.

### 2.1 Cosa esiste già e si riusa
- `Ordine.totale`, `Ordine.tipo` (tavolo/asporto/delivery), `RigaOrdine.prezzo/quantita` → **base delle vendite lorde** (già in Analytics).
- `RigaOrdine.foodCost` (snapshot €/porzione all'ordine) → **food cost storicizzato per riga venduta**. Oro per il conto economico: non va ricalcolato, è già fotografato.
- `MenuPiatto.foodCost` → food cost corrente del piatto (il "manuale" del modello ibrido §4 esiste già di fatto).
- `Timbratura` (entrata/uscita) + `Turno` (pianificato) → **ore reali** per il labor cost.
- `Dipendente` → anagrafica su cui appendere paga e moltiplicatore.

### 2.2 IVA sulle vendite — modifiche a modelli esistenti
```prisma
model MenuCategoria {
  // ...
  aliquotaVendita Float @default(0.10) // 0.10 tavolo, override per asporto/alcolici
}
model MenuPiatto {
  // ...
  aliquotaVendita  Float?   // override sul singolo piatto; null = eredita dalla categoria
  calcoloAutomatico Boolean @default(false) // false = usa foodCost manuale (già oggi); true = da ricetta
}
model RigaOrdine {
  // ...
  aliquotaVendita Float? // snapshot dell'aliquota al momento dell'ordine (come già fa foodCost)
}
```
> Snapshot dell'aliquota su `RigaOrdine` per lo stesso motivo per cui `foodCost` è snapshottato: la contabilità storica non deve cambiare se domani ritocchi le aliquote.

### 2.3 Food cost teorico — nuove tabelle (Ingredienti / Ricette)
```prisma
model Ingrediente {
  id                String   @id @default(cuid())
  userId            String
  nome              String
  categoriaMerc     String   // "carne" | "pesce" | "verdura" | "latticini" | "alcolici" | "packaging" | ...
  unita             String   @default("kg") // "kg" | "l" | "pz"
  prezzoUnitarioNetto Float  // SEMPRE netto IVA (imponibile / unità)
  aliquotaAcquisto  Float    @default(0.10) // 0.04 | 0.10 | 0.22 — per l'IVA a credito
  aggiornatoAt      DateTime @updatedAt
  fonteUltimoPrezzo String?  // "bolla:<fatturaId>" | "manuale"
  user              User     @relation(fields: [userId], references: [id])
  righeRicetta      RicettaRiga[]
  righeFattura      FatturaRiga[]
  @@index([userId])
}

model RicettaRiga {           // tabella di giunzione piatto↔ingrediente
  id           String  @id @default(cuid())
  userId       String
  piattoId     String
  ingredienteId String
  quantita     Float           // in unità dell'ingrediente (es. 0.200 kg)
  piatto       MenuPiatto  @relation(fields: [piattoId], references: [id], onDelete: Cascade)
  ingrediente  Ingrediente @relation(fields: [ingredienteId], references: [id])
  @@index([piattoId])
  @@index([ingredienteId])
}
```
> `MenuPiatto` guadagna `righeRicetta RicettaRiga[]`. Food cost teorico = `Σ (quantita × prezzoUnitarioNetto)`.

### 2.4 Fatture / bolle fornitori (food cost reale + IVA a credito)
```prisma
model Fattura {
  id            String   @id @default(cuid())
  userId        String
  fornitore     String?
  numero        String?
  data          DateTime
  totaleLordo   Float
  totaleImponibile Float
  totaleIva     Float
  categoria     String?  // macro-categoria prevalente (merci/utenze/servizi...)
  origine       String   @default("foto") // "foto" | "manuale" | "xml_sdi"
  statoOcr      String   @default("da_verificare") // "da_verificare" | "confermata"
  fileUrl       String?  // foto/PDF nel bucket (o base64 come DocumentoPaziente per dati sensibili)
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])
  righe         FatturaRiga[]
  @@index([userId, data])
}

model FatturaRiga {
  id            String  @id @default(cuid())
  userId        String
  fatturaId     String
  descrizione   String
  ingredienteId String?          // match (fuzzy o confermato) all'anagrafica ingredienti
  quantita      Float?
  unita         String?
  prezzoNetto   Float            // imponibile riga
  aliquota      Float            // 0.04 | 0.10 | 0.22
  fattura       Fattura     @relation(fields: [fatturaId], references: [id], onDelete: Cascade)
  ingrediente   Ingrediente? @relation(fields: [ingredienteId], references: [id])
  @@index([fatturaId])
}
```

### 2.5 Labor cost — modifiche a `Dipendente` + costo turno
```prisma
model Dipendente {
  // ...
  pagaOrariaBaseNetta       Float?  // € che vanno in tasca al dipendente
  moltiplicatoreCostoAzienda Float  @default(1.40) // +40% INPS/INAIL/TFR/13ª/14ª
  // costo_orario_reale = pagaOrariaBaseNetta * moltiplicatoreCostoAzienda  (calcolato, non salvato)
}
```
Costo del turno: due strade, non mutuamente esclusive.
- **Da timbratura** (`Timbratura` entrata/uscita già esistono): ore reali × costo orario.
- **Override tariffa** per eventi/straordinari → nuovo campo su `Turno` (o record dedicato):
```prisma
model Turno {
  // ...
  tipoTariffa    String  @default("ordinario") // "ordinario"|"straordinario"|"festivo_evento"|"forfait"
  maggiorazione  Float   @default(1.0)         // 1.15, 1.30, 1.50...
  forfaitImporto Float?                        // se tipoTariffa="forfait": costo fisso del giorno, ignora le ore
}
```
Formula: `costo_turno = ore × costo_orario_reale × maggiorazione` (oppure `forfaitImporto`).

### 2.6 Costi fissi (config una volta → rateo giornaliero)
```prisma
model CostoFisso {
  id            String   @id @default(cuid())
  userId        String
  voce          String   // "Affitto" | "Commercialista" | "Luce" | "TARI" | "SIAE" | "SaaS" ...
  categoria     String   // "affitto" | "utenze" | "servizi" | "personale_extra" | "marketing" | "leasing"
  importoNetto  Float
  aliquota      Float    @default(0.22)
  periodicita   String   @default("mensile") // "mensile" | "annuale" | "trimestrale"
  attivo        Boolean  @default(true)
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])
  @@index([userId])
}
```
Rateo: `quota_giornaliera = Σ importoNetto_normalizzato_mensile / 30`. Normalizzazione: annuale/12, trimestrale/3. Nessun inserimento quotidiano — si configura una volta.

### 2.7 Snapshot contabile giornaliero (cache + storicizzazione)
Per non ricalcolare tutto ogni volta e per congelare i valori storici:
```prisma
model ChiusuraGiorno {
  id                String   @id @default(cuid())
  userId            String
  data              DateTime // giorno (fuso Europe/Rome, come romeTime.ts)
  fatturatoLordo    Float
  ivaDebito         Float
  fatturatoNetto    Float
  foodCostVenduto   Float
  laborCost         Float
  quotaCostiFissi   Float
  ivaCredito        Float    // dalle fatture del giorno
  ivaNetta          Float
  accantonamentoImposte Float
  utileStimato      Float
  spendibile        Float
  createdAt         DateTime @default(now())
  user              User     @relation(fields: [userId], references: [id])
  @@unique([userId, data])
  @@index([userId, data])
}
```
> Calcolata da un cron serale (esiste già `app/api/cron`) o on-demand al primo accesso del giorno. I mesi si aggregano da qui.

### 2.8 Config contabile del locale
Piccola tabella 1:1 con `User` (come `MenuStampaConfig`):
```prisma
model ContabilitaConfig {
  id                    String @id @default(cuid())
  userId                String @unique
  aliquotaVenditaDefault Float @default(0.10)
  percentualeAccantonamentoImposte Float @default(0.15) // % sul margine → fondo tasse
  regimeFiscale         String @default("ordinario")     // "ordinario" | "forfettario" | ...
  moltiplicatoreLaborDefault Float @default(1.40)
  user                  User   @relation(fields: [userId], references: [id])
}
```

---

## 3. Motore IVA — dove si aggancia nel codice

- **Vendite**: nessun nuovo dato di transazione. Si legge `RigaOrdine` (già scritto dal flusso ordini) e si scorpora con `aliquotaVendita`. Lo scorporo è una funzione pura in `lib/contabilita/iva.ts`.
- **Acquisti**: da `FatturaRiga.prezzoNetto × aliquota`.
- **Snapshot aliquota**: quando un ordine si chiude, scrivere `RigaOrdine.aliquotaVendita` (come già si scrive `foodCost`). Migrazione: per gli ordini storici, backfill con la default 10%.

`lib/contabilita/iva.ts` (funzioni pure, testabili):
```
scorpora(lordo, aliquota) -> { imponibile, iva }
ivaCredito(righeFattura[]) -> number
liquidazione(ivaDebito, ivaCredito) -> ivaNetta
```

---

## 4. Food cost: teorico + reale + modello ibrido (interruttore)

Il campo `MenuPiatto.foodCost` **è già** il "manuale". Aggiungiamo solo `calcoloAutomatico`:

```
IF piatto.calcoloAutomatico == true:
    food_cost = Σ righeRicetta( quantita × ingrediente.prezzoUnitarioNetto )
ELSE:
    food_cost = piatto.foodCost   // valore bloccato inserito a mano (comportamento attuale)
```

**Interruttore per singolo piatto** (non globale): il ristoratore traccia in automatico i secondi di pesce e lascia a mano le patatine. UX: toggle "Automatico / Manuale" nella scheda piatto; in Automatico compare la lista ingredienti, in Manuale un solo campo "Food cost stimato (senza IVA)".

**Pipeline foto bolla → aggiornamento a cascata**:
1. Foto/PDF → OCR (vedi §8.2) → JSON righe fattura.
2. Per ogni riga, calcola prezzo unitario netto = `prezzoNetto / quantita`.
3. Match all'`Ingrediente` (fuzzy sul nome, conferma dell'owner alla prima volta).
4. `updateIngredientPrice(ingredienteId, nuovoPrezzo)` → aggiorna `Ingrediente.prezzoUnitarioNetto`.
5. **Effetto a catena**: tutti i `MenuPiatto` con `calcoloAutomatico=true` che usano quell'ingrediente hanno il food cost ricalcolato in lettura (non serve riscrivere i piatti — il food cost automatico è derivato).

**Decisione**: il prezzo dalla bolla si registra **in bozza** (`Fattura.statoOcr="da_verificare"`) e l'owner conferma. Evita che un OCR sbagliato sballi i margini in automatico. L'alert margine parte **dopo** la conferma.

Alert AI risultante:
> 🚨 *Bolla Fornitore Rossi: Salmone +11% (18→20 €/kg). Il piatto "Salmone al forno" passa a 4,00 € di food cost, margine −3%. Vuoi portarlo a 16,50 €?* `[Aggiorna Menu]`

---

## 5. Labor cost — come si calcola davvero

1. **Anagrafica** (una volta): `pagaOrariaBaseNetta` + `moltiplicatoreCostoAzienda` (default 1.40). Costo orario reale = prodotto dei due.
2. **Ore**: due modalità già supportabili dallo schema —
   - **Timbratura digitale** (`Timbratura` entrata/uscita esiste già, c'è pure `qrTimbraturaFisso` e `/timbrature`): ore reali automatiche.
   - **Inserimento a fine giornata** dal `Turno`.
3. **Tariffe** (`tipoTariffa` + `maggiorazione`/`forfaitImporto`): ordinario 1×, straordinario/notturno +15/20%, festivo/evento +30/50%, forfait fisso.

Esempio: Marco, costo reale 12,60 €/h, Capodanno 6 h, evento +50% → `6 × 12,60 × 1,50 = 113,40 €` → scritto nel labor cost del giorno.

Insight AI:
> *Questa settimana 15 h di straordinario in sala: labor +250 € vs media. Conviene un extra a chiamata il prossimo weekend.*

**Decisione target**: default **timbratura da tablet** (già c'è l'infrastruttura), con fallback inserimento manuale ore. Non forzare — molti locali piccoli preferiscono il tabellone.

---

## 6. Sezione Contabilità — dati e UX

### 6.1 I 4 blocchi di dati puri
- **A · Ricavi netti**: fatturato imponibile, split per reparto (`MenuCategoria.reparto` esiste: Cucina/Bar/Pizzeria/Cantina) e per canale (tavolo/asporto/delivery).
- **B · Spese variabili (food/beverage)**: uscite fornitori nette, split per `categoriaMerc`.
- **C · Spese fisse e semi-variabili**: labor cost (`Dipendente`+`Turno`+`Timbratura`), overheads (`CostoFisso`).
- **D · Cassetto fiscale**: saldo IVA del periodo + accantonamento imposte stimato.

### 6.2 UX del resoconto istantaneo — "La Sintesi del Titolare" (in cima)
- **🟢 Blocco 1 — Semaforo**: badge Verde/Giallo/Rosso sul margine netto del mese. *"Locale in SALUTE (margine 16,5%). Guadagno reale netto: 4.230 €."*
- **🔍 Blocco 2 — Il "perché"** (un fattore da Analytics + uno da Contabilità): *"Merito Pizzeria: farina economica + vendite pizze speciali +24%. Attenzione: bolletta luce +12%."*
- **⚡ Blocco 3 — Azioni 1-click**: `[Esporta per il Commercialista]` · `[Ottimizza Prezzi Menu]` (l'AI propone i 3 piatti da ritoccare per coprire l'aumento costi).

Sotto la sintesi: le tabelle di dettaglio, **collassate** — approfondimento opzionale, non obbligatorio.

### 6.3 Rotte
- Pagine: `app/food/dashboard/contabilita/` → `page.tsx` (sintesi), `costi/`, `iva/`, `personale/`, `impostazioni/`, `export/`.
- API sotto `app/api/contabilita/`: `chiusura-giorno`, `costi-fissi`, `fatture`, `ingredienti`, `ricette`, `labor`, `summary`, `export`.

---

## 7. Il ponte AI (Analytics ↔ Contabilità)

Si innesta sul **motore copilot già esistente** (`lib/copilot/prompt.ts`, `tools.ts`, `brief/`, `/api/copilot`), **non** un secondo sistema.

### 7.1 `getAiFinancialSummary(userId, timeframe)` in `lib/copilot/contabilita.ts`
Due query, un JSON già masticato per il prompt (il modello **non** deve fare calcoli):
- da **Analytics**: fatturato lordo, coperti, ordini, top piatti per quantità, performance camerieri.
- da **Contabilità**: fatturato netto, food cost, IVA netta, labor, costi fissi, margine, trend vs periodo precedente.

L'oggetto va al modello che restituisce i 3 blocchi (semaforo + perché + azioni) in **structured output** — stesso pattern del brief attuale (`additionalProperties:false` ovunque, come da fix già presente in git).

### 7.2 Nuovi tool per l'agente copilot (`lib/copilot/tools.ts`)
Sola lettura in Fase 1 (coerente con la memoria "Copilota AI · Fase 1 sola lettura"):
- `leggiContoEconomico(timeframe)`
- `leggiCassettoFiscale(timeframe)`
- `leggiMargineePiatti()` → margine per piatto (prezzo netto − food cost)
- (Fase 2, scrittura con conferma) `proponiPrezzoPiatto(piattoId, nuovoPrezzo)`, `spostaPiattoInCima` esiste già come precedente di "azione reale".

### 7.3 Brief mensile contabile
Nuovo tipo di brief accanto ai brief operativi esistenti (`lib/copilot/brief/`): Giornaliero (cassetto IVA + spendibile), Settimanale (labor + margini), Mensile (verdetto + azioni). Il costo AI confluisce in `CopilotUsage` (già tracciato da `lib/copilot/spesa.ts`).

> **Nell'area Analytics l'AI NON parla mai di tasse/margini** (la vedono anche i capiturno un domani): lì resta operativa ("tavolo 5 in ritardo di 12 min"). I dati finanziari appaiono **solo** in Contabilità.

---

## 8. Automazioni di inserimento (o il ristoratore scappa)

### 8.1 Costi fissi — inseriti UNA volta
Config iniziale (`CostoFisso`), poi rateo giornaliero automatico. Zero data-entry quotidiano.

### 8.2 Costi variabili — 1 foto
OCR della bolla → JSON righe. La memoria/testo di partenza cita Gemini 2.0 Flash, **ma il repo ha già `@anthropic-ai/sdk`**: usare **Claude con vision** come default (nessuna nuova dipendenza, stesso tracking spesa via `CopilotUsage`), Gemini opzionale/futuro. In prospettiva: import **XML fattura elettronica SdI** (`origine="xml_sdi"`) → zero OCR, dati esatti.

### 8.3 Modello ibrido food cost — §4 (toggle per piatto).

---

## 9. Permessi (ACL) — owner-only

**Buona notizia: è già garantito per costruzione.**
- La dashboard `app/food/dashboard/*` è interamente Clerk-gated (`getAuthUser`), e i **dipendenti** usano un auth separato (`dip_session` JWT, `lib/dipendenteAuth.ts`) che vive **solo** sulle pagine pubbliche (cameriere, timbratura).
- Quindi tutto ciò che sta sotto `app/food/dashboard/contabilita` e `app/api/contabilita/*` è **accessibile solo al titolare**.

**Da fare esplicitamente**:
- Ogni route `/api/contabilita/*` inizia con `getAuthUser()` e scoping `userId` (mai `verifyDipToken`).
- Se un domani si aprono gli Analytics ai capiturno, introdurre un ruolo (`User`→sub-utenti o un campo ruolo sui `Dipendente` con login owner-side): la Contabilità resta comunque esclusa. Per ora **non serve**.

---

## 10. Export per il commercialista

`exceljs` **è già una dipendenza** → nessuna installazione.
- **Registro IVA** (vendite/acquisti per aliquota, per periodo) → XLSX/CSV.
- **Prima nota** semplificata (incassi, uscite fornitori, costi fissi) → XLSX/CSV.
- **Conto economico gestionale** del mese → PDF (leggibile) + XLSX (dati).
- Bottone `[Esporta per il Commercialista]` genera lo ZIP/foglio del periodo selezionato.

**Invio email mensile automatico** (`resend` già presente): opzionale, config in `ContabilitaConfig`. Default: report **privato** nel software; l'owner attiva l'invio se vuole. (Da confermare — §13.)

---

## 11. Roadmap in fasi

| Fase | Obiettivo | Contenuto |
|---|---|---|
| **F1 — Fondamenta IVA + Semaforo (MVP)** | Rendere visibile "soldi tuoi" | `aliquotaVendita` (config + snapshot), `lib/contabilita/iva.ts`, widget Semaforo Livello 1 (lordo − IVA − food cost venduto da `RigaOrdine.foodCost`), `ChiusuraGiorno`, cron serale. **Nessun OCR, nessuna ricetta.** |
| **F2 — Costi completi** | Conto economico reale | `CostoFisso` + rateo, labor cost (`Dipendente` paga + `Turno` tariffe + `Timbratura`), Semaforo Livelli 2-4, sezione Contabilità coi 4 blocchi + export commercialista. |
| **F3 — Food cost automatico** | Margini per piatto | `Ingrediente`/`RicettaRiga`, toggle ibrido, OCR bolle (Claude vision), aggiornamento prezzi a cascata, alert margini. |
| **F4 — Ponte AI** | Verdetto in 3 righe | `getAiFinancialSummary`, nuovi tool copilot (sola lettura), brief contabile mensile, azioni 1-click (proponi prezzo). |
| **F5 — Integrazioni** | Meno data-entry | Import XML fattura elettronica SdI, invio email mensile automatico, ruoli/ACL avanzati se servono. |

Ogni fase è **rilasciabile da sola** e porta valore percepito (F1 già "wow": vede i soldi veri senza inserire nulla di nuovo, perché IVA e food cost snapshot ci sono già).

---

## 12. File nuovi previsti (mappa d'impianto)

```
prisma/schema.prisma            # + modelli §2, migrazione (vedi memoria: prisma db execute su prod)
lib/contabilita/
  iva.ts                        # scorporo, credito, liquidazione (funzioni pure)
  foodCost.ts                   # teorico da ricetta / ibrido / updateIngredientPrice a cascata
  labor.ts                      # costo turno da timbratura + tariffe
  costiFissi.ts                 # rateo giornaliero
  chiusuraGiorno.ts             # aggrega tutto → ChiusuraGiorno
  spendibile.ts                 # Semaforo a strati
  export.ts                     # exceljs: registro IVA, prima nota, P&L
lib/copilot/
  contabilita.ts                # getAiFinancialSummary + nuovi tool
app/food/dashboard/contabilita/
  page.tsx (sintesi) · costi/ · iva/ · personale/ · impostazioni/ · export/
app/api/contabilita/
  chiusura-giorno/ · costi-fissi/ · fatture/ · ingredienti/ · ricette/ · labor/ · summary/ · export/
app/api/cron/                   # + job chiusura serale (esiste la cartella cron)
```

---

## 13. Decisioni aperte (poche, mirate — da confermare con te)

1. **OCR bolle**: confermi **Claude vision** (zero nuove dipendenze, tracking spesa unificato) invece di Gemini? Consiglio: sì per l'MVP, valutare Gemini solo se i costi/qualità lo giustificano.
2. **Report mensile via email**: attivo di default o opt-in? Consiglio: **opt-in** (privacy + il titolare decide).
3. **Aliquota asporto/delivery**: gestiamo l'asimmetria (alcuni prodotti al 22% in asporto) già in F1 o la rimandiamo? Consiglio: campo pronto in F1, UI di override in F2.
4. **Accantonamento imposte**: percentuale fissa configurabile (default 15% sul margine) va bene come stima, o vuoi legarla al regime fiscale (forfettario vs ordinario) fin da subito? Consiglio: % fissa in F1-2, regime in F5.
5. **Timbratura vs inserimento ore**: default timbratura tablet (infrastruttura già presente) con fallback manuale — confermi?

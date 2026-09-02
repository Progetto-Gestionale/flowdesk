# Contabilità Food — Audit fiscale del motore vs debrief AI

> Verifica riga-per-riga del motore contabile reale contro i principi fiscali della
> ristorazione (debrief con Gemini, set 2026). Ancorato al codice: `lib/contabilita/*`,
> `app/food/dashboard/contabilita/*`, `app/api/contabilita/*`. Complementare a
> `docs/contabilita-progetto.md` (roadmap F1→F5): F1+F2 rilasciate, questo audit dice
> cosa correggere ora e cosa anticipare da F3/F5.

---

## 0. Metodo

Letti: `iva.ts`, `costiFissi.ts`, `labor.ts`, `spendibile.ts`, `chiusuraGiorno.ts`,
`app/food/dashboard/contabilita/page.tsx`, `impostazioni/page.tsx`, `costi/page.tsx`,
`app/api/contabilita/summary/route.ts`. Ogni verdetto sotto cita il punto esatto.

## 1. Verdetto sintetico

| Tema | Cosa dice il debrief | Cosa fa davvero il gestionale | Verdetto |
|---|---|---|---|
| Scorporo IVA vendite | Fai `lordo/(1+aliquota)` riga per riga | `scorpora()` per riga con aliquota a cascata riga→piatto→categoria→default | ✅ già corretto |
| Fatturato netto / EBITDA su imponibili | Solo imponibili nel P&L | Tutta la cascata usa netto; IVA fuori dal margine | ✅ già corretto |
| Labor senza IVA | I dipendenti non hanno IVA | `labor.ts` non tocca l'IVA | ✅ già corretto |
| Costi fissi: non hardcodare 22% | Aliquota scelta per voce | Selettore aliquota per costo + IVA suggerita per categoria (assicurazioni esenti…) | ✅ già corretto |
| Food cost netto per il margine, bolle per l'IVA | Doppia anima teorico/reale | `foodCostVenduto` = Σ COGS dei piatti venduti (netto); bolle previste in F3 | ✅ impostazione giusta |
| IVA a credito completa | Deve includere l'IVA delle merci | **Oggi il credito viene SOLO dai costi fissi; le merci non contribuiscono** | ⚠️ gap reale (= F3) |
| "IVA già sottratta dallo spendibile / fondo tasse" | Se è credito non va sottratta | La frase in UI non corrisponde al calcolo ed è sbagliata sui crediti | ❌ da correggere |
| Card "IVA da versare" | Distinguere debito vs credito | Card sempre rossa, label statica anche quando è un credito | ❌ da correggere |

**In una riga:** il cuore del motore (scorporo, margini, spendibile) è **corretto**. Ci sono
**tre cose da sistemare** (due sono testo/UI, una è il modulo acquisti già in roadmap) e
**due punti del debrief da NON seguire alla lettera** perché il codice è già più giusto.

---

## 2. Cosa è già corretto (non toccare)

- **Scorporo IVA vendite** — `iva.ts::scorpora` + `chiusuraGiorno.ts` scorpora **riga per
  riga** con `risolviAliquotaVendita` (snapshot riga → piatto → categoria → default). Gli
  alcolici in asporto al 22% sono già gestibili per piatto. Verifica numerica del tuo report:
  `8348/1,10 = 7589,09` e `8348 − 7589,09 = 758,91` → aliquota media 10%, esatta.
- **P&L su imponibili** — `spendibile.ts::calcolaContoEconomico`: netto → primo margine →
  margine dopo personale → EBITDA → utile. L'IVA non entra mai nel margine. Corretto.
- **Costi fissi netti con aliquota variabile** — `costiFissi.ts`, e la UI `costi/page.tsx`
  ha già il selettore 0/4/10/22 con IVA suggerita per categoria (assicurazioni → esente).
  Il timore di Gemini ("non hardcodare 22%") è già risolto.
- **Food cost = COGS dei piatti venduti** — `foodCostVenduto += RigaOrdine.foodCost × qty`,
  netto e snapshottato. È il modo corretto per il margine (vedi §4.1).
- **Regime forfettario** — già intercettato: niente scorporo IVA sulle vendite e niente
  credito sui fissi (`chiusuraGiorno.ts`, `forfettario`).

---

## 3. I tre errori reali da correggere

### E1 — La nota "già sottratta dallo spendibile e messa nel fondo tasse virtuale" è fuorviante ❌
`contabilita/page.tsx:199`. Questo è l'errore che ti preoccupava, ed è **vero**, ma è un
problema di **testo/concetto**, non di matematica del numero "soldi realmente tuoi".

**Cosa fa davvero il codice** (`spendibile.ts`): lo spendibile (= utile netto stimato)
sottrae l'**IVA a debito piena** e l'**accantonamento imposte** (imposte sul reddito, non
IVA). *Non* sottrae mai `ivaNetta`. Quindi la frase "questa cifra [ivaNetta] è già sottratta
dallo spendibile" descrive qualcosa che il codice non fa.

**Perché il NUMERO dello spendibile è comunque giusto** (dimostrazione):
```
spendibile = lordo − ivaDebito − foodNet − fissiNet − labor − accantonamento
```
La versione "di cassa" corretta sarebbe:
```
= lordo − foodLordo − fissiLordo − labor − ivaNettaReale − accantonamento
  con foodLordo = foodNet + ivaFood, fissiLordo = fissiNet + ivaFissi,
      ivaNettaReale = ivaDebito − ivaFood − ivaFissi
```
Sostituendo, i termini IVA sugli acquisti **si annullano** e resta esattamente la prima
formula. → "Soldi realmente tuoi" è corretto **a prescindere** dal fatto che il food-IVA sia
tracciato o no, perché i costi entrano netti e si sottrae l'IVA a debito piena.

**Il vero problema:** quando `ivaNetta` è **negativa** (credito IVA, come nel tuo −672,56 €),
la frase è concettualmente sbagliata — non stai "accantonando" un credito. E la parola
"fondo tasse virtuale" promette un **saldo che si accumula**, che oggi non esiste (è solo un
dato di periodo, non c'è riporto — vedi §5.1).

**Fix (testo dinamico, ~10 min):**
- `ivaNetta > 0`: «Hai maturato **{x} €** di IVA da versare: è già coperta dallo spendibile,
  tienila da parte per l'F24.»
- `ivaNetta < 0`: «Hai un **credito IVA di {|x|} €**: questo mese non versi IVA, il credito
  abbatterà le imposte/IVA future.» (nessun "accantonamento")
- `ivaNetta = 0`: «IVA in pari questo mese.»

### E2 — Il cassetto fiscale sottostima il credito IVA (manca l'IVA sugli acquisti-merci) ⚠️
`chiusuraGiorno.ts`: `ivaCredito` proviene **solo** da `ivaCreditoMensile(costiFissi)`. Il
food & beverage (2.457,40 € nel tuo esempio) non genera alcun credito. Verifica: il tuo
credito −1.431,47 € = esattamente 6.506,67 € × 22% (i soli costi fissi). Gemini ha ragione
sul *sintomo*: al ristoratore risulta **più IVA a debito del reale**.

**Ma la correzione giusta NON è "food cost × 10%"**: `foodCostVenduto` è il **COGS teorico
dei piatti venduti**, non gli acquisti reali del mese — moltiplicarlo per un'aliquota media
darebbe un credito inventato. Il credito IVA vero si calcola sulle **bolle/fatture
fornitori** (§2.4 del progetto: `Fattura`/`FatturaRiga`, e `iva.ts::ivaCreditoDaRighe` è
già pronto). **Questo è esattamente la Fase F3, già progettata.**

**Fix:** implementare il **modulo Acquisti** (F3, vedi §4.2 piano). Nel frattempo, **interim
onesto**: nel cassetto fiscale segnalare che «il credito IVA sulle merci non è ancora
conteggiato — collega gli acquisti per il dato reale», così il −672,56 € non viene scambiato
per definitivo.

### E3 — La card "IVA da versare" è sempre rossa e con label statica ❌
`contabilita/page.tsx:162` (`MiniCard … tono="rose"`). Un **credito** è una buona notizia ma
appare in rosso allarmante con scritto "da versare". **Fix:** label e colore dinamici —
credito → verde + "IVA a credito"; debito → neutro/ambra + "IVA da versare". (Suggerimento
di Gemini, corretto.)

---

## 4. Dove il debrief è impreciso (da NON seguire alla lettera)

### 4.1 "Il food cost dell'EBITDA deve venire dalle bolle, non dai piatti" — NO
In un passaggio Gemini dice di alimentare il conto economico col **totale delle bolle** invece
che coi piatti. Sarebbe un errore: per il margine vale il **principio di competenza** (COGS =
costo dei piatti effettivamente **venduti**), non gli **acquisti** del mese (che includono
magazzino, scorte, scarti). Il tuo codice fa già la cosa giusta (`RigaOrdine.foodCost × qty`).
Le bolle servono per **l'IVA a credito** e per il **confronto teorico-vs-reale** (sprechi/
furti, §5.4), **non** per sostituire il COGS nell'EBITDA. Da tenere separati.

### 4.2 "Stai sottraendo due volte il credito dallo spendibile" — nel codice non accade
Gemini reagiva alla *frase* in UI, non al calcolo. Come dimostrato in §E1, lo spendibile non
sottrae `ivaNetta`: non c'è nessun doppio conteggio. Va corretta la frase, non la matematica.

---

## 5. Nuove funzioni consigliate (oltre la roadmap)

### 5.1 Riporto del credito IVA tra periodi (saldo progressivo) — nuovo
Oggi ogni periodo è a sé: un credito IVA non viene memorizzato né riportato. Nella realtà il
credito di un mese **compensa** il debito dei mesi successivi. Proposta: un saldo IVA
progressivo (campo su `ChiusuraGiorno` o tabella `LiquidazioneIva` mensile) che accumula
`ivaNetta` e mostra «credito IVA riportato: X €». Piccolo, alto valore percepito.

### 5.2 Accantonamento imposte per regime fiscale — affinamento
`spendibile.ts` usa **15% dell'EBITDA** per tutti. Per il **forfettario** è impreciso: lì
l'imposta è sostitutiva (5%/15%) sul **reddito imponibile = ricavi × coefficiente redditività
40%** (ristorazione), non sull'EBITDA. Vale la pena anticipare almeno il ramo forfettario
(cambia parecchio il numero) invece di rimandarlo tutto a F5. Il campo `regimeFiscale` esiste
già in `ContabilitaConfig`.

### 5.3 Registro IVA con castelletto per aliquota nell'export — F5/export
`export.ts` esiste. Aggiungere il registro vendite/acquisti **per aliquota** (4/10/22) è ciò
che il commercialista si aspetta e che rende l'export "professionale".

### 5.4 Food cost teorico vs reale (sprechi/furti) — F3
Una volta che ci sono le bolle (§4.2 del progetto), confrontare COGS teorico dei piatti
venduti vs acquisti reali → alert «hai comprato salmone per 800 €, venduto per 600 € di
teorico: 200 € tra scarto/omaggi/furti». Gemini lo suggerisce, ed è coerente col progetto.

### 5.5 Import XML fattura elettronica SdI — F5
Il "superpotere": l'XML SdI porta imponibile e castelletto IVA **esatti** senza OCR. Popola
sia il credito IVA (§E2) sia i prezzi ingredienti a cascata (§4 del progetto).

---

## 6. Piano di esecuzione coerente

Ordinato per rapporto valore/sforzo, agganciato alla roadmap esistente.

1. **Fix immediati (oggi, ~30 min, zero rischio)** — E1 (testo dinamico debito/credito + via
   la parola "fondo" ingannevole), E3 (card dinamica). Rende onesto e leggibile il cassetto.
2. **Interim credito IVA (E2, piccolo)** — messaggio "credito merci non ancora conteggiato"
   finché non c'è F3, così il numero non inganna.
3. **F3 · Modulo Acquisti/Bolle** — il vero fix del credito IVA + food cost reale. Sequenza:
   (a) inserimento manuale bolla (imponibile per aliquota) → `Fattura`/`FatturaRiga`,
   `ivaCredito` reale nel cassetto; (b) confronto teorico-vs-reale (§5.4); (c) OCR foto
   (Claude vision) e/o import XML SdI (§5.5).
4. **Affinamenti fiscali** — riporto credito IVA (§5.1), accantonamento forfettario (§5.2),
   castelletto nell'export (§5.3).
5. **F4 · Ponte AI** — il brief contabile legge questi dati ora corretti.

> Nota architetturale confermata: NON sostituire il COGS teorico dell'EBITDA con gli acquisti
> reali (§4.1). Sono due binari: competenza (margine) vs cassa/fiscale (IVA e sprechi).

---

## 7. Stato implementazione (set 2026)

Tutti e 5 i punti implementati in un'unica passata. Riepilogo file → cosa:

- **Punto 1 · Fix UI cassetto fiscale** ✅ — `contabilita/page.tsx`: card IVA dinamica
  (credito verde / debito ambra), nota dinamica debito/credito (rimossa la frase "fondo tasse
  virtuale" fuorviante), etichette in parole semplici + descrizione "partita di giro".
- **Punto 3 · Modulo Acquisti/Bolle (F3)** ✅ (inserimento manuale) — modelli `Fattura`/
  `FatturaRiga`, `api/contabilita/fatture`, pagina `contabilita/acquisti`, credito IVA reale
  sommato in `chiusuraGiorno.ts`, card "comprato vs consumato". *Restano OCR foto e import XML
  SdI (§5.5) come incremento F3b/c.*
- **Punto 2 · Avviso credito merci** ✅ — sul cassetto fiscale, se non ci sono bolle nel periodo,
  banner "il credito IVA sulle merci non è conteggiato → inserisci le bolle".
- **Punto 4 · Affinamenti fiscali** ✅ — (a) `saldoIvaAnno` progressivo da inizio anno in
  `api/contabilita/summary`; (b) accantonamento forfettario (ricavi×coefficiente×aliquota) in
  `spendibile.ts` + parametri in `ContabilitaConfig`/Impostazioni; (c) foglio "Registro IVA"
  con castelletto per aliquota in `export.ts`.
- **Punto 5 · Ponte AI** ✅ — `lib/copilot/brief/context.ts`: metriche IVA netta (con segno/
  significato), comprato-vs-consumato, nudge "bolle mancanti", azione `apri_acquisti`.

**Scelte netto/lordo** (etichettate ovunque in UI): costi fissi → input **LORDO** con scorporo
automatico; bolle → **imponibile netto per aliquota** dal "Riepilogo IVA"; paga dipendente →
**netto** in tasca; prezzi menu → **lordi**.

Migrazione: `20260902120000_add_fatture_e_forfettario` (Fattura/FatturaRiga + 2 colonne config).

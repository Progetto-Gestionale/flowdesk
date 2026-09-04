// Vista di CASSA semplificata (la nuova filosofia del modulo Contabilità).
//
// Perché esiste: costruire un conto economico formale (scorporo IVA, cassetto fiscale,
// utile netto stimato al centesimo, regime forfettario) su dati inevitabilmente
// APPROSSIMATIVI — paghe, spese dimenticate, tasse — dà una falsa precisione che
// fuorvia il ristoratore. Meglio una vista di cassa dichiaratamente "grosso modo":
// quanto entra, i costi principali, quanto resta.
//
// Scelta consapevole (concordata col prodotto): l'IVA a debito sulle vendite e l'IVA a
// credito sugli acquisti si compensano "in grosso modo" e non le mostriamo. La cifra
// "cassa che resta" NON è un utile: non include tasse sul reddito, saldo IVA da versare
// né costi straordinari. La UI lo dichiara con un disclaimer esplicito.
//
// Funzioni pure: ricevono i componenti già calcolati da riepilogoContabile (che resta il
// motore dati) e li ricompongono nella vista di cassa. Nessun numero nuovo inventato qui.

import type { ContoEconomico } from './spendibile'

export interface VistaCassa {
  incassi: number // quello che entra in cassa nel periodo (lordo, come lo vede il titolare)
  personale: number // costo reale del personale (paga netta × moltiplicatore azienda)
  materiePrime: number // food cost delle materie prime finite nei piatti venduti
  costiFissi: number // quota del periodo di affitto, utenze, servizi, ecc.
  cassaResta: number // incassi − personale − materie prime − costi fissi (stima grossolana)
  cassaPct: number // cassaResta / incassi (0 se non ci sono incassi)
}

// Ricompone la vista di cassa dai componenti del conto economico gestionale.
// Usiamo il fatturato LORDO come "incassi" (è ciò che il titolare vede entrare) e i
// costi come li calcola già il motore. La compensazione IVA resta implicita.
export function vistaCassa(c: ContoEconomico): VistaCassa {
  const incassi = c.fatturatoLordo
  const personale = c.laborCost
  const materiePrime = c.foodCostVenduto
  const costiFissi = c.quotaCostiFissi
  const cassaResta = incassi - personale - materiePrime - costiFissi
  const cassaPct = incassi > 0 ? cassaResta / incassi : 0
  return { incassi, personale, materiePrime, costiFissi, cassaResta, cassaPct }
}

export type StatoSemaforoCassa = 'verde' | 'giallo' | 'rosso'

// Semaforo sulla % di cassa che resta. Soglie più alte del margine netto "classico"
// perché questa cifra è AL LORDO di tasse e saldo IVA: una quota sana di cassa
// operativa prima delle imposte sta intorno al 15-25% nella ristorazione.
//   ≥ 15% in salute · 6-15% attenzione · < 6% (o negativa) criticità.
export function semaforoCassa(cassaPct: number): StatoSemaforoCassa {
  if (cassaPct >= 0.15) return 'verde'
  if (cassaPct >= 0.06) return 'giallo'
  return 'rosso'
}

// Conto economico gestionale (P&L reale) + Semaforo Anti-Fallimento.
// Funzioni pure: ricevono i componenti già calcolati e li mettono in cascata.
//
// Cascata:
//   Fatturato Lordo
//   − IVA a debito            = Fatturato Netto (imponibile)
//   − Food & Beverage cost    = Primo Margine (contribuzione)
//   − Labor cost              = Margine dopo personale
//   − Quota costi fissi       = EBITDA gestionale
//   − Accantonamento imposte  = Utile netto stimato

export interface ContoInput {
  fatturatoLordo: number
  ivaDebito: number
  ivaCredito?: number // acquisti: costi fissi + bolle fornitori (F3)
  foodCostVenduto: number
  laborCost: number
  quotaCostiFissi: number
  percentualeAccantonamentoImposte: number // regime ordinario: % sull'EBITDA
  // Regime fiscale per la stima delle imposte sul reddito (default: ordinario).
  regimeFiscale?: 'ordinario' | 'forfettario'
  coefficienteRedditivita?: number // forfettario: quota dei ricavi tassata (ristorazione ≈ 0.40)
  aliquotaImpostaForfettario?: number // forfettario: 0.15 a regime, 0.05 primi 5 anni
}

export interface ContoEconomico {
  fatturatoLordo: number
  ivaDebito: number
  ivaCredito: number
  ivaNetta: number // da versare (debito − credito)
  fatturatoNetto: number
  foodCostVenduto: number
  primoMargine: number
  laborCost: number
  margineDopoPersonale: number
  quotaCostiFissi: number
  ebitda: number
  accantonamentoImposte: number
  utileStimato: number
  marginePct: number // utile stimato / fatturato netto
  // Semaforo Anti-Fallimento: "soldi realmente tuoi" a livelli crescenti di precisione.
  spendibile: {
    livello1: number // lordo − IVA − food (MVP)
    livello2: number // − costi fissi
    livello3: number // − labor
    livello4: number // − accantonamento imposte (== utileStimato)
  }
}

export function calcolaContoEconomico(i: ContoInput): ContoEconomico {
  const ivaCredito = i.ivaCredito ?? 0
  const fatturatoNetto = i.fatturatoLordo - i.ivaDebito
  const primoMargine = fatturatoNetto - i.foodCostVenduto
  const margineDopoPersonale = primoMargine - i.laborCost
  const ebitda = margineDopoPersonale - i.quotaCostiFissi
  // Accantonamento imposte sul reddito (stima prudenziale, non sostituisce il commercialista):
  //  · Ordinario: % sull'EBITDA, solo se positivo (proxy di IRES/IRAP/IRPEF sull'utile).
  //  · Forfettario: imposta sostitutiva su ricavi × coefficiente di redditività (40% ristorazione),
  //    dovuta anche se l'EBITDA è negativo — dipende dai ricavi, non dai costi effettivi.
  const accantonamentoImposte =
    i.regimeFiscale === 'forfettario'
      ? fatturatoNetto > 0 ? fatturatoNetto * (i.coefficienteRedditivita ?? 0.40) * (i.aliquotaImpostaForfettario ?? 0.15) : 0
      : ebitda > 0 ? ebitda * i.percentualeAccantonamentoImposte : 0
  const utileStimato = ebitda - accantonamentoImposte
  const marginePct = fatturatoNetto > 0 ? utileStimato / fatturatoNetto : 0

  const l1 = i.fatturatoLordo - i.ivaDebito - i.foodCostVenduto
  const l2 = l1 - i.quotaCostiFissi
  const l3 = l2 - i.laborCost
  const l4 = l3 - accantonamentoImposte

  return {
    fatturatoLordo: i.fatturatoLordo,
    ivaDebito: i.ivaDebito,
    ivaCredito,
    ivaNetta: i.ivaDebito - ivaCredito,
    fatturatoNetto,
    foodCostVenduto: i.foodCostVenduto,
    primoMargine,
    laborCost: i.laborCost,
    margineDopoPersonale,
    quotaCostiFissi: i.quotaCostiFissi,
    ebitda,
    accantonamentoImposte,
    utileStimato,
    marginePct,
    spendibile: { livello1: l1, livello2: l2, livello3: l3, livello4: l4 },
  }
}

export type StatoSemaforo = 'verde' | 'giallo' | 'rosso'

// Semaforo sul margine netto del periodo. Soglie prudenti per la ristorazione:
//   ≥ 10% salute · 3–10% attenzione · < 3% (o negativo) criticità.
export function statoSemaforo(marginePct: number): StatoSemaforo {
  if (marginePct >= 0.1) return 'verde'
  if (marginePct >= 0.03) return 'giallo'
  return 'rosso'
}

// Break-even giornaliero: fatturato NETTO minimo/giorno per coprire fissi + labor medio.
export function breakEvenGiornaliero(quotaCostiFissiGiorno: number, laborMedioGiorno: number): number {
  return quotaCostiFissiGiorno + laborMedioGiorno
}

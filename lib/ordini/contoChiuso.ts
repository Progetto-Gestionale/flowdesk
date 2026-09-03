// Filtro Prisma condiviso: un "conto" è CHIUSO (finalizzato e incassato).
//
// Regola di riconoscimento del ricavo — finché il conto non è chiuso i suoi dati NON entrano
// in contabilità né nelle analytics dei ricavi:
//   • sala (tipo "tavolo"): incassato quando il conto è stato SALDATO → status "chiuso"
//     (lo imposta /api/tavoli/chiudi-conto). Un ordine solo "consegnato" = cibo servito ma
//     conto ancora aperto → NON conta ancora.
//   • asporto / delivery: incassato quando è stato CONSEGNATO/ritirato → "consegnato" (o "chiuso").
//
// Esclusi: conti aperti/in corso ("nuovo", "aperto", "pronto", sala "consegnato" non saldata) e
// "non_consegnato" (concluso ma non incassato).
//
// NB: è un filtro sui RICAVI. Le metriche puramente operative (tempi di consegna, conteggio ordini
// ricevuti) restano su tutti gli ordini nelle rispettive route.
export const WHERE_CONTO_CHIUSO = {
  OR: [
    { tipo: 'tavolo', status: 'chiuso' },
    { tipo: { in: ['asporto', 'delivery'] }, status: { in: ['consegnato', 'chiuso'] } },
  ],
}

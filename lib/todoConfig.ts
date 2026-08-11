// Costanti della to-do list, senza dipendenze e senza 'use client': le importano
// sia l'API, sia il componente client della lista, sia la pagina server.
// (Se vivessero nel componente client, un server component che le importa
// riceverebbe un riferimento e non il valore.)

/** Per quante ore resta visibile una voce dopo che è stata spuntata. */
export const ORE_VISIBILITA_FATTE = 24

/** Spiegazione della scadenza, mostrata accanto al titolo in entrambe le viste. */
export const NOTA_SCADENZA = `Le voci spuntate spariscono dopo ${ORE_VISIBILITA_FATTE} ore`

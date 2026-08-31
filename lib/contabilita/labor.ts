// Labor cost. Funzioni pure: le query (Turno, Timbratura, Dipendente) stanno a valle.
//
// Costo orario reale AZIENDA = paga netta in tasca × moltiplicatore costi nascosti
// (INPS/INAIL/TFR/13ª/14ª ≈ +40%). Il costo del turno applica poi la maggiorazione
// della tariffa (straordinario/festivo/evento) o un forfait fisso.

export const MOLTIPLICATORE_DEFAULT = 1.4

// Ore tra due orari "HH:MM"; se oraFine <= oraInizio si assume che scavalchi la mezzanotte.
export function oreTraOrari(oraInizio: string, oraFine: string): number {
  const [hi, mi] = oraInizio.split(':').map(Number)
  const [hf, mf] = oraFine.split(':').map(Number)
  let min = hf * 60 + mf - (hi * 60 + mi)
  if (min <= 0) min += 24 * 60 // turno a cavallo della mezzanotte
  return min / 60
}

// Costo orario reale per l'azienda. Se manca la paga, 0 (il dipendente non è ancora
// configurato per la contabilità: non inquina i conti con stime inventate).
export function costoOrarioReale(
  pagaOrariaBaseNetta: number | null | undefined,
  moltiplicatore: number | null | undefined,
): number {
  if (!pagaOrariaBaseNetta || pagaOrariaBaseNetta <= 0) return 0
  return pagaOrariaBaseNetta * (moltiplicatore ?? MOLTIPLICATORE_DEFAULT)
}

export interface TurnoLike {
  oraInizio: string
  oraFine: string
  tipoTariffa: string // "ordinario" | "straordinario" | "festivo_evento" | "forfait"
  maggiorazione: number
  forfaitImporto?: number | null
}

// Costo di un singolo turno.
//   forfait → l'importo fisso concordato (ignora ore e maggiorazione)
//   altrimenti → ore × costo orario reale × maggiorazione
// `oreReali` (dalle timbrature) ha precedenza sulle ore pianificate del turno, quando fornito.
export function costoTurno(turno: TurnoLike, costoOrario: number, oreReali?: number): number {
  if (turno.tipoTariffa === 'forfait' && turno.forfaitImporto != null) {
    return turno.forfaitImporto
  }
  const ore = oreReali ?? oreTraOrari(turno.oraInizio, turno.oraFine)
  return ore * costoOrario * (turno.maggiorazione || 1)
}

// Ore effettive da una sequenza di timbrature di un dipendente in un giorno.
// Accoppia entrata→uscita in ordine cronologico; timbrature spaiate vengono ignorate.
export function oreDaTimbrature(
  timbrature: { tipo: string; timestamp: Date }[],
): number {
  const ordinate = [...timbrature].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  let totaleMs = 0
  let entrata: Date | null = null
  for (const t of ordinate) {
    if (t.tipo === 'entrata') {
      entrata = t.timestamp
    } else if (t.tipo === 'uscita' && entrata) {
      totaleMs += t.timestamp.getTime() - entrata.getTime()
      entrata = null
    }
  }
  return totaleMs / 3_600_000
}

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

// Una tariffa dello storico paga: valida da `dataInizio` in avanti.
export interface TariffaStorica {
  dataInizio: Date
  pagaOrariaBaseNetta: number | null
  moltiplicatoreCostoAzienda: number | null
}

// Tariffa in vigore a una certa data: l'ultima (dataInizio più recente) con dataInizio <= data.
// `storico` non deve essere ordinato. Ritorna null se a quella data il dipendente non aveva
// ancora una tariffa (turno antecedente al primo record) → costo 0, non "inventiamo" una paga.
export function tariffaAllaData(storico: TariffaStorica[], data: Date): TariffaStorica | null {
  const t = data.getTime()
  let scelta: TariffaStorica | null = null
  for (const r of storico) {
    if (r.dataInizio.getTime() <= t && (!scelta || r.dataInizio.getTime() > scelta.dataInizio.getTime())) {
      scelta = r
    }
  }
  return scelta
}

export const TIPI_TARIFFA = ['ordinario', 'straordinario', 'festivo_evento', 'forfait'] as const

// Maggiorazioni di partenza per ogni tipo di tariffa (moltiplicano il costo orario). Sono
// solo il DEFAULT proposto in UI: il titolare può cambiarle e il suo valore viene ricordato
// (ContabilitaConfig.maggiorazioniDefault). forfait non usa maggiorazione (importo fisso).
export const MAGGIORAZIONI_DEFAULT: Record<string, number> = {
  ordinario: 1,
  straordinario: 1.15,
  festivo_evento: 1.3,
  forfait: 1,
}

// Unisce i default preferiti dal titolare (JSON salvato in config) sopra quelli di sistema.
// Ignora valori non validi. Usata dall'API e come preset nella UI turni.
export function mergeMaggiorazioni(json: string | null | undefined): Record<string, number> {
  const out = { ...MAGGIORAZIONI_DEFAULT }
  if (!json) return out
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    for (const tipo of TIPI_TARIFFA) {
      const v = Number(parsed[tipo])
      if (Number.isFinite(v) && v >= 0.1 && v <= 5) out[tipo] = v
    }
  } catch { /* JSON corrotto → solo default di sistema */ }
  return out
}

// Estrae e valida i campi tariffa di un turno da un body JSON (POST/PATCH /api/turni).
// La maggiorazione è LIBERA (la sceglie il titolare); clamp di sicurezza a [0.1, 5].
// forfait → importo fisso del turno (le ore/maggiorazione vengono ignorate nel costo).
export function parseTariffaTurno(b: { tipoTariffa?: unknown; maggiorazione?: unknown; forfaitImporto?: unknown }): {
  tipoTariffa: string
  maggiorazione: number
  forfaitImporto: number | null
} {
  const tipo = (TIPI_TARIFFA as readonly string[]).includes(String(b.tipoTariffa)) ? String(b.tipoTariffa) : 'ordinario'
  if (tipo === 'forfait') {
    const f = Number(b.forfaitImporto)
    return { tipoTariffa: 'forfait', maggiorazione: 1, forfaitImporto: Number.isFinite(f) && f > 0 ? Math.round(f * 100) / 100 : null }
  }
  const m = Number(b.maggiorazione)
  return { tipoTariffa: tipo, maggiorazione: Number.isFinite(m) ? Math.min(5, Math.max(0.1, m)) : 1, forfaitImporto: null }
}

export interface TurnoLike {
  oraInizio: string
  oraFine: string
  tipoTariffa: string // "ordinario" | "straordinario" | "festivo_evento" | "forfait"
  maggiorazione: number
  forfaitImporto?: number | null
}

// Costo di un singolo turno.
//   forfait → importo NETTO concordato × moltiplicatore costi azienda (ignora ore e
//             maggiorazione). Coerente con la paga oraria, anch'essa netta e gonfiata dal
//             moltiplicatore: il titolare pensa a quanto dà in mano, il sistema aggiunge i
//             costi nascosti. Passa `moltiplicatore` per il gross-up (assente = nessun gross-up).
//   altrimenti → ore × costo orario reale × maggiorazione
// `oreReali` (dalle timbrature) ha precedenza sulle ore pianificate del turno, quando fornito.
export function costoTurno(turno: TurnoLike, costoOrario: number, oreReali?: number, moltiplicatore?: number): number {
  if (turno.tipoTariffa === 'forfait' && turno.forfaitImporto != null) {
    return turno.forfaitImporto * (moltiplicatore ?? 1)
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

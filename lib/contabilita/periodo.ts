// Calcolo dell'intervallo [inizio, fine) e dell'etichetta da un parametro "periodo",
// con la stessa semantica di /api/analytics (oggi | settimana | mese | anno).

const MESI_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

export interface Periodo {
  inizio: Date
  fine: Date
  label: string
  periodo: string
}

export function calcolaPeriodo(periodo: string, riferimento?: string | null): Periodo {
  const rif = riferimento ? new Date(riferimento) : new Date()

  if (periodo === 'oggi') {
    const inizio = new Date(rif.getFullYear(), rif.getMonth(), rif.getDate())
    const fine = new Date(inizio.getTime() + 86_400_000)
    return { inizio, fine, periodo, label: `Oggi · ${inizio.getDate()} ${MESI_IT[inizio.getMonth()]}` }
  }
  if (periodo === 'settimana') {
    const lun = new Date(rif)
    lun.setDate(rif.getDate() - ((rif.getDay() + 6) % 7))
    lun.setHours(0, 0, 0, 0)
    const fine = new Date(lun); fine.setDate(lun.getDate() + 7)
    const dom = new Date(lun); dom.setDate(lun.getDate() + 6)
    return { inizio: lun, fine, periodo, label: `${lun.getDate()} ${MESI_IT[lun.getMonth()]} – ${dom.getDate()} ${MESI_IT[dom.getMonth()]} ${dom.getFullYear()}` }
  }
  if (periodo === 'anno') {
    const inizio = new Date(rif.getFullYear(), 0, 1)
    const fine = new Date(rif.getFullYear() + 1, 0, 1)
    return { inizio, fine, periodo, label: String(rif.getFullYear()) }
  }
  // default: mese
  const inizio = new Date(rif.getFullYear(), rif.getMonth(), 1)
  const fine = new Date(rif.getFullYear(), rif.getMonth() + 1, 1)
  return { inizio, fine, periodo: 'mese', label: `${MESI_IT[rif.getMonth()]} ${rif.getFullYear()}` }
}

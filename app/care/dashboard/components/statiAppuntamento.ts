// Colori e nomi degli stati di un appuntamento, condivisi fra la pagina
// Calendario e la griglia settimanale.
export const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  confermato: { bg: 'bg-electric-blue/15', text: 'text-electric-blue', label: 'Confermato' },
  completato: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completato' },
  no_show: { bg: 'bg-orange-100', text: 'text-orange-600', label: 'No-show' },
  cancellato: { bg: 'bg-red-100', text: 'text-red-500', label: 'Cancellato' },
}

export interface AppuntamentoBase {
  id: string
  clienteNome?: string
  servizio?: string
  data: string
  durata: number
  status: string
}

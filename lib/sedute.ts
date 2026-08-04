import { prisma } from '@/lib/prisma'

// Tiene allineata la cartella clinica agli appuntamenti: un appuntamento
// "completato" deve avere la sua seduta, gli altri no.
//
// Sta qui e non dentro una route perché lo usano in due: la PATCH quando il
// professionista cambia stato a mano, e il cron di mezzanotte quando li chiude
// da solo. Prima esisteva solo nella PATCH, quindi le sedute completate in
// automatico non entravano in cartella.

/** Appuntamenti (già caricati) da riportare in cartella clinica. */
export interface AppuntamentoDaSincronizzare {
  id: string
  userId: string
  pazienteId: string | null
  data: Date
  servizio: string | null
  status: string
}

/**
 * Crea, aggiorna o rimuove la seduta collegata a un appuntamento.
 * È idempotente (Seduta.appuntamentoId è unique) e non tocca mai le sedute
 * inserite a mano, che non hanno appuntamentoId.
 */
export async function sincronizzaSeduta(app: AppuntamentoDaSincronizzare): Promise<void> {
  if (!app.pazienteId) return

  if (app.status === 'completato') {
    await prisma.seduta.upsert({
      where: { appuntamentoId: app.id },
      update: { data: app.data, tipo: app.servizio },
      create: {
        userId: app.userId,
        pazienteId: app.pazienteId,
        appuntamentoId: app.id,
        data: app.data,
        tipo: app.servizio,
      },
    })
  } else {
    await prisma.seduta.deleteMany({ where: { appuntamentoId: app.id, userId: app.userId } })
  }
}

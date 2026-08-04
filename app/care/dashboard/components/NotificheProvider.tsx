'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Notifica } from './notificheUtil'

// Stato condiviso delle notifiche: lo leggono la campanella e i toast, così
// c'è un solo polling invece di uno per componente.
//
// L'intervallo è breve (10s) perché il toast deve arrivare quasi subito quando
// l'evento è esterno — un paziente che prenota o che risponde all'email. Per le
// azioni fatte dal professionista stesso non si aspetta il giro di polling: la
// pagina che ha eseguito l'azione lancia 'notifiche-aggiornate' e il toast parte
// nell'istante in cui il server ha risposto.
const INTERVALLO_MS = 10000

interface Contesto {
  notifiche: Notifica[]
  daLeggere: number
  richiesteDaVerificare: number
  daMostrare: Notifica[]       // coda dei toast ancora a schermo
  scarta: (id: string) => void
  ricarica: () => Promise<void>
}

const NotificheContext = createContext<Contesto | null>(null)

export function useNotifiche(): Contesto {
  const c = useContext(NotificheContext)
  if (!c) throw new Error('useNotifiche va usato dentro NotificheProvider')
  return c
}

export default function NotificheProvider({ children }: { children: React.ReactNode }) {
  const [notifiche, setNotifiche] = useState<Notifica[]>([])
  const [daLeggere, setDaLeggere] = useState(0)
  const [richiesteDaVerificare, setRichiesteDaVerificare] = useState(0)
  const [daMostrare, setDaMostrare] = useState<Notifica[]>([])

  // Id già transitati: al primo caricamento li marchiamo tutti come visti, altrimenti
  // aprendo la dashboard partirebbe una raffica di toast per lo storico.
  const viste = useRef<Set<string>>(new Set())
  const primoGiro = useRef(true)

  const ricarica = useCallback(async () => {
    try {
      const [nRes, rRes] = await Promise.all([
        fetch('/api/care/notifiche', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/care/richieste/count', { credentials: 'include', cache: 'no-store' }),
      ])

      if (nRes.ok) {
        const d = await nRes.json()
        const lista: Notifica[] = d.notifiche ?? []
        setNotifiche(lista)
        setDaLeggere(d.daLeggere ?? 0)

        if (primoGiro.current) {
          lista.forEach(n => viste.current.add(n.id))
          primoGiro.current = false
        } else {
          const nuove = lista.filter(n => !viste.current.has(n.id))
          nuove.forEach(n => viste.current.add(n.id))
          // Le più recenti in cima, massimo tre a schermo per non coprire la pagina
          if (nuove.length > 0) setDaMostrare(prec => [...nuove, ...prec].slice(0, 3))
        }
      }

      if (rRes.ok) {
        const r = await rRes.json()
        setRichiesteDaVerificare(r.daVerificare ?? 0)
      }
    } catch { /* le notifiche non sono critiche: se il giro fallisce si riprova dopo */ }
  }, [])

  const scarta = useCallback((id: string) => {
    setDaMostrare(prec => prec.filter(n => n.id !== id))
  }, [])

  useEffect(() => {
    ricarica()
    const t = setInterval(ricarica, INTERVALLO_MS)
    const aggiorna = () => ricarica()
    window.addEventListener('notifiche-aggiornate', aggiorna)
    window.addEventListener('refresh-richieste-count', aggiorna)

    // Rientrando sulla scheda si riallinea subito, senza aspettare il timer
    const suRitorno = () => { if (document.visibilityState === 'visible') ricarica() }
    document.addEventListener('visibilitychange', suRitorno)

    return () => {
      clearInterval(t)
      window.removeEventListener('notifiche-aggiornate', aggiorna)
      window.removeEventListener('refresh-richieste-count', aggiorna)
      document.removeEventListener('visibilitychange', suRitorno)
    }
  }, [ricarica])

  return (
    <NotificheContext.Provider
      value={{ notifiche, daLeggere, richiesteDaVerificare, daMostrare, scarta, ricarica }}>
      {children}
    </NotificheContext.Provider>
  )
}

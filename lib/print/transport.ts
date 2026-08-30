// "Cucitura" del sistema di stampa: l'unico punto che sa COME una comanda arriva fisicamente alla
// stampante. Tutto il resto (comanda, ESC/POS, coda, API, UI) è indipendente da questo. Oggi esiste
// solo il MockTransport (non stampa, serve a verificare il layout senza hardware); domani basterà
// aggiungere PrintNodeTransport / AgentTransport e cambiare getTransport(), senza toccare altro.

export interface RisultatoStampa {
  ok: boolean
  errore?: string
}

// Il minimo che un transport deve sapere per consegnare una comanda.
export interface JobDaStampare {
  id: string
  reparto: string
  contenuto: string // ESC/POS in base64
  anteprima?: string | null
  stampante?: { id: string; nome: string; indirizzo: string | null; tipo: string } | null
}

export interface InviaComanda {
  readonly nome: string
  invia(job: JobDaStampare): Promise<RisultatoStampa>
}

// MockTransport: NON stampa davvero. Considera il job consegnato con successo — l'anteprima
// renderizzata è già stata salvata sul PrintJob all'accodamento, quindi il layout è verificabile
// dall'UI/anteprima senza alcuna stampante collegata.
export class MockTransport implements InviaComanda {
  readonly nome = 'mock'
  async invia(_job: JobDaStampare): Promise<RisultatoStampa> {
    return { ok: true }
  }
}

// Selettore del transport attivo. Per ora sempre Mock. In futuro qui si sceglierà in base alla
// configurazione dell'utente / al tipo di stampante (rete via agente, cloud via PrintNode, …).
export function getTransport(): InviaComanda {
  return new MockTransport()
}

// --- Stub dei transport reali (da implementare quando si integra la consegna vera) ---
//
// PrintNodeTransport: manda il payload ESC/POS al servizio cloud PrintNode via API, indicando
// l'ID stampante PrintNode. Nessun agente locale: il computer del locale ha il client PrintNode.
//   export class PrintNodeTransport implements InviaComanda {
//     readonly nome = 'printnode'
//     constructor(private apiKey: string) {}
//     async invia(job: JobDaStampare): Promise<RisultatoStampa> { /* POST /printjobs con base64 */ }
//   }
//
// AgentTransport: parla con un nostro agente installato nel locale, che apre un socket TCP verso
// la stampante di rete (job.stampante.indirizzo, es. "192.168.1.50:9100") e le invia i byte ESC/POS.
//   export class AgentTransport implements InviaComanda {
//     readonly nome = 'agent'
//     async invia(job: JobDaStampare): Promise<RisultatoStampa> { /* POST all'agente del locale */ }
//   }

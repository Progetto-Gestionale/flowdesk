-- Sistema stampa comande su stampanti termiche (parte comune, transport-agnostica).
-- Additivo: due nuove tabelle, nessuna modifica alle esistenti. Reversibile con DROP TABLE.

-- Stampante: descrive dove/cosa serve (reparto, indirizzo di rete), non COME si consegna la stampa.
CREATE TABLE IF NOT EXISTS "Stampante" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "reparto"   TEXT NOT NULL,
  "indirizzo" TEXT,
  "tipo"      TEXT NOT NULL DEFAULT 'rete',
  "attiva"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Stampante_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Stampante_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- PrintJob: coda di stampa. Un job = una comanda (un reparto di un ordine).
CREATE TABLE IF NOT EXISTS "PrintJob" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "ordineId"    TEXT,
  "stampanteId" TEXT,
  "reparto"     TEXT NOT NULL,
  "contenuto"   TEXT NOT NULL,
  "anteprima"   TEXT,
  "stato"       TEXT NOT NULL DEFAULT 'in_attesa',
  "errore"      TEXT,
  "tentativi"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stampataAt"  TIMESTAMP(3),
  CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrintJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrintJob_stampanteId_fkey" FOREIGN KEY ("stampanteId") REFERENCES "Stampante"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Stampante_userId_idx" ON "Stampante"("userId");
CREATE INDEX IF NOT EXISTS "PrintJob_userId_createdAt_idx" ON "PrintJob"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PrintJob_stato_idx" ON "PrintJob"("stato");

-- Flowest Contabilità — Storico tariffe dipendente (paga/moltiplicatore con date di validità).
-- Il costo di un turno userà la tariffa in vigore alla DATA del turno: un aumento vale solo
-- da lì in avanti, la contabilità passata non cambia. Il primo inserimento (record epoca)
-- copre retroattivamente tutte le ore già lavorate.
-- Additivo e idempotente (IF NOT EXISTS / NOT EXISTS): nessuna perdita dati. Applicare con:
--   npx prisma db execute --file prisma/migrations/20260902000000_add_dipendente_paga_storico/migration.sql --url "$DIRECT_URL"

CREATE TABLE IF NOT EXISTS "DipendentePagaStorico" (
  "id"                         TEXT NOT NULL,
  "dipendenteId"               TEXT NOT NULL,
  "userId"                     TEXT NOT NULL,
  "dataInizio"                 TIMESTAMP(3) NOT NULL,
  "pagaOrariaBaseNetta"        DOUBLE PRECISION,
  "moltiplicatoreCostoAzienda" DOUBLE PRECISION NOT NULL DEFAULT 1.40,
  "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DipendentePagaStorico_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DipendentePagaStorico_dipendenteId_dataInizio_idx" ON "DipendentePagaStorico"("dipendenteId", "dataInizio");
CREATE INDEX IF NOT EXISTS "DipendentePagaStorico_userId_idx" ON "DipendentePagaStorico"("userId");

DO $$ BEGIN
  ALTER TABLE "DipendentePagaStorico" ADD CONSTRAINT "DipendentePagaStorico_dipendenteId_fkey" FOREIGN KEY ("dipendenteId") REFERENCES "Dipendente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: ogni dipendente già configurato (paga non nulla) riceve un record epoca con la
-- sua tariffa attuale, valido da sempre → la contabilità storica resta identica a prima.
-- Idempotente: solo se non ha ancora uno storico. id deterministico ('seed_' || id) per non
-- creare duplicati a ri-esecuzione.
INSERT INTO "DipendentePagaStorico" ("id", "dipendenteId", "userId", "dataInizio", "pagaOrariaBaseNetta", "moltiplicatoreCostoAzienda", "createdAt")
SELECT 'seed_' || d."id", d."id", d."userId", TIMESTAMP '1970-01-01 00:00:00', d."pagaOrariaBaseNetta", d."moltiplicatoreCostoAzienda", CURRENT_TIMESTAMP
FROM "Dipendente" d
WHERE d."pagaOrariaBaseNetta" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "DipendentePagaStorico" s WHERE s."dipendenteId" = d."id");

-- RLS deny-all coerente con le altre tabelle public (Prisma passa come owner, i client anon no).
ALTER TABLE "DipendentePagaStorico" ENABLE ROW LEVEL SECURITY;

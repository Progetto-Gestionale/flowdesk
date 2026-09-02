-- Flowest Contabilità — F3 (Acquisti/Bolle fornitori) + affinamento imposte forfettario.
-- Additivo e idempotente. Applicare con:
--   npx prisma db execute --file prisma/migrations/20260902120000_add_fatture_e_forfettario/migration.sql --url "$DIRECT_URL"

-- ── Forfettario: parametri imposta sostitutiva sul reddito (ricavi × coefficiente) ──
ALTER TABLE "ContabilitaConfig" ADD COLUMN IF NOT EXISTS "coefficienteRedditivita"    DOUBLE PRECISION NOT NULL DEFAULT 0.40;
ALTER TABLE "ContabilitaConfig" ADD COLUMN IF NOT EXISTS "aliquotaImpostaForfettario" DOUBLE PRECISION NOT NULL DEFAULT 0.15;

-- ── F3 · Fatture/bolle fornitori ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Fattura" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "fornitore" TEXT,
  "numero"    TEXT,
  "data"      TIMESTAMP(3) NOT NULL,
  "categoria" TEXT NOT NULL DEFAULT 'merci',
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Fattura_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Fattura_userId_data_idx" ON "Fattura"("userId", "data");

CREATE TABLE IF NOT EXISTS "FatturaRiga" (
  "id"         TEXT NOT NULL,
  "fatturaId"  TEXT NOT NULL,
  "imponibile" DOUBLE PRECISION NOT NULL,
  "aliquota"   DOUBLE PRECISION NOT NULL,
  CONSTRAINT "FatturaRiga_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FatturaRiga_fatturaId_idx" ON "FatturaRiga"("fatturaId");

DO $$ BEGIN
  ALTER TABLE "Fattura" ADD CONSTRAINT "Fattura_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "FatturaRiga" ADD CONSTRAINT "FatturaRiga_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "Fattura"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS deny-all coerente con le altre tabelle public (Prisma passa come owner).
ALTER TABLE "Fattura"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FatturaRiga" ENABLE ROW LEVEL SECURITY;

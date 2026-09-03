-- Flowest Contabilità — Costi una tantum + moltiplicatori maggiorazione preferiti.
-- Tutto additivo e idempotente (IF NOT EXISTS): nessuna perdita dati, colonne con default.
-- Applicare con:  npx prisma db execute --file prisma/migrations/20260903120000_add_costo_una_tantum_maggiorazioni/migration.sql --url "$DIRECT_URL"

-- ── Moltiplicatori "maggiorazione" preferiti dal titolare (sticky per tipoTariffa) ──
ALTER TABLE "ContabilitaConfig" ADD COLUMN IF NOT EXISTS "maggiorazioniDefault" TEXT NOT NULL DEFAULT '{}';

-- ── Costi una tantum / spot (intervallo di date, importo spalmato sui giorni) ─────────
CREATE TABLE IF NOT EXISTS "CostoUnaTantum" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "voce"         TEXT NOT NULL,
  "categoria"    TEXT NOT NULL DEFAULT 'altro',
  "importoNetto" DOUBLE PRECISION NOT NULL,
  "aliquota"     DOUBLE PRECISION NOT NULL DEFAULT 0.22,
  "dataInizio"   TIMESTAMP(3) NOT NULL,
  "dataFine"     TIMESTAMP(3) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CostoUnaTantum_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CostoUnaTantum_userId_dataInizio_idx" ON "CostoUnaTantum"("userId", "dataInizio");

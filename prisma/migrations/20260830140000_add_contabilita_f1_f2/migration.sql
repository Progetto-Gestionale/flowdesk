-- Flowest Contabilità — Fasi F1 (IVA + Semaforo) e F2 (costi fissi + labor).
-- Tutto additivo e idempotente (IF NOT EXISTS): nessuna perdita dati, colonne nullable o con default.
-- Applicare con:  npx prisma db execute --file prisma/migrations/20260830140000_add_contabilita_f1_f2/migration.sql --url "$DIRECT_URL"

-- ── F1 · Aliquote IVA di vendita (default + override a cascata) ───────────────
ALTER TABLE "MenuCategoria" ADD COLUMN IF NOT EXISTS "aliquotaVendita" DOUBLE PRECISION;
ALTER TABLE "MenuPiatto"    ADD COLUMN IF NOT EXISTS "aliquotaVendita" DOUBLE PRECISION;
ALTER TABLE "RigaOrdine"    ADD COLUMN IF NOT EXISTS "aliquotaVendita" DOUBLE PRECISION;

-- ── F2 · Labor cost sul dipendente ───────────────────────────────────────────
ALTER TABLE "Dipendente" ADD COLUMN IF NOT EXISTS "pagaOrariaBaseNetta" DOUBLE PRECISION;
ALTER TABLE "Dipendente" ADD COLUMN IF NOT EXISTS "moltiplicatoreCostoAzienda" DOUBLE PRECISION NOT NULL DEFAULT 1.40;

-- ── F2 · Tariffe sul turno ───────────────────────────────────────────────────
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "tipoTariffa" TEXT NOT NULL DEFAULT 'ordinario';
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "maggiorazione" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "forfaitImporto" DOUBLE PRECISION;

-- ── F1 · Configurazione contabile del locale (1:1 con User) ──────────────────
CREATE TABLE IF NOT EXISTS "ContabilitaConfig" (
  "id"                               TEXT NOT NULL,
  "userId"                           TEXT NOT NULL,
  "aliquotaVenditaDefault"           DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "percentualeAccantonamentoImposte" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  "moltiplicatoreLaborDefault"       DOUBLE PRECISION NOT NULL DEFAULT 1.40,
  "regimeFiscale"                    TEXT NOT NULL DEFAULT 'ordinario',
  "updatedAt"                        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContabilitaConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContabilitaConfig_userId_key" ON "ContabilitaConfig"("userId");

-- ── F2 · Costi fissi / semi-variabili ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CostoFisso" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "voce"         TEXT NOT NULL,
  "categoria"    TEXT NOT NULL DEFAULT 'altro',
  "importoNetto" DOUBLE PRECISION NOT NULL,
  "aliquota"     DOUBLE PRECISION NOT NULL DEFAULT 0.22,
  "periodicita"  TEXT NOT NULL DEFAULT 'mensile',
  "attivo"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CostoFisso_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CostoFisso_userId_idx" ON "CostoFisso"("userId");

-- ── F1 · Snapshot contabile di fine giornata ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "ChiusuraGiorno" (
  "id"                    TEXT NOT NULL,
  "userId"                TEXT NOT NULL,
  "data"                  TIMESTAMP(3) NOT NULL,
  "fatturatoLordo"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ivaDebito"             DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fatturatoNetto"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "foodCostVenduto"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "laborCost"             DOUBLE PRECISION NOT NULL DEFAULT 0,
  "quotaCostiFissi"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ivaCredito"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ivaNetta"              DOUBLE PRECISION NOT NULL DEFAULT 0,
  "accantonamentoImposte" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "utileStimato"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "spendibile"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChiusuraGiorno_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChiusuraGiorno_userId_data_key" ON "ChiusuraGiorno"("userId", "data");
CREATE INDEX IF NOT EXISTS "ChiusuraGiorno_userId_data_idx" ON "ChiusuraGiorno"("userId", "data");

-- Foreign key verso User (coerenti con le altre tabelle; ignora se già presenti).
DO $$ BEGIN
  ALTER TABLE "ContabilitaConfig" ADD CONSTRAINT "ContabilitaConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CostoFisso" ADD CONSTRAINT "CostoFisso_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ChiusuraGiorno" ADD CONSTRAINT "ChiusuraGiorno_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS deny-all coerente con le altre tabelle public: nessuna policy = accesso negato
-- ai client anon/authenticated di Supabase. Prisma continua a passare come owner del DB.
ALTER TABLE "ContabilitaConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostoFisso"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChiusuraGiorno"    ENABLE ROW LEVEL SECURITY;

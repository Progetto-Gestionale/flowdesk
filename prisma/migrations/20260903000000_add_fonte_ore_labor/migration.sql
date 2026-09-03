-- Flowest Contabilità — fonte delle ore per il costo del personale (turni pianificati
-- oppure timbrature reali). Additivo, con default. Applicare con:
--   npx prisma db execute --file prisma/migrations/20260903000000_add_fonte_ore_labor/migration.sql --url "$DIRECT_URL"

ALTER TABLE "ContabilitaConfig" ADD COLUMN IF NOT EXISTS "fonteOreLabor" TEXT NOT NULL DEFAULT 'turni';

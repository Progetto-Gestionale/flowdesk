-- Dati fiscali per il report del commercialista. Additivo e idempotente.
-- Applicare a prod con: npx prisma db execute --file <questo> --url "$DIRECT_URL"

-- Anagrafica fiscale del locale (intestazione report)
ALTER TABLE "ContabilitaConfig" ADD COLUMN IF NOT EXISTS "ragioneSociale" TEXT;
ALTER TABLE "ContabilitaConfig" ADD COLUMN IF NOT EXISTS "partitaIva" TEXT;
ALTER TABLE "ContabilitaConfig" ADD COLUMN IF NOT EXISTS "codiceFiscale" TEXT;

-- P.IVA del fornitore sulle fatture d'acquisto (registro acquisti)
ALTER TABLE "Fattura" ADD COLUMN IF NOT EXISTS "partitaIvaFornitore" TEXT;

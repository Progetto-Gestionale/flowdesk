-- Bolle: origine (manuale/foto/xml) + dettaglio riga-per-riga per la vista dettaglio.
-- Additiva e non distruttiva: le colonne sono opzionali/con default. IF NOT EXISTS per
-- poterla riapplicare senza errori (le migrazioni su questo repo si applicano a mano).
ALTER TABLE "Fattura" ADD COLUMN IF NOT EXISTS "origine" TEXT NOT NULL DEFAULT 'manuale';
ALTER TABLE "Fattura" ADD COLUMN IF NOT EXISTS "dettaglioLinee" TEXT;

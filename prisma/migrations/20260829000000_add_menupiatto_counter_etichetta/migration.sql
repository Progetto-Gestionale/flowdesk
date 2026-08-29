-- Counter live quantità + etichetta personalizzabile sui piatti.
-- Tutti i campi sono nullable/additivi: nessun impatto sui dati esistenti.
ALTER TABLE "MenuPiatto"
  ADD COLUMN "quantita" INTEGER,
  ADD COLUMN "quantitaSoglia" INTEGER,
  ADD COLUMN "etichetta" TEXT,
  ADD COLUMN "etichettaColore" TEXT;

-- Flag: la richiesta asporto/delivery ha già scalato il counter (per ripristino idempotente al rifiuto).
ALTER TABLE "Preventivo"
  ADD COLUMN "stockScalato" BOOLEAN NOT NULL DEFAULT false;

-- Snapshot del food cost sulla riga d'ordine (per guadagno netto/margine in analytics). Additivo e nullable.
ALTER TABLE "RigaOrdine" ADD COLUMN IF NOT EXISTS "foodCost" DOUBLE PRECISION;

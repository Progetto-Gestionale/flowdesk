-- Food cost per piatto (costo di produzione della porzione). Additivo e nullable.
ALTER TABLE "MenuPiatto" ADD COLUMN IF NOT EXISTS "foodCost" DOUBLE PRECISION;

-- Flowest Copilota — cache delle insight card AI (verdetto in-pagina).
-- Additivo e idempotente. Applicare con:
--   npx prisma db execute --file prisma/migrations/20260902140000_add_copilot_insight/migration.sql --url "$DIRECT_URL"

CREATE TABLE IF NOT EXISTS "CopilotInsight" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "scope"       TEXT NOT NULL,
  "periodo"     TEXT NOT NULL,
  "riferimento" TEXT NOT NULL,
  "hash"        TEXT NOT NULL,
  "brief"       TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopilotInsight_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CopilotInsight_userId_scope_periodo_riferimento_key" ON "CopilotInsight"("userId", "scope", "periodo", "riferimento");
CREATE INDEX IF NOT EXISTS "CopilotInsight_userId_idx" ON "CopilotInsight"("userId");

DO $$ BEGIN
  ALTER TABLE "CopilotInsight" ADD CONSTRAINT "CopilotInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "CopilotInsight" ENABLE ROW LEVEL SECURITY;

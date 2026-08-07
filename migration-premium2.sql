-- ============================================================
-- NexChat - Premium Fase 2: verificado, quem viu o perfil,
-- mensagens autodestrutivas, tradução automática
-- RODAR NO SQL EDITOR DO SUPABASE
-- ============================================================

-- 1. Badge verificado (admin concede)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT false;

-- 2. Quem viu meu perfil
CREATE TABLE IF NOT EXISTS "ProfileView" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "viewedUserId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "viewerId" UUID REFERENCES "User"(id) ON DELETE CASCADE,
  "viewedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("viewedUserId", "viewerId")
);
CREATE INDEX IF NOT EXISTS idx_profile_view_viewed ON "ProfileView" ("viewedUserId", "viewedAt" DESC);

-- 3. Mensagens autodestrutivas (1h / 24h)
ALTER TABLE "DirectMessage" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;
ALTER TABLE "GroupMessage" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;

-- 4. Tradução automática
ALTER TABLE "DirectMessage" ADD COLUMN IF NOT EXISTS "translatedContent" TEXT;
ALTER TABLE "DirectMessage" ADD COLUMN IF NOT EXISTS "translatedLang" TEXT;
ALTER TABLE "GroupMessage" ADD COLUMN IF NOT EXISTS "translatedContent" TEXT;
ALTER TABLE "GroupMessage" ADD COLUMN IF NOT EXISTS "translatedLang" TEXT;

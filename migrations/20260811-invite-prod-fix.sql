-- 20260811-invite-prod-fix.sql
-- Compatível com o schema de PRODUÇÃO (Invite.id é UUID — schema antigo migration-invite.sql).
-- NÃO usar migrations/20250809-invites.sql (SERIAL/INTEGER) neste banco.
-- Idempotente: pode rodar várias vezes.

-- 1. Coluna lastIp no User (usada por touchLastIp no auth/callback)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastIp" VARCHAR(45);

-- 2. Coluna updatedAt no Invite (usada no POST de clique e conversões)
ALTER TABLE "Invite" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Tabela InviteClick (schema UUID)
CREATE TABLE IF NOT EXISTS "InviteClick" (
  id SERIAL PRIMARY KEY,
  "inviteId" UUID NOT NULL REFERENCES "Invite"(id) ON DELETE CASCADE,
  ip VARCHAR(45) NOT NULL,
  country VARCHAR(2),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "invite_click_invite_idx" ON "InviteClick" ("inviteId");

-- 4. Tabela InviteConversion (schema UUID)
CREATE TABLE IF NOT EXISTS "InviteConversion" (
  id SERIAL PRIMARY KEY,
  "inviteId" UUID NOT NULL REFERENCES "Invite"(id) ON DELETE CASCADE,
  "newUserId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "newUserIp" VARCHAR(45),
  "newUserCountry" VARCHAR(2),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT unique_invite_user UNIQUE ("inviteId", "newUserId")
);
CREATE INDEX IF NOT EXISTS "invite_conversion_user_idx" ON "InviteConversion" ("newUserId");

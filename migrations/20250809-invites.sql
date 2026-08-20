-- Sistema de Convites / Referrals
-- Permite que usuários ganhem Premium ao indicar 25 pessoas com IPs diferentes

CREATE TABLE IF NOT EXISTS "Invite" (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL UNIQUE,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "conversions" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "InviteConversion" (
  id SERIAL PRIMARY KEY,
  "inviteId" INTEGER NOT NULL REFERENCES "Invite"(id) ON DELETE CASCADE,
  "newUserId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "newUserIp" VARCHAR(45),
  "newUserCountry" VARCHAR(2),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT unique_invite_user UNIQUE ("inviteId", "newUserId")
);

CREATE INDEX IF NOT EXISTS "invite_user_idx" ON "Invite" ("userId");
CREATE INDEX IF NOT EXISTS "invite_code_idx" ON "Invite" (code);
CREATE TABLE IF NOT EXISTS "InviteClick" (
  id SERIAL PRIMARY KEY,
  "inviteId" INTEGER NOT NULL REFERENCES "Invite"(id) ON DELETE CASCADE,
  ip VARCHAR(45) NOT NULL,
  country VARCHAR(2),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "invite_click_invite_idx" ON "InviteClick" ("inviteId");

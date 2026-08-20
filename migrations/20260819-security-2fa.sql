-- 2FA por e-mail + vinculação de conta guest + revogação de sessão (sessionVersion)
-- Rode uma única vez no banco (Supabase SQL Editor ou psql).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "AuthCode" (
  "id" SERIAL PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "purpose" TEXT NOT NULL, -- enable_2fa | disable_2fa | change_password | disconnect_device | link_guest
  "code" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "consumedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "AuthCode_userId_idx" ON "AuthCode"("userId");
CREATE INDEX IF NOT EXISTS "AuthCode_purpose_idx" ON "AuthCode"("purpose");

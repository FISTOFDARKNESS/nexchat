-- 2FA no login: bloqueio por tentativas e contador de falhas
-- Rode no banco (Supabase SQL Editor ou psql) após a migration 20260819-security-2fa.sql.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorLockUntil" TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "User_twoFactorLockUntil_idx" ON "User"("twoFactorLockUntil");

-- Admin Power: log de ações, ban por e-mail e registro de IP
-- Rode uma única vez no banco (Supabase SQL Editor ou psql).

CREATE TABLE IF NOT EXISTS "AdminLog" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "adminId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "targetUserId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adminlog_created ON "AdminLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_adminlog_target ON "AdminLog"("targetUserId");

CREATE TABLE IF NOT EXISTS "EmailBan" (
  "email" TEXT PRIMARY KEY,
  "bannedBy" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastIp" TEXT;

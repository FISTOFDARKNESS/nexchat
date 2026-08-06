-- Sistema Premium: plano único (R$ 34,99 / 30 dias via PayPal)
-- Rode uma única vez no banco (Supabase SQL Editor ou psql).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumTier" TEXT NOT NULL DEFAULT 'free'; -- 'free' | 'premium'
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumSince" TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumExpiresAt" TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastNameChangeAt" TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatTheme" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "invisibleMode" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_premium ON "User"("premiumTier", "premiumExpiresAt");

ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "description" TEXT;

CREATE TABLE IF NOT EXISTS "PremiumPurchase" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "paypalOrderId" TEXT UNIQUE,
  "amount" NUMERIC(10, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "daysGranted" INTEGER NOT NULL DEFAULT 30,
  "status" TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_premium_purchase_user ON "PremiumPurchase"("userId", "createdAt" DESC);

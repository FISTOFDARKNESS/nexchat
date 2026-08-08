-- Senha para contas de visitante (guest)
-- Rode uma única vez no banco (Supabase SQL Editor ou psql).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

-- Realtime (Apinator) state tables + presence columns.
-- Substitui as estruturas em memória do antigo server.js (socket.io),
-- necessárias para funcionar em funções serverless (Vercel).

CREATE TABLE IF NOT EXISTS "MatchmakingQueue" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  username text NOT NULL,
  gender text NOT NULL DEFAULT 'other',
  country text NOT NULL DEFAULT 'BR',
  bio text NOT NULL DEFAULT '',
  "isPremium" boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  "prefGender" text NOT NULL DEFAULT 'any',
  "prefCountry" text NOT NULL DEFAULT 'any',
  mode text NOT NULL DEFAULT 'text',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL DEFAULT now() + interval '5 minutes'
);
CREATE INDEX IF NOT EXISTS "idx_matchmaking_expires" ON "MatchmakingQueue" ("expiresAt");
CREATE INDEX IF NOT EXISTS "idx_matchmaking_user" ON "MatchmakingQueue" ("userId");

CREATE TABLE IF NOT EXISTS "ActiveCall" (
  "callRoomId" text PRIMARY KEY,
  type text NOT NULL,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  "hostUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_activecall_participants" ON "ActiveCall" USING gin (participants);

CREATE TABLE IF NOT EXISTS "RandomRoom" (
  "roomId" text PRIMARY KEY,
  "peerA" text NOT NULL,
  "peerB" text NOT NULL,
  "peerAData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "peerBData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- Colunas de presença (já usadas por server.js / presença Apinator)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeen" timestamptz;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "invisibleMode" boolean NOT NULL DEFAULT false;

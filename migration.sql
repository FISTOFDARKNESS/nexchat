-- Habilitar extensão pgcrypto para gerar UUIDs se não estiver habilitada
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpar tabelas existentes caso rode novamente
DROP TABLE IF EXISTS "Ban" CASCADE;
DROP TABLE IF EXISTS "Report" CASCADE;
DROP TABLE IF EXISTS "MessageLike" CASCADE;
DROP TABLE IF EXISTS "GroupMessage" CASCADE;
DROP TABLE IF EXISTS "GroupMember" CASCADE;
DROP TABLE IF EXISTS "Group" CASCADE;
DROP TABLE IF EXISTS "DirectMessage" CASCADE;
DROP TABLE IF EXISTS "Friendship" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- Tabela de Usuários
CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customId" TEXT UNIQUE NOT NULL, -- Exemplo: user#1234
  "username" TEXT NOT NULL,
  "email" TEXT UNIQUE, -- Nulo para contas de Visitantes (Guest)
  "role" TEXT NOT NULL DEFAULT 'user', -- 'user', 'moderator', 'admin'
  "isGuest" BOOLEAN NOT NULL DEFAULT false,
  "gender" TEXT, -- 'male', 'female', 'other'
  "country" TEXT, -- Código ISO ou nome do país
  "avatarUrl" TEXT,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "bio" TEXT,
  "status" TEXT,
  "lastSeen" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de Amizades (Friendship)
CREATE TABLE "Friendship" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId1" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "userId2" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACCEPTED', 'BLOCKED'
  "senderId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("userId1", "userId2"),
  CONSTRAINT check_users_order CHECK ("userId1" < "userId2")
);

-- Tabela de Mensagens Privadas (Direct Message)
CREATE TABLE "DirectMessage" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "senderId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "receiverId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'text', -- 'text', 'call'
  "parentMessageId" UUID REFERENCES "DirectMessage"(id) ON DELETE SET NULL, -- Para sistema de Reply
  "editedAt" TIMESTAMPTZ, -- Momento em que a mensagem foi editada
  "durationSeconds" INTEGER, -- Duração de chamadas (call log)
  "attachmentId" UUID REFERENCES "File"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "readAt" TIMESTAMPTZ -- Momento em que o destinatário leu a mensagem (tick de visto)
);

-- Tabela de Grupos
CREATE TABLE "Group" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "ownerId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membros dos Grupos
CREATE TABLE "GroupMember" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "lastReadAt" TIMESTAMPTZ, -- Última leitura do usuário (badge de não lidas)
  "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("groupId", "userId")
);

-- Mensagens dos Grupos
CREATE TABLE "GroupMessage" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  "senderId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "editedAt" TIMESTAMPTZ,
  "attachmentId" UUID REFERENCES "File"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de Bloqueios (Block)
CREATE TABLE "Block" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "blockerId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "blockedId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("blockerId", "blockedId")
);

-- Tabela de Arquivos (uploads)
CREATE TABLE "File" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "filename" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "viewOnce" BOOLEAN NOT NULL DEFAULT false,
  "viewedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de Reações com Emoji
CREATE TABLE "MessageReaction" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" UUID NOT NULL,
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("messageId", "userId", "emoji")
);

-- Tabela de Likes nas Mensagens (Tabela Pivô)
CREATE TABLE "MessageLike" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" UUID NOT NULL REFERENCES "DirectMessage"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("messageId", "userId")
);

-- Tabela de Denúncias (Reports)
CREATE TABLE "Report" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporterId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "reportedId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'RESOLVED'
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de Banimentos (Bans)
CREATE TABLE "Ban" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "bannedBy" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ, -- Nulo para banimento permanente
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar índices para otimizar buscas
CREATE INDEX idx_user_custom_id ON "User"("customId");
CREATE INDEX idx_friendship_user1 ON "Friendship"("userId1");
CREATE INDEX idx_friendship_user2 ON "Friendship"("userId2");
CREATE INDEX idx_dm_sender ON "DirectMessage"("senderId");
CREATE INDEX idx_dm_attachment ON "DirectMessage"("attachmentId");
CREATE INDEX idx_gm_attachment ON "GroupMessage"("attachmentId");
CREATE INDEX idx_block_blocker ON "Block"("blockerId");
CREATE INDEX idx_block_blocked ON "Block"("blockedId");
CREATE INDEX idx_file_owner ON "File"("ownerId");
CREATE INDEX idx_reaction_message ON "MessageReaction"("messageId");
CREATE INDEX idx_dm_receiver ON "DirectMessage"("receiverId");
CREATE INDEX idx_dmlike_msg ON "MessageLike"("messageId");
CREATE INDEX idx_group_msg ON "GroupMessage"("groupId");
CREATE INDEX idx_group_member ON "GroupMember"("groupId");

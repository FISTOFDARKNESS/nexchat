CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customId" TEXT UNIQUE NOT NULL,
  "username" TEXT NOT NULL,
  "email" TEXT UNIQUE,
  "role" TEXT NOT NULL DEFAULT 'user',
  "isGuest" BOOLEAN NOT NULL DEFAULT false,
  "gender" TEXT,
  "country" TEXT,
  "avatarUrl" TEXT,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "bio" TEXT,
  "status" TEXT,
  "lastSeen" TIMESTAMPTZ,
  "lastIp" TEXT,
  "premiumTier" TEXT NOT NULL DEFAULT 'free',
  "premiumSince" TIMESTAMPTZ,
  "premiumExpiresAt" TIMESTAMPTZ,
  "lastNameChangeAt" TIMESTAMPTZ,
  "chatTheme" TEXT,
  "invisibleMode" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "Friendship" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId1" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "userId2" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "senderId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("userId1", "userId2"),
  CONSTRAINT check_users_order CHECK ("userId1" < "userId2")
);

CREATE TABLE "Block" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "blockerId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "blockedId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("blockerId", "blockedId")
);

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
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "storageKey" TEXT
);

CREATE TABLE "DirectMessage" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "senderId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "receiverId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'text',
  "parentMessageId" UUID REFERENCES "DirectMessage"(id) ON DELETE SET NULL,
  "editedAt" TIMESTAMPTZ,
  "durationSeconds" INTEGER,
  "attachmentId" UUID REFERENCES "File"(id) ON DELETE SET NULL,
  "pinnedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "readAt" TIMESTAMPTZ
);

CREATE TABLE "Group" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "ownerId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "GroupMember" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'member',
  "lastReadAt" TIMESTAMPTZ,
  "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("groupId", "userId")
);

CREATE TABLE "GroupMessage" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  "senderId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "editedAt" TIMESTAMPTZ,
  "attachmentId" UUID REFERENCES "File"(id) ON DELETE SET NULL,
  "pinnedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "MessageReaction" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" UUID NOT NULL,
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("messageId", "userId", "emoji")
);

CREATE TABLE "MessageLike" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" UUID NOT NULL REFERENCES "DirectMessage"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("messageId", "userId")
);

CREATE TABLE "Report" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporterId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "reportedId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "Ban" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "bannedBy" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "Warning" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "issuedBy" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "AdminLog" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "adminId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "targetUserId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "EmailBan" (
  "email" TEXT PRIMARY KEY,
  "bannedBy" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_adminlog_created ON "AdminLog"("createdAt" DESC);
CREATE INDEX idx_adminlog_target ON "AdminLog"("targetUserId");

CREATE TABLE "PremiumPurchase" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "paypalOrderId" TEXT UNIQUE,
  "amount" NUMERIC(10, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "daysGranted" INTEGER NOT NULL DEFAULT 30,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completedAt" TIMESTAMPTZ
);

CREATE INDEX idx_user_custom_id ON "User"("customId");
CREATE INDEX idx_friendship_user1 ON "Friendship"("userId1");
CREATE INDEX idx_friendship_user2 ON "Friendship"("userId2");
CREATE INDEX idx_dm_sender ON "DirectMessage"("senderId");
CREATE INDEX idx_dm_receiver ON "DirectMessage"("receiverId");
CREATE INDEX idx_dm_attachment ON "DirectMessage"("attachmentId");
CREATE INDEX idx_dm_pinned ON "DirectMessage"("pinnedAt");
CREATE INDEX idx_gm_attachment ON "GroupMessage"("attachmentId");
CREATE INDEX idx_gm_pinned ON "GroupMessage"("pinnedAt");
CREATE INDEX idx_block_blocker ON "Block"("blockerId");
CREATE INDEX idx_block_blocked ON "Block"("blockedId");
CREATE INDEX idx_file_owner ON "File"("ownerId");
CREATE INDEX idx_reaction_message ON "MessageReaction"("messageId");
CREATE INDEX idx_dmlike_msg ON "MessageLike"("messageId");
CREATE INDEX idx_group_msg ON "GroupMessage"("groupId");
CREATE INDEX idx_group_member ON "GroupMember"("groupId");

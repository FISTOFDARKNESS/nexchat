import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { sanitizeContent } from '@/lib/sanitize';
import { getAuthUser } from '@/lib/session';
import { getSticker } from '@/lib/stickers';
import { areFriends } from '@/lib/realtime';
import {
  ensureLevelsSchema, awardExpForMessage, awardExpForCall, bumpStreak, bumpNoReply, resetNoReply, requiresCaptcha, getLevelStats,
  EXP_MESSAGE_FRIEND, EXP_MESSAGE_STRANGER, EXP_CALL_FRIEND_PER_BLOCK, EXP_CALL_STRANGER,
  CALL_EXP_INTERVAL_SECONDS,
} from '@/lib/levels';

export const EXPIRY_OPTIONS = [300, 3600, 86400];

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    const { searchParams } = new URL(req.url);
    const friendId = searchParams.get('friendId');
    const search = searchParams.get('search');

    if (!friendId) {
      return NextResponse.json({ error: 'friendId é obrigatório' }, { status: 400 });
    }

    let query = `
      SELECT m.id, m."senderId", m."receiverId", m.content, m.type, m."parentMessageId", m."createdAt", m."readAt",
             m."editedAt", m."durationSeconds", m."attachmentId", m."pinnedAt",
             f.mime as "attachMime", f.filename as "attachFilename", f.size as "attachSize", f."viewOnce" as "attachViewOnce",
             pm.content as "parentContent",
             COALESCE(
               (SELECT json_agg(ml."userId") 
                FROM "MessageLike" ml 
                WHERE ml."messageId" = m.id), 
               '[]'::json
             ) as "likedBy"
      FROM "DirectMessage" m
      LEFT JOIN "File" f ON f.id = m."attachmentId"
      LEFT JOIN "DirectMessage" pm ON pm.id = m."parentMessageId"
      WHERE ((m."senderId" = $1 AND m."receiverId" = $2) OR (m."senderId" = $2 AND m."receiverId" = $1))
        AND (m."expiresAt" IS NULL OR m."expiresAt" > now())
    `;
    const params = [userId, friendId];
    if (search && search.trim()) {
      query += ` AND m.content ILIKE $${params.length + 1}`;
      params.push(`%${search.trim()}%`);
    }
    
    const limit = search && search.trim() ? 200 : 100;
    const messages = await sql(
      `SELECT * FROM (${query} ORDER BY m."createdAt" DESC LIMIT ${limit}) recent ORDER BY recent."createdAt" ASC`,
      params
    );

    return NextResponse.json({ success: true, messages });

  } catch (error) {
    console.error('Erro na API de Mensagens (GET):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    const body = await req.json();
    const { action, receiverId, content, parentMessageId, messageId, attachmentId, type, expiresInSeconds } = body;

    if (action === 'send') {
      if (!receiverId || (!content && !attachmentId)) {
        return NextResponse.json({ error: 'receiverId e content/attachment são obrigatórios' }, { status: 400 });
      }
      const msgType = type === 'voice' ? 'voice' : type === 'sticker' ? 'sticker' : 'text';
      
      const blocked = await sql(
        `SELECT 1 FROM "Block"
         WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1) LIMIT 1`,
        [userId, receiverId]
      );
      if (blocked.length > 0) {
        return NextResponse.json({ error: 'Não é possível enviar mensagem para este usuário' }, { status: 403 });
      }

      const friendship = await sql(
        `SELECT 1 FROM "Friendship"
         WHERE status = 'ACCEPTED'
           AND (("userId1" = $1 AND "userId2" = $2) OR ("userId1" = $2 AND "userId2" = $1))
         LIMIT 1`,
        [userId, receiverId]
      );
      if (friendship.length === 0) {
        return NextResponse.json({ error: 'Só é possível enviar mensagens para amigos' }, { status: 403 });
      }

      let parentId = null;
      if (parentMessageId) {
        const parent = await sql(
          `SELECT 1 FROM "DirectMessage"
           WHERE id = $1 AND (("senderId" = $2 AND "receiverId" = $3) OR ("senderId" = $3 AND "receiverId" = $2))
           LIMIT 1`,
          [parentMessageId, userId, receiverId]
        );
        parentId = parent.length > 0 ? parentMessageId : null;
      }

      const premium = await sql(
        `SELECT "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const isPremiumUser = premium[0]?.premiumTier === 'premium' && premium[0]?.premiumExpiresAt && new Date(premium[0].premiumExpiresAt) > new Date();

      let cleanContent = content ? sanitizeContent(content.trim()) : '';
      if (msgType === 'sticker') {
        if (!getSticker(cleanContent)) {
          return NextResponse.json({ error: 'Sticker inválido' }, { status: 400 });
        }
        if (!isPremiumUser) {
          return NextResponse.json({ error: 'Stickers exclusivos para premium. Assine o plano.' }, { status: 403 });
        }
      }

      let expiresAt = null;
      if (expiresInSeconds) {
        const secs = Number(expiresInSeconds);
        if (!EXPIRY_OPTIONS.includes(secs)) {
          return NextResponse.json({ error: 'Tempo de expiração inválido' }, { status: 400 });
        }
        if (!isPremiumUser) {
          return NextResponse.json({ error: 'Mensagens temporárias são exclusivas do premium. Assine o plano.' }, { status: 403 });
        }
        expiresAt = new Date(Date.now() + secs * 1000).toISOString();
      }

      let attachId = null;
      if (attachmentId) {
        const f = await sql('SELECT * FROM "File" WHERE id = $1 AND "ownerId" = $2 LIMIT 1', [attachmentId, userId]);
        if (f.length === 0) {
          return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 400 });
        }
        attachId = attachmentId;
      }

      if (msgType !== 'sticker') {
        cleanContent = sanitizeContent(content.trim());
      }
      if (!cleanContent && !attachId) {
        return NextResponse.json({ error: 'Mensagem vazia após sanitização' }, { status: 400 });
      }

      const maxLen = isPremiumUser ? 5000 : 1000;
      if (cleanContent.length > maxLen) {
        return NextResponse.json({ error: `Mensagem muito longa (máx ${maxLen} caracteres)` }, { status: 413 });
      }

      await ensureLevelsSchema();
      const friend = await areFriends(userId, receiverId);
      if (await requiresCaptcha(userId, receiverId)) {
        return NextResponse.json({ error: 'Verifique que você não é um robô', errorKey: 'msgCaptchaRequired' }, { status: 403 });
      }

      const result = await sql(
        `INSERT INTO "DirectMessage" ("senderId", "receiverId", content, type, "parentMessageId", "attachmentId", "expiresAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, receiverId, cleanContent, msgType, parentId, attachId, expiresAt]
      );

      const msg = result[0];

      const expAward = msgType === 'text' && cleanContent
        ? await awardExpForMessage(userId, receiverId, cleanContent, friend ? EXP_MESSAGE_FRIEND : EXP_MESSAGE_STRANGER, { friend })
        : null;
      const streak = await bumpStreak(userId);
      await bumpNoReply(userId, receiverId);
      await resetNoReply(receiverId, userId); 
      const stats = await getLevelStats(userId);

      let parentContent = null;
      if (msg.parentMessageId) {
        const parentResult = await sql('SELECT content FROM "DirectMessage" WHERE id = $1 LIMIT 1', [msg.parentMessageId]);
        if (parentResult.length > 0) {
          parentContent = parentResult[0].content;
        }
      }

      let attach = null;
      if (attachId) {
        const f = await sql('SELECT id, filename, mime, size, "viewOnce" FROM "File" WHERE id = $1 LIMIT 1', [attachId]);
        if (f.length > 0) attach = f[0];
      }

      return NextResponse.json({
        success: true,
        message: {
          ...msg,
          parentContent,
          likedBy: [],
          attach: attach ? { ...attach, url: `/api/files/${attach.id}` } : null
        },
        stats
      });
    }

    if (action === 'like') {
      if (!messageId || !userId) {
        return NextResponse.json({ error: 'messageId e userId são obrigatórios' }, { status: 400 });
      }

      const deleted = await sql(
        'DELETE FROM "MessageLike" WHERE "messageId" = $1 AND "userId" = $2 RETURNING *',
        [messageId, userId]
      );

      if (deleted.length > 0) {
        
        return NextResponse.json({ success: true, liked: false, userId });
      } else {
        
        await sql(
          'INSERT INTO "MessageLike" ("messageId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [messageId, userId]
        );
        return NextResponse.json({ success: true, liked: true, userId });
      }
    }

    if (action === 'delete') {
      const { messageId } = body;
      if (!messageId) {
        return NextResponse.json({ error: 'messageId é obrigatório' }, { status: 400 });
      }

      const result = await sql(
        'DELETE FROM "DirectMessage" WHERE id = $1 AND "senderId" = $2 RETURNING id',
        [messageId, userId]
      );

      if (result.length === 0) {
        return NextResponse.json({ error: 'Mensagem não encontrada ou sem permissão' }, { status: 404 });
      }

      return NextResponse.json({ success: true, messageId });
    }

    if (action === 'call_log') {
      const { receiverId, callType, durationSeconds } = body;
      if (!receiverId || !callType) {
        return NextResponse.json({ error: 'receiverId e callType são obrigatórios' }, { status: 400 });
      }
      const blocked = await sql(
        `SELECT 1 FROM "Block"
         WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1) LIMIT 1`,
        [userId, receiverId]
      );
      if (blocked.length > 0) {
        return NextResponse.json({ error: 'Não é possível registrar chamada para este usuário' }, { status: 403 });
      }
      const content = callType === 'video' ? 'Chamada de vídeo' : 'Chamada de áudio';
      const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.floor(durationSeconds) : null;
      
      if (callType === 'video') {
        await ensureLevelsSchema();
        const lvlRows = await sql('SELECT level FROM "User" WHERE id = $1 LIMIT 1', [userId]);
        if (!(lvlRows[0]?.level >= 5)) {
          return NextResponse.json({ error: 'Chamada de vídeo liberada a partir do nível 5', errorKey: 'videoLocked' }, { status: 403 });
        }
      }
      const result = await sql(
        `INSERT INTO "DirectMessage" ("senderId", "receiverId", content, type, "durationSeconds")
         SELECT $1, $2, $3, 'call', $4
         WHERE NOT EXISTS (
           SELECT 1 FROM "DirectMessage" c
           WHERE c."senderId" = $1 AND c."receiverId" = $2 AND c.type = 'call'
             AND c."createdAt" > now() - interval '60 seconds'
         )
         RETURNING *`,
        [userId, receiverId, content, duration]
      );
      if (result.length === 0) {
        const existing = await sql(
          `SELECT * FROM "DirectMessage" WHERE "senderId" = $1 AND "receiverId" = $2
             AND type = 'call' AND "createdAt" > now() - interval '60 seconds'
           ORDER BY "createdAt" DESC LIMIT 1`,
          [userId, receiverId]
        );
        return NextResponse.json({ success: true, message: existing[0], duplicate: true });
      }
      
      await ensureLevelsSchema();
      const callFriend = await areFriends(userId, receiverId);
      let expAward = null;
      if (duration && duration >= 60) {
        if (callFriend) {
          const blocks = Math.floor(duration / CALL_EXP_INTERVAL_SECONDS);
          if (blocks >= 1) expAward = await awardExpForCall(userId, receiverId, EXP_CALL_FRIEND_PER_BLOCK * blocks, { friend: true });
        } else {
          expAward = await awardExpForCall(userId, receiverId, EXP_CALL_STRANGER, { friend: false });
        }
      }
      const callStats = await getLevelStats(userId);
      return NextResponse.json({ success: true, message: result[0], stats: callStats, expAward });
    }

    if (action === 'edit') {
      const { messageId: editId, content: editContent } = body;
      if (!editId || !editContent) {
        return NextResponse.json({ error: 'messageId e content são obrigatórios' }, { status: 400 });
      }
      const cleanEdit = sanitizeContent(editContent.trim());
      if (!cleanEdit) {
        return NextResponse.json({ error: 'Mensagem vazia após sanitização' }, { status: 400 });
      }
      const result = await sql(
        `UPDATE "DirectMessage" SET content = $1, "editedAt" = now(), "updatedAt" = now()
         WHERE id = $2 AND "senderId" = $3
         RETURNING *`,
        [cleanEdit, editId, userId]
      );
      if (result.length === 0) {
        return NextResponse.json({ error: 'Mensagem não encontrada ou sem permissão' }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: result[0] });
    }

    if (action === 'read') {
      const { senderId } = body;
      if (!senderId) {
        return NextResponse.json({ error: 'senderId é obrigatório' }, { status: 400 });
      }

      const result = await sql(
        `UPDATE "DirectMessage" SET "readAt" = COALESCE("readAt", now())
         WHERE "receiverId" = $1 AND "senderId" = $2 AND "readAt" IS NULL
         RETURNING id`,
        [userId, senderId]
      );

      return NextResponse.json({ success: true, updated: result.length });
    }

    if (action === 'pin') {
      const { messageId, groupId } = body;
      if (!messageId) {
        return NextResponse.json({ error: 'messageId é obrigatório' }, { status: 400 });
      }
      if (groupId) {
        const membership = await sql(
          `SELECT 1 FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2 LIMIT 1`,
          [groupId, userId]
        );
        if (membership.length === 0) {
          return NextResponse.json({ error: 'Você não é membro deste grupo' }, { status: 403 });
        }
        const exists = await sql(
          `SELECT 1 FROM "GroupMessage" WHERE id = $1 AND "groupId" = $2 LIMIT 1`,
          [messageId, groupId]
        );
        if (exists.length === 0) {
          return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
        }
        const premium = await sql(
          `SELECT "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
          [userId]
        );
        const isPremiumUser = premium[0]?.premiumTier === 'premium' && premium[0]?.premiumExpiresAt && new Date(premium[0].premiumExpiresAt) > new Date();
        const maxPins = isPremiumUser ? 50 : 5;
        const pinnedCount = await sql(
          `SELECT COUNT(*) FROM "GroupMessage" WHERE "groupId" = $1 AND "pinnedAt" IS NOT NULL`,
          [groupId]
        );
        if (Number(pinnedCount[0]?.count || 0) >= maxPins) {
          return NextResponse.json({ error: `Limite de ${maxPins} mensagens fixadas no plano free. Assine premium.` }, { status: 403 });
        }
        await sql(
          `UPDATE "GroupMessage" SET "pinnedAt" = now() WHERE id = $1`,
          [messageId]
        );
        return NextResponse.json({ success: true });
      }
      const msg = await sql(
        'SELECT "senderId", "receiverId" FROM "DirectMessage" WHERE id = $1 LIMIT 1',
        [messageId]
      );
      if (msg.length === 0) {
        return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
      }
      if (msg[0].senderId !== userId && msg[0].receiverId !== userId) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
      const premium = await sql(
        `SELECT "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const isPremiumUser = premium[0]?.premiumTier === 'premium' && premium[0]?.premiumExpiresAt && new Date(premium[0].premiumExpiresAt) > new Date();
      const maxPins = isPremiumUser ? 50 : 5;
      const pinnedCount = await sql(
        `SELECT COUNT(*) FROM "DirectMessage" WHERE ("senderId" = $1 OR "receiverId" = $1) AND "pinnedAt" IS NOT NULL`,
        [userId]
      );
      if (Number(pinnedCount[0]?.count || 0) >= maxPins) {
        return NextResponse.json({ error: `Limite de ${maxPins} mensagens fixadas no plano free. Assine premium.` }, { status: 403 });
      }
      await sql(
        `UPDATE "DirectMessage" SET "pinnedAt" = now() WHERE id = $1`,
        [messageId]
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'unpin') {
      const { messageId, groupId } = body;
      if (!messageId) {
        return NextResponse.json({ error: 'messageId é obrigatório' }, { status: 400 });
      }
      if (groupId) {
        const membership = await sql(
          `SELECT 1 FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2 LIMIT 1`,
          [groupId, userId]
        );
        if (membership.length === 0) {
          return NextResponse.json({ error: 'Você não é membro deste grupo' }, { status: 403 });
        }
        const exists = await sql(
          `SELECT 1 FROM "GroupMessage" WHERE id = $1 AND "groupId" = $2 LIMIT 1`,
          [messageId, groupId]
        );
        if (exists.length === 0) {
          return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
        }
        await sql(
          `UPDATE "GroupMessage" SET "pinnedAt" = NULL WHERE id = $1`,
          [messageId]
        );
        return NextResponse.json({ success: true });
      }
      const msg = await sql(
        'SELECT "senderId", "receiverId" FROM "DirectMessage" WHERE id = $1 LIMIT 1',
        [messageId]
      );
      if (msg.length === 0) {
        return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
      }
      if (msg[0].senderId !== userId && msg[0].receiverId !== userId) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
      await sql(
        `UPDATE "DirectMessage" SET "pinnedAt" = NULL WHERE id = $1`,
        [messageId]
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('Erro na API de Mensagens (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

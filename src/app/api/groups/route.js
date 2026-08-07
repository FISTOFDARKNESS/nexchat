import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import DOMPurify from 'isomorphic-dompurify';
import { getAuthUser } from '@/lib/session';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get('groupId');

    // Detalhe de um grupo (membros + histórico)
    if (groupId) {
      const groups = await sql(
        `SELECT g.id, g.name, g."ownerId" FROM "Group" g
         JOIN "GroupMember" me ON me."groupId" = g.id AND me."userId" = $1
         WHERE g.id = $2 LIMIT 1`,
        [userId, groupId]
      );
      if (groups.length === 0) {
        return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
      }
      const members = await sql(
        `SELECT u.id as "userId", u.username, u."customId", u."avatarUrl", u."isOnline", gm.role
         FROM "GroupMember" gm JOIN "User" u ON u.id = gm."userId"
         WHERE gm."groupId" = $1 ORDER BY gm."joinedAt" ASC`,
        [groupId]
      );
      const messages = await sql(
        `SELECT gm.id, gm."groupId", gm."senderId", gm.content, gm."editedAt", gm."createdAt", gm."attachmentId",
                f.mime as "attachMime", f.filename as "attachFilename", f.size as "attachSize", f."viewOnce" as "attachViewOnce",
                u.username as "senderName"
         FROM "GroupMessage" gm
         LEFT JOIN "File" f ON f.id = gm."attachmentId"
         JOIN "User" u ON u.id = gm."senderId"
         WHERE gm."groupId" = $1 ORDER BY gm."createdAt" ASC`,
        [groupId]
      );
      return NextResponse.json({ success: true, group: groups[0], members, messages });
    }

    // Lista de grupos do usuário (com contagem de não lidas)
    const groups = await sql(
      `SELECT g.id, g.name, g."ownerId", g."createdAt",
              me.role as "myRole",
              (SELECT COUNT(*) FROM "GroupMember" gm WHERE gm."groupId" = g.id)::int AS "memberCount",
              (SELECT COUNT(*) FROM "GroupMessage" gmsg
               WHERE gmsg."groupId" = g.id
                 AND (me."lastReadAt" IS NULL OR gmsg."createdAt" > me."lastReadAt"))::int AS "unreadCount",
              (SELECT content FROM "GroupMessage" lm
               WHERE lm."groupId" = g.id ORDER BY lm."createdAt" DESC LIMIT 1) AS "lastMessage"
       FROM "Group" g
       JOIN "GroupMember" me ON me."groupId" = g.id AND me."userId" = $1
       ORDER BY (SELECT MAX(lm2."createdAt") FROM "GroupMessage" lm2 WHERE lm2."groupId" = g.id) DESC NULLS LAST`,
      [userId]
    );

    return NextResponse.json({ success: true, groups });
  } catch (error) {
    console.error('Erro na API de Grupos (GET):', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
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
    const { action } = body;

    // 1. CRIAR GRUPO
    if (action === 'create') {
      const { name, memberIds } = body;
      if (!name || !name.trim()) {
        return NextResponse.json({ error: 'Nome do grupo é obrigatório' }, { status: 400 });
      }
      if (!Array.isArray(memberIds)) {
        return NextResponse.json({ error: 'memberIds deve ser uma lista' }, { status: 400 });
      }
      const cleanName = DOMPurify.sanitize(name.trim()).slice(0, 40);
      if (!cleanName) {
        return NextResponse.json({ error: 'Nome do grupo inválido' }, { status: 400 });
      }

      const premium = await sql(
        `SELECT "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const isPremiumUser = premium[0]?.premiumTier === 'premium' && premium[0]?.premiumExpiresAt && new Date(premium[0].premiumExpiresAt) > new Date();
      if (!isPremiumUser) {
        const count = await sql('SELECT COUNT(*) FROM "Group" WHERE "ownerId" = $1', [userId]);
        if (Number(count[0]?.count || 0) >= 3) {
          return NextResponse.json({ error: 'Limite de 3 grupos no plano free. Assine premium para criar mais.' }, { status: 403 });
        }
      }

      const members = [...new Set([userId, ...memberIds])];
      if (members.length > 20 && !isPremiumUser) {
        return NextResponse.json({ error: 'Limite de 20 membros no plano free. Assine premium para adicionar mais.' }, { status: 403 });
      }
      const result = await sql(
        `INSERT INTO "Group" (name, "ownerId") VALUES ($1, $2) RETURNING *`,
        [cleanName, userId]
      );
      const group = result[0];
      for (const uid of members) {
        await sql(
          `INSERT INTO "GroupMember" ("groupId", "userId", role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [group.id, uid, uid === userId ? 'owner' : 'member']
        );
      }
      return NextResponse.json({ success: true, group });
    }

    // 2. ADICIONAR MEMBRO
    if (action === 'add_member') {
      const { groupId, userId: targetUserId } = body;
      if (!groupId || !targetUserId) {
        return NextResponse.json({ error: 'groupId e userId são obrigatórios' }, { status: 400 });
      }
      const me = await sql(
        `SELECT role FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2 LIMIT 1`,
        [groupId, userId]
      );
      if (me.length === 0 || !['owner', 'admin'].includes(me[0].role)) {
        return NextResponse.json({ error: 'Sem permissão para adicionar membros' }, { status: 403 });
      }
      const premium = await sql(
        `SELECT "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const isPremiumUser = premium[0]?.premiumTier === 'premium' && premium[0]?.premiumExpiresAt && new Date(premium[0].premiumExpiresAt) > new Date();
      if (!isPremiumUser) {
        const count = await sql('SELECT COUNT(*) FROM "GroupMember" WHERE "groupId" = $1', [groupId]);
        if (Number(count[0]?.count || 0) >= 20) {
          return NextResponse.json({ error: 'Limite de 20 membros no plano free. Assine premium.' }, { status: 403 });
        }
      }
      await sql(
        `INSERT INTO "GroupMember" ("groupId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [groupId, targetUserId]
      );
      return NextResponse.json({ success: true });
    }

    // 3. REMOVER MEMBRO
    if (action === 'remove_member') {
      const { groupId, userId: targetUserId } = body;
      if (!groupId || !targetUserId) {
        return NextResponse.json({ error: 'groupId e userId são obrigatórios' }, { status: 400 });
      }
      const me = await sql(
        `SELECT role FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2 LIMIT 1`,
        [groupId, userId]
      );
      if (me.length === 0) {
        return NextResponse.json({ error: 'Você não é membro deste grupo' }, { status: 403 });
      }
      const target = await sql(
        `SELECT role FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2 LIMIT 1`,
        [groupId, targetUserId]
      );
      if (target.length === 0) {
        return NextResponse.json({ error: 'Usuário não é membro deste grupo' }, { status: 404 });
      }
      if (me[0].role !== 'owner' && (me[0].role !== 'admin' || target[0].role === 'owner')) {
        return NextResponse.json({ error: 'Sem permissão para remover este membro' }, { status: 403 });
      }
      await sql(
        `DELETE FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2`,
        [groupId, targetUserId]
      );
      return NextResponse.json({ success: true });
    }

    // 4. TRANSFERIR ADMIN
    if (action === 'transfer_admin') {
      const { groupId, userId: targetUserId } = body;
      if (!groupId || !targetUserId) {
        return NextResponse.json({ error: 'groupId e userId são obrigatórios' }, { status: 400 });
      }
      const me = await sql(
        `SELECT role FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2 LIMIT 1`,
        [groupId, userId]
      );
      if (me.length === 0 || me[0].role !== 'owner') {
        return NextResponse.json({ error: 'Apenas o dono pode transferir a propriedade' }, { status: 403 });
      }
      await sql(
        `UPDATE "GroupMember" SET role = 'owner' WHERE "groupId" = $1 AND "userId" = $2`,
        [groupId, targetUserId]
      );
      await sql(
        `UPDATE "GroupMember" SET role = 'admin' WHERE "groupId" = $1 AND "userId" = $2 AND role = 'owner'`,
        [groupId, userId]
      );
      await sql(
        `UPDATE "Group" SET "ownerId" = $2 WHERE id = $1`,
        [groupId, targetUserId]
      );
      return NextResponse.json({ success: true });
    }

    // 3. SAIR DO GRUPO
    if (action === 'leave') {
      const { groupId } = body;
      if (!groupId) {
        return NextResponse.json({ error: 'groupId é obrigatório' }, { status: 400 });
      }
      await sql(
        `DELETE FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2`,
        [groupId, userId]
      );
      return NextResponse.json({ success: true });
    }

    // 5. ENVIAR MENSAGEM NO GRUPO
    if (action === 'send') {
      const { groupId, content, attachmentId } = body;
      if (!groupId || (!content && !attachmentId)) {
        return NextResponse.json({ error: 'groupId e content/attachment são obrigatórios' }, { status: 400 });
      }
      const cleanContent = content ? DOMPurify.sanitize(content.trim()) : '';
      if (!cleanContent && !attachmentId) {
        return NextResponse.json({ error: 'Mensagem vazia após sanitização' }, { status: 400 });
      }
      const membership = await sql(
        `SELECT 1 FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2 LIMIT 1`,
        [groupId, userId]
      );
      if (membership.length === 0) {
        return NextResponse.json({ error: 'Você não é membro deste grupo' }, { status: 403 });
      }
      let attachId = null;
      if (attachmentId) {
        const f = await sql('SELECT * FROM "File" WHERE id = $1 AND "ownerId" = $2 LIMIT 1', [attachmentId, userId]);
        if (f.length === 0) {
          return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 400 });
        }
        attachId = attachmentId;
      }
      const result = await sql(
        `INSERT INTO "GroupMessage" ("groupId", "senderId", content, "attachmentId") VALUES ($1, $2, $3, $4) RETURNING *`,
        [groupId, userId, cleanContent, attachId]
      );
      const msg = result[0];
      const sender = await sql(
        `SELECT username FROM "User" WHERE id = $1 LIMIT 1`,
        [userId]
      );
      let attach = null;
      if (attachId) {
        const f = await sql('SELECT id, filename, mime, size, "viewOnce" FROM "File" WHERE id = $1 LIMIT 1', [attachId]);
        if (f.length > 0) attach = f[0];
      }
      return NextResponse.json({
        success: true,
        message: {
          ...msg,
          senderName: sender[0]?.username || 'Usuário',
          attach: attach ? { ...attach, url: `/api/files/${attach.id}` } : null
        }
      });
    }

    // 5. MARCAR GRUPO COMO LIDO
    if (action === 'read') {
      const { groupId } = body;
      if (!groupId) {
        return NextResponse.json({ error: 'groupId é obrigatório' }, { status: 400 });
      }
      await sql(
        `UPDATE "GroupMember" SET "lastReadAt" = now() WHERE "groupId" = $1 AND "userId" = $2`,
        [groupId, userId]
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('Erro na API de Grupos (POST):', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

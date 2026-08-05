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
        `SELECT u.id as "userId", u.username, u."customId", u."avatarUrl", u."isOnline"
         FROM "GroupMember" gm JOIN "User" u ON u.id = gm."userId"
         WHERE gm."groupId" = $1 ORDER BY gm."joinedAt" ASC`,
        [groupId]
      );
      const messages = await sql(
        `SELECT gm.id, gm."groupId", gm."senderId", gm.content, gm."createdAt", u.username as "senderName"
         FROM "GroupMessage" gm JOIN "User" u ON u.id = gm."senderId"
         WHERE gm."groupId" = $1 ORDER BY gm."createdAt" ASC`,
        [groupId]
      );
      return NextResponse.json({ success: true, group: groups[0], members, messages });
    }

    // Lista de grupos do usuário (com contagem de não lidas)
    const groups = await sql(
      `SELECT g.id, g.name, g."ownerId", g."createdAt",
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
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
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

      const members = [...new Set([userId, ...memberIds])];
      const result = await sql(
        `INSERT INTO "Group" (name, "ownerId") VALUES ($1, $2) RETURNING *`,
        [cleanName, userId]
      );
      const group = result[0];
      for (const uid of members) {
        await sql(
          `INSERT INTO "GroupMember" ("groupId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [group.id, uid]
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
      const membership = await sql(
        `SELECT 1 FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2 LIMIT 1`,
        [groupId, userId]
      );
      if (membership.length === 0) {
        return NextResponse.json({ error: 'Você não é membro deste grupo' }, { status: 403 });
      }
      await sql(
        `INSERT INTO "GroupMember" ("groupId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
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

    // 4. ENVIAR MENSAGEM NO GRUPO
    if (action === 'send') {
      const { groupId, content } = body;
      if (!groupId || !content) {
        return NextResponse.json({ error: 'groupId e content são obrigatórios' }, { status: 400 });
      }
      const cleanContent = DOMPurify.sanitize(content.trim());
      if (!cleanContent) {
        return NextResponse.json({ error: 'Mensagem vazia após sanitização' }, { status: 400 });
      }
      const membership = await sql(
        `SELECT 1 FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2 LIMIT 1`,
        [groupId, userId]
      );
      if (membership.length === 0) {
        return NextResponse.json({ error: 'Você não é membro deste grupo' }, { status: 403 });
      }
      const result = await sql(
        `INSERT INTO "GroupMessage" ("groupId", "senderId", content) VALUES ($1, $2, $3) RETURNING *`,
        [groupId, userId, cleanContent]
      );
      const msg = result[0];
      const sender = await sql(
        `SELECT username FROM "User" WHERE id = $1 LIMIT 1`,
        [userId]
      );
      return NextResponse.json({ success: true, message: { ...msg, senderName: sender[0]?.username || 'Usuário' } });
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
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

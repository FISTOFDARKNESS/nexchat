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
    const friendId = searchParams.get('friendId');

    if (!friendId) {
      return NextResponse.json({ error: 'friendId é obrigatório' }, { status: 400 });
    }

    // Busca as mensagens e as informações de quem enviou e respondeu
    const messages = await sql(
      `SELECT m.id, m."senderId", m."receiverId", m.content, m.type, m."parentMessageId", m."createdAt", m."readAt",
              m."editedAt", m."durationSeconds", m."attachmentId",
              pm.content as "parentContent",
              COALESCE(
                (SELECT json_agg(ml."userId") 
                 FROM "MessageLike" ml 
                 WHERE ml."messageId" = m.id), 
                '[]'::json
              ) as "likedBy"
       FROM "DirectMessage" m
       LEFT JOIN "DirectMessage" pm ON pm.id = m."parentMessageId"
       WHERE (m."senderId" = $1 AND m."receiverId" = $2)
          OR (m."senderId" = $2 AND m."receiverId" = $1)
         AND NOT EXISTS (
           SELECT 1 FROM "Block" b
           WHERE (b."blockerId" = m."senderId" AND b."blockedId" = m."receiverId")
              OR (b."blockerId" = m."receiverId" AND b."blockedId" = m."senderId")
         )
       ORDER BY m."createdAt" ASC`,
      [userId, friendId]
    );

    return NextResponse.json({ success: true, messages });

  } catch (error) {
    console.error('Erro na API de Mensagens (GET):', error);
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
    const { action, receiverId, content, parentMessageId, messageId } = body;

    // 1. SALVAR NOVA MENSAGEM (SEND)
    if (action === 'send') {
      if (!receiverId || !content) {
        return NextResponse.json({ error: 'receiverId e content são obrigatórios' }, { status: 400 });
      }
      // Bloqueado (qualquer direção) não pode enviar mensagens
      const blocked = await sql(
        `SELECT 1 FROM "Block"
         WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1) LIMIT 1`,
        [userId, receiverId]
      );
      if (blocked.length > 0) {
        return NextResponse.json({ error: 'Não é possível enviar mensagem para este usuário' }, { status: 403 });
      }

      // Sanitizar conteúdo da mensagem contra XSS
      const cleanContent = DOMPurify.sanitize(content.trim());

      if (cleanContent.length === 0) {
        return NextResponse.json({ error: 'Mensagem vazia após sanitização' }, { status: 400 });
      }

      // Insere no banco
      const result = await sql(
        `INSERT INTO "DirectMessage" ("senderId", "receiverId", content, "parentMessageId")
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, receiverId, cleanContent, parentMessageId || null]
      );

      const msg = result[0];

      // Busca conteúdo da mensagem pai caso seja uma resposta
      let parentContent = null;
      if (msg.parentMessageId) {
        const parentResult = await sql('SELECT content FROM "DirectMessage" WHERE id = $1 LIMIT 1', [msg.parentMessageId]);
        if (parentResult.length > 0) {
          parentContent = parentResult[0].content;
        }
      }

      return NextResponse.json({
        success: true,
        message: {
          ...msg,
          parentContent,
          likedBy: []
        }
      });
    }

    // 2. CURTIR / MARCAR COM LIKE (LIKE)
    if (action === 'like') {
      if (!messageId || !userId) {
        return NextResponse.json({ error: 'messageId e userId são obrigatórios' }, { status: 400 });
      }

      // Tenta apagar o like caso já exista (Toggle)
      const deleted = await sql(
        'DELETE FROM "MessageLike" WHERE "messageId" = $1 AND "userId" = $2 RETURNING *',
        [messageId, userId]
      );

      if (deleted.length > 0) {
        // Retornamos que o like foi removido
        return NextResponse.json({ success: true, liked: false, userId });
      } else {
        // Cria um novo like
        await sql(
          'INSERT INTO "MessageLike" ("messageId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [messageId, userId]
        );
        return NextResponse.json({ success: true, liked: true, userId });
      }
    }

    // 3. APAGAR MENSAGEM (DELETE - apenas o remetente)
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

    // 4. REGISTRAR CHAMADA NO CHAT (CALL LOG)
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
      return NextResponse.json({ success: true, message: result[0] });
    }

    // 5. EDITAR MENSAGEM (apenas remetente)
    if (action === 'edit') {
      const { messageId: editId, content: editContent } = body;
      if (!editId || !editContent) {
        return NextResponse.json({ error: 'messageId e content são obrigatórios' }, { status: 400 });
      }
      const cleanEdit = DOMPurify.sanitize(editContent.trim());
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

    // 5. MARCAR MENSAGENS RECEBIDAS COMO LIDAS (READ)
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

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('Erro na API de Mensagens (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

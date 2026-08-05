import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import DOMPurify from 'isomorphic-dompurify';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const friendId = searchParams.get('friendId');

    if (!userId || !friendId) {
      return NextResponse.json({ error: 'userId e friendId são obrigatórios' }, { status: 400 });
    }

    // Busca as mensagens e as informações de quem enviou e respondeu
    const messages = await sql(
      `SELECT m.id, m."senderId", m."receiverId", m.content, m."parentMessageId", m."createdAt",
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
    const body = await req.json();
    const { action, senderId, receiverId, content, parentMessageId, messageId, userId } = body;

    // 1. SALVAR NOVA MENSAGEM (SEND)
    if (action === 'send') {
      if (!senderId || !receiverId || !content) {
        return NextResponse.json({ error: 'Parâmetros insuficientes para enviar mensagem' }, { status: 400 });
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
        [senderId, receiverId, cleanContent, parentMessageId || null]
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

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('Erro na API de Mensagens (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

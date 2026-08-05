import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

// Função auxiliar para ordenar dois IDs
function sortUserIds(id1, id2) {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    // Buscar lista de amigos aceitos
    // Precisamos unir com a tabela User para pegar as informações do amigo
    const friends = await sql(
      `SELECT f.id as "friendshipId", f.status, f."createdAt",
              u.id as "friendId", u.username, u."customId", u."avatarUrl", u.country, u.gender, u."isOnline",
              (SELECT COUNT(*) FROM "DirectMessage" dm
               WHERE dm."senderId" = u.id AND dm."receiverId" = $1 AND dm."readAt" IS NULL)::int AS "unreadCount"
       FROM "Friendship" f
       JOIN "User" u ON (u.id = CASE WHEN f."userId1" = $1 THEN f."userId2" ELSE f."userId1" END)
       WHERE (f."userId1" = $1 OR f."userId2" = $1) AND f.status = 'ACCEPTED'`,
      [userId]
    );

    // Buscar solicitações de amizades pendentes recebidas por este usuário
    const pendingReceived = await sql(
      `SELECT f.id as "friendshipId", f."createdAt",
              u.id as "friendId", u.username, u."customId", u."avatarUrl", u.country
       FROM "Friendship" f
       JOIN "User" u ON u.id = f."senderId"
       WHERE (f."userId1" = $1 OR f."userId2" = $1) AND f.status = 'PENDING' AND f."senderId" != $1`,
      [userId]
    );

    // Buscar solicitações enviadas por este usuário que ainda estão pendentes
    const pendingSent = await sql(
      `SELECT f.id as "friendshipId", f."createdAt",
              u.id as "friendId", u.username, u."customId", u."avatarUrl", u.country
       FROM "Friendship" f
       JOIN "User" u ON (u.id = CASE WHEN f."userId1" = $1 THEN f."userId2" ELSE f."userId1" END)
       WHERE (f."userId1" = $1 OR f."userId2" = $1) AND f.status = 'PENDING' AND f."senderId" = $1`,
      [userId]
    );

    return NextResponse.json({
      success: true,
      friends,
      pendingReceived,
      pendingSent
    });

  } catch (error) {
    console.error('Erro na API de Amigos (GET):', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, friendId, friendCustomId } = body;

    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    let targetFriendId = friendId;

    // Se receber apenas o customId (ex: nick#4829), busca o ID correspondente
    if (friendCustomId) {
      const users = await sql('SELECT id FROM "User" WHERE "customId" = $1 LIMIT 1', [friendCustomId]);
      if (users.length === 0) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
      }
      targetFriendId = users[0].id;
    }

    if (!targetFriendId) {
      return NextResponse.json({ error: 'friendId ou friendCustomId é obrigatório' }, { status: 400 });
    }

    if (userId === targetFriendId) {
      return NextResponse.json({ error: 'Não é possível realizar amizade consigo mesmo' }, { status: 400 });
    }

    const [u1, u2] = sortUserIds(userId, targetFriendId);

    // 1. ENVIAR PEDIDO DE AMIZADE
    if (action === 'send') {
      // Verifica se já existe amizade ou pedido pendente
      const existing = await sql(
        'SELECT * FROM "Friendship" WHERE "userId1" = $1 AND "userId2" = $2 LIMIT 1',
        [u1, u2]
      );

      if (existing.length > 0) {
        const f = existing[0];
        if (f.status === 'ACCEPTED') {
          return NextResponse.json({ error: 'Vocês já são amigos' }, { status: 400 });
        } else if (f.status === 'BLOCKED') {
          return NextResponse.json({ error: 'Usuário bloqueado' }, { status: 403 });
        } else if (f.status === 'PENDING') {
          if (f.senderId === userId) {
            return NextResponse.json({ error: 'Pedido de amizade já enviado' }, { status: 400 });
          } else {
            // Se o outro já enviou, aceita automaticamente
            const updated = await sql(
              `UPDATE "Friendship" SET status = 'ACCEPTED', "updatedAt" = now()
               WHERE id = $1 RETURNING *`,
              [f.id]
            );
            return NextResponse.json({ success: true, friendship: updated[0], autoAccepted: true });
          }
        }
      }

      // Cria o registro pendente
      const result = await sql(
        `INSERT INTO "Friendship" ("userId1", "userId2", status, "senderId")
         VALUES ($1, $2, 'PENDING', $3)
         RETURNING *`,
        [u1, u2, userId]
      );
      return NextResponse.json({ success: true, friendship: result[0] });
    }

    // 2. ACEITAR PEDIDO DE AMIZADE
    if (action === 'accept') {
      const result = await sql(
        `UPDATE "Friendship" 
         SET status = 'ACCEPTED', "updatedAt" = now()
         WHERE "userId1" = $1 AND "userId2" = $2 AND status = 'PENDING'
         RETURNING *`,
        [u1, u2]
      );

      if (result.length === 0) {
        return NextResponse.json({ error: 'Solicitação pendente não encontrada' }, { status: 404 });
      }
      return NextResponse.json({ success: true, friendship: result[0] });
    }

    // 3. REJEITAR PEDIDO / DESFAZER AMIZADE (REMOVE)
    if (action === 'reject' || action === 'remove') {
      const result = await sql(
        `DELETE FROM "Friendship" 
         WHERE "userId1" = $1 AND "userId2" = $2 AND (status = 'PENDING' OR status = 'ACCEPTED')
         RETURNING *`,
        [u1, u2]
      );

      if (result.length === 0) {
        return NextResponse.json({ error: 'Relacionamento não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: 'Amizade ou convite removido com sucesso' });
    }

    // 4. BLOQUEAR USUÁRIO
    if (action === 'block') {
      const existing = await sql(
        'SELECT * FROM "Friendship" WHERE "userId1" = $1 AND "userId2" = $2 LIMIT 1',
        [u1, u2]
      );

      if (existing.length > 0) {
        const result = await sql(
          `UPDATE "Friendship" 
           SET status = 'BLOCKED', "senderId" = $2, "updatedAt" = now()
           WHERE id = $1 RETURNING *`,
          [existing[0].id, userId]
        );
        return NextResponse.json({ success: true, friendship: result[0] });
      } else {
        const result = await sql(
          `INSERT INTO "Friendship" ("userId1", "userId2", status, "senderId")
           VALUES ($1, $2, 'BLOCKED', $3)
           RETURNING *`,
          [u1, u2, userId]
        );
        return NextResponse.json({ success: true, friendship: result[0] });
      }
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('Erro na API de Amigos (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

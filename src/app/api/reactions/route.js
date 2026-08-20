import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get('messageId');
    if (!messageId) {
      return NextResponse.json({ error: 'messageId é obrigatório' }, { status: 400 });
    }

    const reactions = await sql(
      `SELECT mr."id", mr."messageId", mr."userId", mr."emoji", mr."createdAt",
              u.username, u."customId", u."avatarUrl"
       FROM "MessageReaction" mr
       JOIN "User" u ON u.id = mr."userId"
       WHERE mr."messageId" = $1
       ORDER BY mr."createdAt" ASC`,
      [messageId]
    );

    const grouped = reactions.reduce((acc, r) => {
      const key = r.emoji;
      if (!acc[key]) acc[key] = { emoji: key, count: 0, users: [] };
      acc[key].count += 1;
      acc[key].users.push({ id: r.userId, username: r.username, customId: r.customId, avatarUrl: r.avatarUrl });
      return acc;
    }, {});

    return NextResponse.json({ success: true, reactions: Object.values(grouped) });
  } catch (error) {
    console.error('Erro na API de Reactions (GET):', error);
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
    const { messageId, emoji } = body;

    if (!messageId || !emoji) {
      return NextResponse.json({ error: 'messageId e emoji são obrigatórios' }, { status: 400 });
    }

    const result = await sql(
      `INSERT INTO "MessageReaction" ("messageId", "userId", "emoji")
       VALUES ($1, $2, $3)
       ON CONFLICT ("messageId", "userId", "emoji") DO NOTHING
       RETURNING *`,
      [messageId, userId, emoji]
    );

    if (result.length === 0) {
      return NextResponse.json({ success: true, removed: true });
    }

    return NextResponse.json({ success: true, reaction: result[0] });
  } catch (error) {
    console.error('Erro na API de Reactions (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get('messageId');
    const emoji = searchParams.get('emoji');

    if (!messageId || !emoji) {
      return NextResponse.json({ error: 'messageId e emoji são obrigatórios' }, { status: 400 });
    }

    await sql(
      `DELETE FROM "MessageReaction" WHERE "messageId" = $1 AND "userId" = $2 AND emoji = $3`,
      [messageId, userId, emoji]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro na API de Reactions (DELETE):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

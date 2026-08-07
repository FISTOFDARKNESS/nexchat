import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    const { searchParams } = new URL(req.url);
    const otherId = searchParams.get('otherId');

    // Consulta pontual: estou bloqueado com este usuário (qualquer direção)?
    if (otherId) {
      const rows = await sql(
        `SELECT 1 FROM "Block"
         WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1) LIMIT 1`,
        [userId, otherId]
      );
      return NextResponse.json({ success: true, isBlocked: rows.length > 0 });
    }

    const blocked = await sql(
      `SELECT u.id, u.username, u."customId", u."avatarUrl", u."isOnline", b."createdAt"
       FROM "Block" b JOIN "User" u ON u.id = b."blockedId"
       WHERE b."blockerId" = $1 ORDER BY b."createdAt" DESC`,
      [userId]
    );
    return NextResponse.json({ success: true, blocked });
  } catch (error) {
    console.error('Erro na API de Bloqueios (GET):', error);
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
    const { action, targetId } = await req.json();

    if (!targetId) {
      return NextResponse.json({ error: 'targetId é obrigatório' }, { status: 400 });
    }
    if (targetId === userId) {
      return NextResponse.json({ error: 'Você não pode bloquear a si mesmo' }, { status: 400 });
    }

    if (action === 'block') {
      await sql(
        `INSERT INTO "Block" ("blockerId", "blockedId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, targetId]
      );
      return NextResponse.json({ success: true, blocked: true });
    }

    if (action === 'unblock') {
      await sql(
        `DELETE FROM "Block" WHERE "blockerId" = $1 AND "blockedId" = $2`,
        [userId, targetId]
      );
      return NextResponse.json({ success: true, blocked: false });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('Erro na API de Bloqueios (POST):', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

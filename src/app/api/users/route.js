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
    const customId = searchParams.get('customId');
    const username = searchParams.get('username');
    const id = searchParams.get('id');

    if (!customId && !username && !id) {
      return NextResponse.json({ error: 'Informe customId, username ou id' }, { status: 400 });
    }

    const fields = 'id, username, "customId", "avatarUrl", country, gender, "isOnline", bio, status, "lastSeen", "createdAt"';
    let rows = [];

    if (customId) {
      rows = await sql(`SELECT ${fields} FROM "User" WHERE "customId" = $1 LIMIT 1`, [customId]);
    } else if (username) {
      rows = await sql(`SELECT ${fields} FROM "User" WHERE username = $1 LIMIT 1`, [username]);
    } else {
      rows = await sql(`SELECT ${fields} FROM "User" WHERE id = $1 LIMIT 1`, [id]);
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Erro na API de Usuários (GET):', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

// Atualizar o próprio perfil (bio, status, avatar)
export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;
    const body = await req.json();
    const { bio, status, avatarUrl } = body;

    const sets = [];
    const values = [];
    if (typeof bio === 'string') {
      sets.push('bio = $' + (values.length + 1));
      values.push(bio.trim().slice(0, 160) || null);
    }
    if (typeof status === 'string') {
      sets.push('status = $' + (values.length + 1));
      values.push(status.trim().slice(0, 40) || null);
    }
    if (typeof avatarUrl === 'string') {
      sets.push('"avatarUrl" = $' + (values.length + 1));
      values.push(avatarUrl || null);
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
    }
    sets.push('"updatedAt" = now()');
    values.push(userId);

    const result = await sql(
      `UPDATE "User" SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING id, username, "customId", "avatarUrl", country, gender, "isOnline", bio, status, "lastSeen"`,
      values
    );
    return NextResponse.json({ success: true, user: result[0] });
  } catch (error) {
    console.error('Erro na API de Usuários (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

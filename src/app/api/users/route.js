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

    const fields = 'id, username, "customId", "avatarUrl", country, gender, "isOnline", "createdAt"';
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

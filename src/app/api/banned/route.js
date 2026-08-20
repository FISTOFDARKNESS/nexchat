import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const ban = await sql(
      `SELECT id, reason, "expiresAt", "createdAt"
       FROM "Ban"
       WHERE "userId" = $1
         AND ("expiresAt" IS NULL OR "expiresAt" > now())
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [auth.id]
    );

    if (ban.length > 0) {
      return NextResponse.json({ success: true, banned: true, ban: ban[0] });
    }
    return NextResponse.json({ success: true, banned: false });
  } catch (error) {
    console.error('Erro na API de Banned (GET):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userRows = await sql(`SELECT role FROM "User" WHERE id = $1 LIMIT 1`, [auth.id]);
    if (userRows.length === 0 || userRows[0].role !== 'admin') {
      return NextResponse.json({ error: 'Não autenticado ou sem permissão' }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });
    }
    const warnings = await sql(
      `SELECT w.id, w."userId", w."issuedBy", w.reason, w."createdAt", u.username as "issuerName"
       FROM "Warning" w
       LEFT JOIN "User" u ON u.id = w."issuedBy"
       WHERE w."userId" = $1
       ORDER BY w."createdAt" DESC`,
      [userId]
    );
    const bans = await sql(
      `SELECT b.id, b."userId", b."bannedBy", b.reason, b."expiresAt", b."createdAt", u.username as "bannerName"
       FROM "Ban" b
       LEFT JOIN "User" u ON u.id = b."bannedBy"
       WHERE b."userId" = $1
       ORDER BY b."createdAt" DESC`,
      [userId]
    );
    return NextResponse.json({ success: true, warnings, bans });
  } catch (error) {
    console.error('Erro na API de Warnings (GET):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userRows = await sql(`SELECT role FROM "User" WHERE id = $1 LIMIT 1`, [auth.id]);
    if (userRows.length === 0 || userRows[0].role !== 'admin') {
      return NextResponse.json({ error: 'Não autenticado ou sem permissão' }, { status: 403 });
    }
    const body = await req.json();
    const { userId, reason, action } = body;

    if (!userId || !reason) {
      return NextResponse.json({ error: 'userId e reason são obrigatórios' }, { status: 400 });
    }

    if (action === 'warn') {
      await sql(
        `INSERT INTO "Warning" ("userId", "issuedBy", reason) VALUES ($1, $2, $3)`,
        [userId, auth.id, reason]
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'ban') {
      const { expiresAt } = body;
      await sql(
        `INSERT INTO "Ban" ("userId", "bannedBy", reason, "expiresAt") VALUES ($1, $2, $3, $4)`,
        [userId, auth.id, reason, expiresAt || null]
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('Erro na API de Warnings (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser, sessionRevoked } from '@/lib/session';
import { ONLINE_EXPR } from '@/lib/realtime';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    if (await sessionRevoked(req)) {
      return NextResponse.json({ error: 'Sessão revogada.', requireLogin: true }, { status: 401 });
    }
    const rows = await sql(
      `SELECT id, username, "customId", "avatarUrl", country, gender, ${ONLINE_EXPR} as "isOnline",
              bio, status, "lastSeen", "premiumTier", "premiumSince", "premiumExpiresAt", verified,
              "chatTheme", "invisibleMode", "createdAt", role, level, exp, "streakCount", "streakLastDate",
               "streakRecoveriesUsed", "streakRecoveryMonth", email,
               "twoFactorEnabled", "emailVerified"
        FROM "User" WHERE id = $1 LIMIT 1`,
      [auth.id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Conta não encontrada' }, { status: 401 });
    }
    return NextResponse.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Erro no GET /api/auth/me:', error.message);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
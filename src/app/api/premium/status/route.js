import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { PREMIUM_PRICE, PREMIUM_CURRENCY, PREMIUM_DAYS, isPremium } from '@/lib/premium';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    let user = null;
    try {
      const rows = await sql(
        `SELECT id, username, "customId", "avatarUrl", role, "premiumTier", "premiumSince", "premiumExpiresAt", "invisibleMode", "chatTheme", "lastNameChangeAt"
         FROM "User" WHERE id = $1 LIMIT 1`,
        [auth.id]
      );
      user = rows[0] || null;
    } catch (e) {
      console.error('[Premium] status db error:', e);
      return NextResponse.json({ error: 'Erro ao buscar usuário' }, { status: 500 });
    }

    const premium = isPremium(user);

    return NextResponse.json({
      success: true,
      premium,
      price: PREMIUM_PRICE,
      currency: PREMIUM_CURRENCY,
      days: PREMIUM_DAYS,
      user
    });
  } catch (error) {
    console.error('[Premium] status error:', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

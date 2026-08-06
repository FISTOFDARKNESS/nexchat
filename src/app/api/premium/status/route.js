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
    const premium = await isPremium(auth.id);

    let user = null;
    try {
      const rows = await sql(
        `SELECT id, username, "customId", "avatarUrl", role, "premiumTier", "premiumExpiresAt", "invisibleMode", "chatTheme", "lastNameChangeAt"
         FROM "User" WHERE id = $1 LIMIT 1`,
        [auth.id]
      );
      user = rows[0] || null;
    } catch {
      user = null;
    }

    return NextResponse.json({
      success: true,
      premium,
      price: PREMIUM_PRICE,
      currency: PREMIUM_CURRENCY,
      days: PREMIUM_DAYS,
      user
    });
  } catch (error) {
    console.error('Erro no status do Premium:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

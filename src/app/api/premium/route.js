import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

function isPremium(user) {
  if (!user) return false;
  if (user.premiumTier !== 'premium') return false;
  if (!user.premiumExpiresAt) return false;
  return new Date(user.premiumExpiresAt) > new Date();
}

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const user = await sql(
      `SELECT "premiumTier", "premiumSince", "premiumExpiresAt", "chatTheme", "invisibleMode"
       FROM "User" WHERE id = $1 LIMIT 1`,
      [auth.id]
    );
    const u = user[0] || {};
    const active = isPremium(u);
    return NextResponse.json({
      success: true,
      premium: active,
      tier: active ? 'premium' : 'free',
      premiumSince: u.premiumSince,
      premiumExpiresAt: u.premiumExpiresAt,
      chatTheme: u.chatTheme,
      invisibleMode: u.invisibleMode,
    });
  } catch (error) {
    console.error('Erro na API de Premium (GET):', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

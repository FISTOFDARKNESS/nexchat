import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { isPremium } from '@/lib/premium';
import { hasPendingGift } from '@/lib/gifts';
import { getClientIp } from '@/lib/ip';
import { rateLimit } from '@/lib/ratelimit';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    
    const rl = rateLimit(`search:${getClientIp(req)}`, 30, 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Muitas buscas. Tente novamente em alguns segundos.', errorKey: 'tooManyAttempts' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    if (!q || q.length < 3) return NextResponse.json({ success: true, users: [] });

    const rows = await sql(
      `SELECT id, username, "customId", "avatarUrl", email, "isGuest", "premiumTier", "premiumExpiresAt"
       FROM "User"
       WHERE (username ILIKE $1 OR "customId" ILIKE $1)
         AND id <> $2
         AND NOT EXISTS (SELECT 1 FROM "Ban" b WHERE b."userId" = "User".id AND (b."expiresAt" IS NULL OR b."expiresAt" > now()))
       ORDER BY username ASC
       LIMIT 8`,
      [`%${q}%`, auth.id]
    );

    const users = [];
    for (const u of rows) {
      const hasPremium = isPremium(u);
      const hasPending = await hasPendingGift(u.id);
      users.push({
        id: u.id,
        username: u.username,
        customId: u.customId,
        avatarUrl: u.avatarUrl,
        isGoogle: !!u.email && !u.isGuest,
        hasPremium,
        hasPending,
        canReceive: !!u.email && !u.isGuest && !hasPremium && !hasPending,
      });
    }
    return NextResponse.json({ success: true, users });
  } catch (e) {
    console.error('Erro em GET /api/users/search:', e.message);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
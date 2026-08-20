import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { sql } from '@/lib/db';
import { isPremium } from '@/lib/premium';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const friends = await sql(
      `SELECT f."createdAt" AS "friendshipCreatedAt",
              u.id AS "userId", u.username, u."avatarUrl", u.email, u."isGuest",
              u."createdAt" AS "accountCreatedAt", u."premiumTier", u."premiumExpiresAt"
       FROM "Friendship" f
       JOIN "User" u ON u.id = CASE WHEN f."userId1" = $1 THEN f."userId2" ELSE f."userId1" END
       WHERE f.status = 'ACCEPTED' AND (f."userId1" = $1 OR f."userId2" = $1)
       ORDER BY u.username ASC`,
      [auth.id]
    );

    const friendIds = friends.map((f) => f.userId);
    let pending = new Set();
    if (friendIds.length > 0) {
      const rows = await sql(
        `SELECT DISTINCT "recipientId" FROM "Gift"
         WHERE "recipientId" = ANY($1) AND paid = true AND status = 'PENDING' AND "expiresAt" > now()`,
        [friendIds]
      );
      pending = new Set(rows.map((r) => r.recipientId));
    }

    const result = friends.map((f) => {
      const friendDays = Math.max(0, Math.floor((Date.now() - new Date(f.friendshipCreatedAt).getTime()) / 86400000));
      const accountDays = Math.max(0, Math.floor((Date.now() - new Date(f.accountCreatedAt).getTime()) / 86400000));
      return {
        userId: f.userId,
        username: f.username,
        avatarUrl: f.avatarUrl,
        friendDays,
        fastTrack: false,
        isGoogle: !!f.email && !f.isGuest,
        hasPremium: isPremium(f),
        accountDays,
        hasPendingGift: pending.has(f.userId),
        canReceive: !!f.email && !f.isGuest && !isPremium(f) && !pending.has(f.userId),
      };
    });

    return NextResponse.json({ success: true, friends: result });
  } catch (error) {
    console.error('Erro na API de Presentes friends:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
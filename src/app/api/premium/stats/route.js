import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { isPremium } from '@/lib/premium';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    const user = await sql(
      `SELECT "premiumTier", "premiumExpiresAt", "premiumSince" FROM "User" WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (!isPremium(user[0])) {
      return NextResponse.json({ success: true, premiumRequired: true, stats: null });
    }

    const [sent, calls, reactions, files, friends, groups] = await Promise.all([
      sql(
        `SELECT
           (SELECT COUNT(*) FROM "DirectMessage" WHERE "senderId" = $1)::int AS directMsgs,
           (SELECT COUNT(*) FROM "GroupMessage" WHERE "senderId" = $1)::int AS groupMsgs,
           (SELECT COALESCE(SUM("durationSeconds"), 0) FROM "DirectMessage" WHERE "senderId" = $1 AND type = 'call')::int AS callSeconds`,
        [userId]
      ),
      sql(
        `SELECT COUNT(*)::int AS callsMade FROM "DirectMessage" WHERE "senderId" = $1 AND type = 'call'`,
        [userId]
      ),
      sql(
        `SELECT
           (SELECT COUNT(*) FROM "MessageReaction" WHERE "userId" = $1)::int AS reactions,
           (SELECT COUNT(*) FROM "MessageLike" WHERE "userId" = $1)::int AS likes`,
        [userId]
      ),
      sql(
        `SELECT COUNT(*)::int AS files FROM "File" WHERE "ownerId" = $1`,
        [userId]
      ),
      sql(
        `SELECT COUNT(*)::int AS friends FROM "Friendship" WHERE ("userId1" = $1 OR "userId2" = $1) AND status = 'ACCEPTED'`,
        [userId]
      ),
      sql(
        `SELECT COUNT(*)::int AS groups FROM "GroupMember" WHERE "userId" = $1`,
        [userId]
      )
    ]);

    const s = sent[0] || {};
    const c = calls[0] || {};
    const r = reactions[0] || {};
    const premiumSince = user[0]?.premiumSince ? new Date(user[0].premiumSince) : null;
    const premiumExpires = user[0]?.premiumExpiresAt ? new Date(user[0].premiumExpiresAt) : null;

    return NextResponse.json({
      success: true,
      premiumRequired: false,
      stats: {
        msgsSent: (s.directMsgs || 0) + (s.groupMsgs || 0),
        directMsgs: s.directMsgs || 0,
        groupMsgs: s.groupMsgs || 0,
        callsMade: c.callsMade || 0,
        callMinutes: Math.floor((s.callSeconds || 0) / 60),
        reactions: r.reactions || 0,
        likes: r.likes || 0,
        files: files[0]?.files || 0,
        friends: friends[0]?.friends || 0,
        groups: groups[0]?.groups || 0,
        premiumDays: premiumSince && premiumExpires
          ? Math.max(1, Math.ceil((premiumExpires - premiumSince) / (24 * 60 * 60 * 1000)))
          : 0
      }
    });
  } catch (error) {
    console.error('Erro na API de Stats Premium:', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

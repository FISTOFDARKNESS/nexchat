import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { getClientIp } from '@/lib/ip';

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const invite = await sql(
      'SELECT id, code, clicks, conversions, "createdAt" FROM "Invite" WHERE "userId" = $1 LIMIT 1',
      [auth.id]
    );

    const hasPremium = await sql(
      `SELECT "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
      [auth.id]
    );
    const isPremium = hasPremium[0]?.premiumTier === 'premium' && hasPremium[0]?.premiumExpiresAt && new Date(hasPremium[0].premiumExpiresAt) > new Date();

    return NextResponse.json({
      invite: invite[0] || null,
      isPremium,
      requiredConversions: 25
    });
  } catch (error) {
    console.error('Error in invite status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
      const existing = await sql(
        'SELECT id FROM "Invite" WHERE "userId" = $1 LIMIT 1',
        [auth.id]
      );

      if (existing.length > 0) {
        return NextResponse.json({ error: 'You already have an invite code' }, { status: 400 });
      }

      let code = generateInviteCode();
      let attempts = 0;
      while (attempts < 10) {
        const check = await sql('SELECT id FROM "Invite" WHERE code = $1 LIMIT 1', [code]);
        if (check.length === 0) break;
        code = generateInviteCode();
        attempts++;
      }

      const result = await sql(
        `INSERT INTO "Invite" ("userId", code) VALUES ($1, $2) RETURNING id, code, clicks, conversions, "createdAt"`,
        [auth.id, code]
      );

      return NextResponse.json({ success: true, invite: result[0] });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error creating invite:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

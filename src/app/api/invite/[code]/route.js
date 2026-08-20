import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/ip';

export async function GET(req, ctx) {
  try {
    const { code } = await ctx.params;
    const ip = getClientIp(req);

    const invite = await sql(
      'SELECT id, "userId", clicks, conversions FROM "Invite" WHERE code = $1 LIMIT 1',
      [code]
    );

    if (invite.length === 0) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    const inviteId = invite[0].id;

    if (ip) {
      try {
        const existing = await sql(
          'SELECT id FROM "InviteClick" WHERE "inviteId" = $1 AND ip = $2 LIMIT 1',
          [inviteId, ip]
        );
        if (existing.length === 0) {
          await sql(
            `INSERT INTO "InviteClick" ("inviteId", "ip", "country") VALUES ($1, $2, $3)`,
            [inviteId, ip, null]
          ).catch(() => {});
        }
      } catch (e) {
        console.error('InviteClick tracking skipped:', e.message);
      }
    }

    const inviter = await sql(
      'SELECT username, "avatarUrl", "premiumTier" FROM "User" WHERE id = $1 LIMIT 1',
      [invite[0].userId]
    );

    return NextResponse.json({
      success: true,
      code,
      inviter: inviter[0] || null
    });
  } catch (error) {
    console.error('Error in invite GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req, ctx) {
  try {
    const { code } = await ctx.params;
    const ip = getClientIp(req);

    const invite = await sql(
      'SELECT id FROM "Invite" WHERE code = $1 LIMIT 1',
      [code]
    );

    if (invite.length === 0) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (ip) {
      try {
        const existing = await sql(
          'SELECT id FROM "InviteClick" WHERE "inviteId" = $1 AND ip = $2 LIMIT 1',
          [invite[0].id, ip]
        );
        if (existing.length > 0) {
          return NextResponse.json({ success: true, clicks: 0, duplicate: true });
        }
      } catch (e) {
        console.error('InviteClick dedupe skipped:', e.message);
      }
    }

    await sql(
      `UPDATE "Invite" SET clicks = clicks + 1, "updatedAt" = now() WHERE id = $1`,
      [invite[0].id]
    );

    const updated = await sql(
      'SELECT clicks FROM "Invite" WHERE id = $1 LIMIT 1',
      [invite[0].id]
    );

    return NextResponse.json({ success: true, clicks: updated[0]?.clicks || 0 });
  } catch (error) {
    console.error('Error in invite POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

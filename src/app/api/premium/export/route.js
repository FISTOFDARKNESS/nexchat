import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    const dms = await sql(
      `SELECT id, "senderId", "receiverId", content, type, "parentMessageId", "editedAt", "durationSeconds", "attachmentId", "createdAt", "readAt"
       FROM "DirectMessage"
       WHERE "senderId" = $1 OR "receiverId" = $1
       ORDER BY "createdAt" ASC`,
      [userId]
    );

    const groups = await sql(
      `SELECT gm.id, gm."groupId", gm."senderId", gm.content, gm."editedAt", gm."attachmentId", gm."createdAt", g.name as "groupName"
       FROM "GroupMessage" gm
       JOIN "Group" g ON g.id = gm."groupId"
       WHERE gm."senderId" = $1 OR EXISTS (
         SELECT 1 FROM "GroupMember" m WHERE m."groupId" = gm."groupId" AND m."userId" = $1
       )
       ORDER BY gm."createdAt" ASC`,
      [userId]
    );

    return NextResponse.json({
      success: true,
      exportedAt: new Date().toISOString(),
      directMessages: dms,
      groupMessages: groups,
    });
  } catch (error) {
    console.error('Erro na API de Premium export:', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

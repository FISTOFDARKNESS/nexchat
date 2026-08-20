import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { sql } from '@/lib/db';
import { createGift, processGiftMaintenance } from '@/lib/gifts';

function getHost(req) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!host) return 'http://localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const origin = getHost(req);
    const result = await createGift({
      giverId: auth.id,
      recipientId: body.recipientId,
      plan: body.plan,
      lang: body.lang,
      message: body.message,
      isAnonymous: body.isAnonymous,
      deliverAt: body.deliverAt,
      origin,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro na API de Presentes (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    
    await processGiftMaintenance(getHost(req)).catch(() => {});

    const sent = await sql(
      `SELECT g.*, u.username AS "recipientUsername", u."avatarUrl" AS "recipientAvatar"
       FROM "Gift" g JOIN "User" u ON u.id = g."recipientId"
       WHERE g."giverId" = $1 AND g.paid = true
       ORDER BY g."createdAt" DESC LIMIT 100`,
      [auth.id]
    );
    const received = await sql(
      `SELECT g.*, u.username AS "giverUsername", u."avatarUrl" AS "giverAvatar"
       FROM "Gift" g JOIN "User" u ON u.id = g."giverId"
       WHERE g."recipientId" = $1 AND g.paid = true
       ORDER BY g."createdAt" DESC LIMIT 100`,
      [auth.id]
    );
    return NextResponse.json({ success: true, sent, received });
  } catch (error) {
    console.error('Erro na API de Presentes (GET):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
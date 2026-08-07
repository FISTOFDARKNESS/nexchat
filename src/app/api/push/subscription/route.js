import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import webpush from 'web-push';

webpush.setVapidDetails(
  `mailto:${process.env.SMTP_FROM || 'no-reply@nexchat.app'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const { endpoint, p256dh, auth: pushAuth, userAgent } = await req.json();
    if (!endpoint || !p256dh || !pushAuth) {
      return NextResponse.json({ error: 'Dados de subscription inválidos' }, { status: 400 });
    }

    await sql(
      `INSERT INTO "PushSubscription" ("userId", endpoint, p256dh, auth, "userAgent")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET "userId" = $1, p256dh = $3, auth = $4, "userAgent" = $5, "updatedAt" = now()`,
      [auth.id, endpoint, p256dh, pushAuth, userAgent || null]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar push subscription:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const { endpoint } = await req.json();
    if (endpoint) {
      await sql(`DELETE FROM "PushSubscription" WHERE endpoint = $1 AND "userId" = $2`, [endpoint, auth.id]);
    } else {
      await sql(`DELETE FROM "PushSubscription" WHERE "userId" = $1`, [auth.id]);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover push subscription:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

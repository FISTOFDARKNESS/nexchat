import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { retargetGift } from '@/lib/gifts';

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
    const result = await retargetGift(body.code, auth.id, body.recipientId, body.lang, getHost(req));
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro na API de Presentes retarget:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
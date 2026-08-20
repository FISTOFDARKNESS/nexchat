import { NextResponse } from 'next/server';
import { getAuthUser, getSecret, sessionRevoked } from '@/lib/session';

export async function GET(req) {
  const auth = getAuthUser(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (await sessionRevoked(req)) return NextResponse.json({ error: 'Sessão revogada.', requireLogin: true }, { status: 401 });

  const secret = getSecret();

  const now = Date.now();
  const payload = {
    id: auth.id,
    ws: true,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + 5 * 60 * 1000) / 1000), 
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const crypto = await import('crypto');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const token = `${data}.${sig}`;

  return NextResponse.json({ token });
}

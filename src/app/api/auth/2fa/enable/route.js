import { NextResponse } from 'next/server';
import { getAuthUser, encryptUserToken, setSessionCookie, bumpSessionVersion } from '@/lib/session';
import { sql } from '@/lib/db';
import { verifyCode } from '@/lib/twofa';

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const { code } = await req.json();

    const users = await sql('SELECT * FROM "User" WHERE id = $1 LIMIT 1', [auth.id]);
    if (users.length === 0) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const user = users[0];

    if (!user.email) {
      return NextResponse.json({ error: 'Vincule um e-mail antes de ativar o 2FA.', errorKey: 'noEmail' }, { status: 400 });
    }
    if (!code || !(await verifyCode(user.id, 'enable_2fa', code))) {
      return NextResponse.json({ error: 'Código inválido ou expirado.', errorKey: 'invalidCode' }, { status: 400 });
    }

    const updated = await sql(
      'UPDATE "User" SET "twoFactorEnabled" = true, "emailVerified" = true, "updatedAt" = now() WHERE id = $1 RETURNING *',
      [user.id]
    );

    const newV = await bumpSessionVersion(user.id);
    updated[0].sessionVersion = newV;

    return setSessionCookie(NextResponse.json({ success: true, user: updated[0], token: encryptUserToken(updated[0]) }), updated[0]);
  } catch (e) {
    console.error('Erro ao ativar 2FA:', e);
    return NextResponse.json({ error: 'Erro ao ativar 2FA' }, { status: 500 });
  }
}

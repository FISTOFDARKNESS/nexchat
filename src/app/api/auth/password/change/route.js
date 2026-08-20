import { NextResponse } from 'next/server';
import { getAuthUser, encryptUserToken, setSessionCookie, bumpSessionVersion } from '@/lib/session';
import { sql } from '@/lib/db';
import { verifyCode } from '@/lib/twofa';
import { hashPassword, verifyPassword } from '@/lib/password';

function validatePassword(pw) {
  if (!pw || String(pw).length < 8) {
    const err = new Error('Password must have at least 8 characters');
    err.status = 400;
    err.errorKey = 'passwordTooShort';
    throw err;
  }
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const { currentPassword, newPassword, code } = await req.json();
    validatePassword(newPassword);

    const users = await sql('SELECT * FROM "User" WHERE id = $1 LIMIT 1', [auth.id]);
    if (users.length === 0) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const user = users[0];

    if (user.passwordHash) {
      if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
        return NextResponse.json({ error: 'Senha atual incorreta.', errorKey: 'incorrectPassword' }, { status: 401 });
      }
    }

    if (!code || !(await verifyCode(user.id, 'change_password', code))) {
      return NextResponse.json({ error: 'Código inválido ou expirado.', errorKey: 'invalidCode' }, { status: 400 });
    }

    const passwordHash = hashPassword(newPassword);
    const updated = await sql(
      'UPDATE "User" SET "passwordHash" = $1, "updatedAt" = now() WHERE id = $2 RETURNING *',
      [passwordHash, user.id]
    );

    const v = await bumpSessionVersion(user.id);
    const finalUser = { ...updated[0], sessionVersion: v };

    return setSessionCookie(NextResponse.json({ success: true, user: finalUser, token: encryptUserToken(finalUser) }), finalUser);
  } catch (e) {
    const status = e.status || 500;
    return NextResponse.json(
      { error: status === 400 && e.message ? e.message : 'Erro ao alterar senha', errorKey: e.errorKey },
      { status }
    );
  }
}

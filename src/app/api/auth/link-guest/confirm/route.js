import { NextResponse } from 'next/server';
import { getAuthUser, encryptUserToken, setSessionCookie } from '@/lib/session';
import { sql } from '@/lib/db';
import { verifyCode } from '@/lib/twofa';
import { hashPassword } from '@/lib/password';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const { email, password, code } = await req.json();
    if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'E-mail inválido.', errorKey: 'invalidEmail' }, { status: 400 });
    if (!password || String(password).length < 8) {
      return NextResponse.json({ error: 'A senha deve ter ao menos 8 caracteres.', errorKey: 'passwordTooShort' }, { status: 400 });
    }

    const taken = await sql('SELECT id FROM "User" WHERE email = $1 AND id != $2 LIMIT 1', [email, auth.id]);
    if (taken.length > 0) return NextResponse.json({ error: 'Este e-mail já está em uso.', errorKey: 'emailTaken' }, { status: 400 });

    if (!code || !(await verifyCode(auth.id, 'link_guest', code))) {
      return NextResponse.json({ error: 'Código inválido ou expirado.', errorKey: 'invalidCode' }, { status: 400 });
    }

    const passwordHash = hashPassword(password);
    const updated = await sql(
      `UPDATE "User" SET email = $1, "passwordHash" = $2, "isGuest" = false, "emailVerified" = true, "updatedAt" = now()
       WHERE id = $3 RETURNING *`,
      [email, passwordHash, auth.id]
    );

    return setSessionCookie(NextResponse.json({ success: true, user: updated[0], token: encryptUserToken(updated[0]) }), updated[0]);
  } catch (e) {
    console.error('Erro ao confirmar vínculo:', e);
    return NextResponse.json({ error: 'Erro ao vincular conta' }, { status: 500 });
  }
}

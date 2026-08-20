import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { setSessionCookie, encryptUserToken } from '@/lib/session';
import { getClientIp } from '@/lib/ip';
import { rateLimit } from '@/lib/ratelimit';
import { verifyCode, sendTwoFactorLockEmail } from '@/lib/twofa';

const MAX_ATTEMPTS = 3;
const LOCK_MS = 24 * 60 * 60 * 1000;

export async function POST(req) {
  try {
    const ip = getClientIp(req);
    const { username, code, lang } = await req.json();

    if (!username || !code) {
      return NextResponse.json({ error: 'Usuário e código são obrigatórios' }, { status: 400 });
    }

    const rl = rateLimit(`2fa-login:${ip}`, 10, 10 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Tente novamente em alguns minutos.', errorKey: 'tooManyAttempts' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const users = await sql(
      'SELECT * FROM "User" WHERE username = $1 AND "passwordHash" IS NOT NULL AND "twoFactorEnabled" = true LIMIT 1',
      [username]
    );
    if (users.length === 0) {
      return NextResponse.json({ error: 'Usuário ou código inválido.', errorKey: 'invalidCode' }, { status: 401 });
    }
    const user = users[0];

    if (user.twoFactorLockUntil && new Date(user.twoFactorLockUntil).getTime() > Date.now()) {
      return NextResponse.json(
        { error: 'Conta bloqueada por 24h. Contate um administrador para desbloquear.', errorKey: 'lockedLogin', lockUntil: new Date(user.twoFactorLockUntil).toISOString() },
        { status: 423 }
      );
    }

    const ok = await verifyCode(user.id, 'login_2fa', String(code));
    if (!ok) {
      const attempts = (user.twoFactorAttempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await sql(
          'UPDATE "User" SET "twoFactorLockUntil" = now() + interval \'24 hours\', "twoFactorAttempts" = 0, "updatedAt" = now() WHERE id = $1',
          [user.id]
        );
        await sendTwoFactorLockEmail({ id: user.id, email: user.email }, lang).catch(() => {});
        return NextResponse.json(
          { error: 'Muitas tentativas. Conta bloqueada por 24h. Contate um administrador.', errorKey: 'lockedLogin', lockUntil: new Date(Date.now() + LOCK_MS).toISOString() },
          { status: 423 }
        );
      }
      await sql('UPDATE "User" SET "twoFactorAttempts" = $1, "updatedAt" = now() WHERE id = $2', [attempts, user.id]);
      return NextResponse.json(
        { error: `Código inválido. Restam ${MAX_ATTEMPTS - attempts} tentativa(s).`, errorKey: 'invalidCode', attemptsLeft: MAX_ATTEMPTS - attempts },
        { status: 401 }
      );
    }

    await sql('UPDATE "User" SET "twoFactorAttempts" = 0, "twoFactorLockUntil" = NULL, "updatedAt" = now() WHERE id = $1', [user.id]);
    return setSessionCookie(NextResponse.json({ success: true, user, token: encryptUserToken(user) }), user);
  } catch (error) {
    console.error('Erro no login-verify 2FA:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

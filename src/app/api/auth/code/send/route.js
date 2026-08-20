import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { sql } from '@/lib/db';
import { sendCode } from '@/lib/twofa';
import { getLastMailError } from '@/lib/supportEmail';
import { rateLimit } from '@/lib/ratelimit';

const ALLOWED = ['enable_2fa', 'disable_2fa', 'change_password', 'disconnect_device'];

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const { purpose, lang } = await req.json();
    if (!ALLOWED.includes(purpose)) return NextResponse.json({ error: 'Propósito inválido' }, { status: 400 });

    const rl = rateLimit(`2fa:${auth.id}`, 5, 24 * 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Limite de 5 e-mails por dia atingido. Tente novamente amanhã.', errorKey: 'tooManyCodes' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const users = await sql('SELECT id, email FROM "User" WHERE id = $1 LIMIT 1', [auth.id]);
    if (users.length === 0) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const user = users[0];
    if (!user.email) {
      return NextResponse.json({ error: 'Esta conta não possui e-mail vinculado.', errorKey: 'noEmail' }, { status: 400 });
    }

    const sent = await sendCode(user, purpose, lang);
    if (!sent) {
      return NextResponse.json({ error: 'Não foi possível enviar o e-mail. Tente novamente.', errorKey: 'emailFailed', detail: getLastMailError() }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Erro ao enviar código 2FA:', e);
    return NextResponse.json({ error: 'Erro ao enviar código' }, { status: 500 });
  }
}

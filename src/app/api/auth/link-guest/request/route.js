import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { sql } from '@/lib/db';
import { sendCode } from '@/lib/twofa';
import { rateLimit } from '@/lib/ratelimit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const rl = rateLimit(`linkguest:${auth.id}`, 5, 24 * 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Limite de 5 e-mails por dia atingido. Tente novamente amanhã.', errorKey: 'tooManyCodes' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const { email, password, lang } = await req.json();
    if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'E-mail inválido.', errorKey: 'invalidEmail' }, { status: 400 });
    if (!password || String(password).length < 8) {
      return NextResponse.json({ error: 'A senha deve ter ao menos 8 caracteres.', errorKey: 'passwordTooShort' }, { status: 400 });
    }

    const me = await sql('SELECT id, "isGuest", email FROM "User" WHERE id = $1 LIMIT 1', [auth.id]);
    if (me.length === 0) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    
    if (!me[0].isGuest && me[0].email) {
      return NextResponse.json({ error: 'Esta conta já possui e-mail vinculado.', errorKey: 'alreadyLinked' }, { status: 400 });
    }

    const taken = await sql('SELECT id FROM "User" WHERE email = $1 AND id != $2 LIMIT 1', [email, auth.id]);
    if (taken.length > 0) return NextResponse.json({ error: 'Este e-mail já está em uso.', errorKey: 'emailTaken' }, { status: 400 });

    const sent = await sendCode({ id: auth.id, email }, 'link_guest', lang);
    if (!sent) return NextResponse.json({ error: 'Não foi possível enviar o e-mail.', errorKey: 'emailFailed' }, { status: 502 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Erro ao solicitar vínculo:', e);
    return NextResponse.json({ error: 'Erro ao solicitar vínculo' }, { status: 500 });
  }
}

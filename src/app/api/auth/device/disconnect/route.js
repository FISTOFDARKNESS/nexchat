import { NextResponse } from 'next/server';
import { getAuthUser, bumpSessionVersion } from '@/lib/session';
import { sql } from '@/lib/db';
import { verifyCode } from '@/lib/twofa';

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const { code } = await req.json();

    const users = await sql('SELECT id, email FROM "User" WHERE id = $1 LIMIT 1', [auth.id]);
    if (users.length === 0) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const user = users[0];

    if (!user.email) {
      return NextResponse.json({ error: 'Esta conta não possui e-mail vinculado.', errorKey: 'noEmail' }, { status: 400 });
    }
    if (!code || !(await verifyCode(user.id, 'disconnect_device', code))) {
      return NextResponse.json({ error: 'Código inválido ou expirado.', errorKey: 'invalidCode' }, { status: 400 });
    }

    await bumpSessionVersion(user.id);

    return NextResponse.json({ success: true, requireLogin: true });
  } catch (e) {
    console.error('Erro ao desconectar dispositivo:', e);
    return NextResponse.json({ error: 'Erro ao desconectar dispositivo' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { verifyRecaptcha } from '@/lib/captcha';
import { resetNoReply, getLevelStats } from '@/lib/levels';

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const { token, peerId } = await req.json().catch(() => ({}));
    const res = await verifyRecaptcha(token);
    if (!res.ok) return NextResponse.json({ error: 'Falha na verificação anti-bot' }, { status: 403 });
    if (peerId) await resetNoReply(auth.id, peerId);
    return NextResponse.json({ success: true, stats: await getLevelStats(auth.id) });
  } catch (e) {
    console.error('Erro em /api/captcha/verify:', e.message);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
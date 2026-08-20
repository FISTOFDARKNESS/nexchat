import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { getLevelStats, recoverStreak } from '@/lib/levels';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const stats = await getLevelStats(auth.id);
    if (!stats) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    return NextResponse.json({ success: true, stats });
  } catch (e) {
    console.error('Erro em GET /api/levels:', e.message);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const res = await recoverStreak(auth.id);
    if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true, stats: res });
  } catch (e) {
    console.error('Erro em POST /api/levels/recover:', e.message);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
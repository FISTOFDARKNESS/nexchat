import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { refuseGift } from '@/lib/gifts';

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const result = await refuseGift(body.code, auth.id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro na API de Presentes refuse:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
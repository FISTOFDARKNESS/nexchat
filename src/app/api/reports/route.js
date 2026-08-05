import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const { reporterId, reportedId, reason, details } = body;

    if (!reporterId || !reportedId || !reason) {
      return NextResponse.json({ error: 'Parâmetros insuficientes' }, { status: 400 });
    }

    if (reporterId === reportedId) {
      return NextResponse.json({ error: 'Você não pode denunciar a si mesmo' }, { status: 400 });
    }

    const result = await sql(
      `INSERT INTO "Report" ("reporterId", "reportedId", reason, details)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [reporterId, reportedId, reason, details || '']
    );

    return NextResponse.json({ success: true, report: result[0] });

  } catch (error) {
    console.error('Erro na API de Denúncias:', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

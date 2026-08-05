import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

// Função para validar se o usuário é administrador
async function checkAdmin(userId) {
  if (!userId) return false;
  const users = await sql('SELECT role FROM "User" WHERE id = $1 LIMIT 1', [userId]);
  if (users.length === 0) return false;
  return users[0].role === 'admin' || users[0].role === 'moderator';
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const adminUserId = searchParams.get('adminUserId');

    const isAdmin = await checkAdmin(adminUserId);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Acesso negado: Apenas administradores' }, { status: 403 });
    }

    // Busca relatórios juntando os dados de denunciante e denunciado
    const reports = await sql(
      `SELECT r.id, r.reason, r.details, r.status, r."createdAt",
              u1.username as "reporterName", u1."customId" as "reporterCustomId",
              u2.id as "reportedId", u2.username as "reportedName", u2."customId" as "reportedCustomId",
              COALESCE(
                (SELECT TRUE FROM "Ban" b 
                 WHERE b."userId" = r."reportedId" 
                   AND (b."expiresAt" IS NULL OR b."expiresAt" > now()) 
                 LIMIT 1),
                FALSE
              ) as "isCurrentlyBanned"
       FROM "Report" r
       JOIN "User" u1 ON u1.id = r."reporterId"
       JOIN "User" u2 ON u2.id = r."reportedId"
       ORDER BY r."createdAt" DESC`
    );

    return NextResponse.json({ success: true, reports });

  } catch (error) {
    console.error('Erro na API Admin (GET):', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, adminUserId, targetUserId, reason, durationDays } = body;

    const isAdmin = await checkAdmin(adminUserId);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Acesso negado: Apenas administradores' }, { status: 403 });
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId é obrigatório' }, { status: 400 });
    }

    // 1. BANIR USUÁRIO
    if (action === 'ban') {
      if (!reason) {
        return NextResponse.json({ error: 'Motivo do banimento é obrigatório' }, { status: 400 });
      }

      let expiresAt = null;
      if (durationDays && parseInt(durationDays) > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(durationDays));
      }

      // Cria o banimento
      const ban = await sql(
        `INSERT INTO "Ban" ("userId", "bannedBy", reason, "expiresAt")
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [targetUserId, adminUserId, reason, expiresAt]
      );

      return NextResponse.json({ success: true, message: 'Usuário banido com sucesso', ban: ban[0] });
    }

    // 2. DESBANIR USUÁRIO (UNBAN)
    if (action === 'unban') {
      await sql('DELETE FROM "Ban" WHERE "userId" = $1', [targetUserId]);
      return NextResponse.json({ success: true, message: 'Usuário desbanido com sucesso' });
    }

    // 3. ALTERAR FUNÇÃO (ATRIBUIR ADMIN)
    if (action === 'set_role') {
      const { role } = body; // 'user', 'moderator', 'admin'
      if (!role) {
        return NextResponse.json({ error: 'Role é obrigatório' }, { status: 400 });
      }

      const updated = await sql(
        'UPDATE "User" SET role = $1, "updatedAt" = now() WHERE id = $2 RETURNING *',
        [role, targetUserId]
      );
      return NextResponse.json({ success: true, user: updated[0] });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('Erro na API Admin (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

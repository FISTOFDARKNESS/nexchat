import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

// Função para validar se o usuário é administrador
async function checkAdmin(userId) {
  if (!userId) return false;
  const users = await sql('SELECT role FROM "User" WHERE id = $1 LIMIT 1', [userId]);
  if (users.length === 0) return false;
  return users[0].role === 'admin' || users[0].role === 'moderator';
}

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const adminUserId = auth.id;

    const isAdmin = await checkAdmin(adminUserId);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Acesso negado: Apenas administradores' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'stats') {
      const activeUsers = await sql(`SELECT COUNT(*) FROM "User" WHERE "isOnline" = true`);
      const totalUsers = await sql(`SELECT COUNT(*) FROM "User"`);
      const totalMessages = await sql(`SELECT COUNT(*) FROM "DirectMessage"`);
      const totalGroupMessages = await sql(`SELECT COUNT(*) FROM "GroupMessage"`);
      const totalCalls = await sql(`SELECT COUNT(*) FROM "DirectMessage" WHERE type = 'call'`);
      const totalBans = await sql(`SELECT COUNT(*) FROM "Ban" WHERE "expiresAt" IS NULL OR "expiresAt" > now()`);
      const totalFiles = await sql(`SELECT COUNT(*) FROM "File"`);
      const totalWarnings = await sql(`SELECT COUNT(*) FROM "Warning"`);

      const messagesPerDay = await sql(`
        SELECT date_trunc('day', "createdAt") as day, COUNT(*) as count
        FROM "DirectMessage"
        WHERE "createdAt" > now() - interval '7 days'
        GROUP BY day ORDER BY day ASC
      `);

      const topUploaders = await sql(`
        SELECT u.username, COUNT(f.id) as count
        FROM "File" f
        JOIN "User" u ON u.id = f."ownerId"
        GROUP BY u.username ORDER BY count DESC LIMIT 10
      `);

      return NextResponse.json({
        success: true,
        stats: {
          activeUsers: Number(activeUsers[0]?.count || 0),
          totalUsers: Number(totalUsers[0]?.count || 0),
          totalMessages: Number(totalMessages[0]?.count || 0),
          totalGroupMessages: Number(totalGroupMessages[0]?.count || 0),
          totalCalls: Number(totalCalls[0]?.count || 0),
          totalBans: Number(totalBans[0]?.count || 0),
          totalFiles: Number(totalFiles[0]?.count || 0),
          totalWarnings: Number(totalWarnings[0]?.count || 0),
          messagesPerDay: messagesPerDay.map(r => ({ day: r.day, count: Number(r.count) })),
          topUploaders: topUploaders.map(r => ({ username: r.username, count: Number(r.count) }))
        }
      });
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
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const adminUserId = auth.id;

    const body = await req.json();
    const { action, targetUserId, reason, durationDays } = body;

    const isAdmin = await checkAdmin(adminUserId);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Acesso negado: Apenas administradores' }, { status: 403 });
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId é obrigatório' }, { status: 400 });
    }

    // 1. ADVERTIR USUÁRIO (WARN)
    if (action === 'warn') {
      if (!reason) {
        return NextResponse.json({ error: 'Motivo da advertência é obrigatório' }, { status: 400 });
      }
      await sql(
        `INSERT INTO "Warning" ("userId", "issuedBy", reason) VALUES ($1, $2, $3)`,
        [targetUserId, adminUserId, reason]
      );
      return NextResponse.json({ success: true, message: 'Usuário advertido com sucesso' });
    }

    // 2. BANIR USUÁRIO
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

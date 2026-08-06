import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser, verifyUserToken } from '@/lib/session';
import { storageDelete } from '@/lib/storage';
import { grantPremium, revokePremium } from '@/lib/premium';

// Função para validar se o usuário é administrador
async function checkAdmin(userId) {
  if (!userId) return false;
  const users = await sql('SELECT role FROM "User" WHERE id = $1 LIMIT 1', [userId]);
  if (users.length === 0) return false;
  return users[0].role === 'admin' || users[0].role === 'moderator';
}

// Registra qualquer ação do admin no AdminLog
async function logAdminAction(adminId, action, targetUserId = null, details = null) {
  try {
    await sql(
      `INSERT INTO "AdminLog" ("adminId", action, "targetUserId", details) VALUES ($1, $2, $3, $4)`,
      [adminId, action, targetUserId, details ? JSON.stringify(details) : null]
    );
  } catch (e) {
    console.error('Erro ao registrar ação admin:', e.message);
  }
}

function getIo() {
  return globalThis.__nexchatIo || null;
}

// Desconecta todos os sockets do usuário e manda o cliente deslogar
async function kickUser(userId, reason = 'Sua conta foi desconectada por um administrador.') {
  const io = getIo();
  if (!io) return;
  for (const [id, sock] of io.sockets.sockets) {
    let sessionId = null;
    const cookie = sock.handshake?.headers?.cookie || '';
    const m = cookie.match(/(?:^|;\s*)nexchat_session=([^;]+)/);
    if (m) {
      try {
        sessionId = verifyUserToken(decodeURIComponent(m[1]))?.id || null;
      } catch {
        sessionId = null;
      }
    }
    if (sessionId === userId) {
      sock.emit('force_logout', { reason });
      sock.disconnect(true);
    }
  }
}

// Marca as denúncias contra o usuário como resolvidas
async function resolveReports(targetUserId) {
  try {
    await sql('UPDATE "Report" SET status = $1 WHERE "reportedId" = $2 AND status = $3', ['RESOLVED', targetUserId, 'PENDING']);
  } catch (e) {
    console.error('Erro ao resolver denúncias:', e.message);
  }
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

    // Busca de usuários (admin)
    if (action === 'users') {
      const q = (searchParams.get('q') || '').trim();
      const users = await sql(
        `SELECT u.id, u.username, u."customId", u.email, u.role, u."isGuest", u."isOnline", u.gender, u.country,
                u."lastSeen", u."lastIp", u."premiumTier", u."premiumExpiresAt", u."createdAt",
                (SELECT COUNT(*) FROM "Warning" w WHERE w."userId" = u.id) AS "warningCount",
                (SELECT reason FROM "Ban" b WHERE b."userId" = u.id AND (b."expiresAt" IS NULL OR b."expiresAt" > now())
                 ORDER BY b."createdAt" DESC LIMIT 1) AS "activeBanReason"
         FROM "User" u
         WHERE u.username ILIKE $1 OR u."customId" ILIKE $1 OR COALESCE(u.email, '') ILIKE $1
         ORDER BY u."createdAt" DESC LIMIT 20`,
        [`%${q}%`]
      );
      return NextResponse.json({ success: true, users });
    }

    // Histórico de um usuário (mensagens, arquivos, denúncias)
    if (action === 'user_history') {
      const userId = searchParams.get('userId');
      if (!userId) {
        return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });
      }
      const directMsgs = await sql(
        `SELECT id, content, type, "createdAt", "senderId", "receiverId", "attachmentId"
         FROM "DirectMessage"
         WHERE "senderId" = $1 OR "receiverId" = $1
         ORDER BY "createdAt" DESC LIMIT 15`,
        [userId]
      );
      const groupMsgs = await sql(
        `SELECT gm.id, gm.content, gm."createdAt", gm."groupId", g.name AS "groupName"
         FROM "GroupMessage" gm
         JOIN "Group" g ON g.id = gm."groupId"
         WHERE gm."senderId" = $1
         ORDER BY gm."createdAt" DESC LIMIT 15`,
        [userId]
      );
      const files = await sql(
        `SELECT id, filename, mime, size, "viewOnce", "createdAt" FROM "File" WHERE "ownerId" = $1 ORDER BY "createdAt" DESC LIMIT 15`,
        [userId]
      );
      const reports = await sql(
        `SELECT r.id, r.reason, r.details, r.status, r."createdAt", u.username AS "reporterName"
         FROM "Report" r JOIN "User" u ON u.id = r."reporterId"
         WHERE r."reportedId" = $1 ORDER BY r."createdAt" DESC LIMIT 15`,
        [userId]
      );
      return NextResponse.json({ success: true, history: { directMsgs, groupMsgs, files, reports } });
    }

    // Lista de avisos (admin)
    if (action === 'warnings') {
      const warnings = await sql(
        `SELECT w.id, w.reason, w."createdAt",
                u.id AS "userId", u.username AS "userName", u."customId",
                a.username AS "issuedByName"
         FROM "Warning" w
         JOIN "User" u ON u.id = w."userId"
         LEFT JOIN "User" a ON a.id = w."issuedBy"
         ORDER BY w."createdAt" DESC LIMIT 50`
      );
      return NextResponse.json({ success: true, warnings });
    }

    // Mídias recentes (admin)
    if (action === 'files') {
      const files = await sql(
        `SELECT f.id, f.filename, f.mime, f.size, f."viewOnce", f."createdAt", f."storageKey",
                u.username AS "ownerName", u.id AS "ownerId"
         FROM "File" f
         JOIN "User" u ON u.id = f."ownerId"
         ORDER BY f."createdAt" DESC LIMIT 30`
      );
      return NextResponse.json({ success: true, files });
    }

    // Log de ações dos admins
    if (action === 'admin_logs') {
      const logs = await sql(
        `SELECT l.id, l.action, l.details, l."createdAt",
                a.username AS "adminName",
                t.username AS "targetName"
         FROM "AdminLog" l
         LEFT JOIN "User" a ON a.id = l."adminId"
         LEFT JOIN "User" t ON t.id = l."targetUserId"
         ORDER BY l."createdAt" DESC LIMIT 50`
      );
      return NextResponse.json({ success: true, logs });
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

    // Ações que precisam de um usuário-alvo
    if (['warn', 'ban', 'unban', 'set_role', 'kick'].includes(action) && !targetUserId) {
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
      await resolveReports(targetUserId);
      await logAdminAction(adminUserId, 'warn', targetUserId, { reason });
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

      await resolveReports(targetUserId);
      await logAdminAction(adminUserId, 'ban', targetUserId, { reason, expiresAt });
      // Banidos saem na hora (sockets desconectados)
      kickUser(targetUserId, `Você foi banido: ${reason}`);

      return NextResponse.json({ success: true, message: 'Usuário banido com sucesso', ban: ban[0] });
    }

    // 2. DESBANIR USUÁRIO (UNBAN)
    if (action === 'unban') {
      await sql('DELETE FROM "Ban" WHERE "userId" = $1', [targetUserId]);
      await logAdminAction(adminUserId, 'unban', targetUserId, {});
      return NextResponse.json({ success: true, message: 'Usuário desbanido com sucesso' });
    }

    // 3. ALTERAR FUNÇÃO (ATRIBUIR ADMIN)
    if (action === 'set_role') {      const { role } = body; // 'user', 'moderator', 'admin'
      if (!role || !['user', 'moderator', 'admin'].includes(role)) {
        return NextResponse.json({ error: 'Role inválido' }, { status: 400 });
      }
      if (targetUserId === adminUserId) {
        return NextResponse.json({ error: 'Você não pode alterar seu próprio role' }, { status: 400 });
      }

      const updated = await sql(
        'UPDATE "User" SET role = $1, "updatedAt" = now() WHERE id = $2 RETURNING *',
        [role, targetUserId]
      );
      await logAdminAction(adminUserId, 'set_role', targetUserId, { role });
      return NextResponse.json({ success: true, user: updated[0] });
    }

    // 3.5 CONCEDER PREMIUM
    if (action === 'grant_premium') {
      const { days } = body;
      const daysNum = Math.max(1, parseInt(days, 10) || 30);
      const updated = await grantPremium(targetUserId, daysNum);
      await logAdminAction(adminUserId, 'grant_premium', targetUserId, { days: daysNum });
      return NextResponse.json({ success: true, message: `Premium concedido por ${daysNum} dias`, user: updated });
    }

    // 3.6 REVOGAR PREMIUM
    if (action === 'revoke_premium') {
      const updated = await revokePremium(targetUserId);
      await logAdminAction(adminUserId, 'revoke_premium', targetUserId, {});
      return NextResponse.json({ success: true, message: 'Premium revogado', user: updated });
    }

    // 4. REMOVER ADVERTÊNCIA
    if (action === 'remove_warning') {
      const { warningId } = body;
      if (!warningId) {
        return NextResponse.json({ error: 'warningId é obrigatório' }, { status: 400 });
      }
      await sql('DELETE FROM "Warning" WHERE id = $1', [warningId]);
      await logAdminAction(adminUserId, 'remove_warning', targetUserId, { warningId });
      return NextResponse.json({ success: true, message: 'Advertência removida' });
    }

    // 5. APAGAR MENSAGEM (qualquer chat)
    if (action === 'delete_message') {
      const { messageId, table } = body; // table: 'direct' | 'group'
      if (!messageId) {
        return NextResponse.json({ error: 'messageId é obrigatório' }, { status: 400 });
      }
      if (!['direct', 'group'].includes(table)) {
        return NextResponse.json({ error: 'table deve ser direct ou group' }, { status: 400 });
      }

      let attachmentId = null;
      let roomId = null;
      if (table === 'direct') {
        const msgs = await sql('SELECT "attachmentId", "senderId", "receiverId" FROM "DirectMessage" WHERE id = $1', [messageId]);
        if (msgs.length === 0) {
          return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
        }
        attachmentId = msgs[0].attachmentId;
        const ids = [msgs[0].senderId, msgs[0].receiverId].sort();
        roomId = `friend_chat_${ids[0]}_${ids[1]}`;
        await sql('DELETE FROM "DirectMessage" WHERE id = $1', [messageId]);
      } else {
        const msgs = await sql('SELECT "attachmentId", "groupId" FROM "GroupMessage" WHERE id = $1', [messageId]);
        if (msgs.length === 0) {
          return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
        }
        attachmentId = msgs[0].attachmentId;
        roomId = `group_chat_${msgs[0].groupId}`;
        await sql('DELETE FROM "GroupMessage" WHERE id = $1', [messageId]);
      }

      // Remove a mídia anexada (arquivo + bucket)
      let deletedFileId = null;
      if (attachmentId) {
        const files = await sql('SELECT "storageKey" FROM "File" WHERE id = $1', [attachmentId]);
        if (files.length > 0) {
          if (files[0].storageKey) {
            await storageDelete(files[0].storageKey);
          }
          await sql('DELETE FROM "File" WHERE id = $1', [attachmentId]);
          deletedFileId = attachmentId;
        }
      }

      // Notifica os chats afetados para limparem a mensagem em tempo real
      const io = getIo();
      if (io && roomId) {
        io.to(roomId).emit('admin_msg_deleted', { messageId, table, fileId: deletedFileId });
      }
      io?.emit('media_deleted', { id: deletedFileId });

      await logAdminAction(adminUserId, 'delete_message', targetUserId, { messageId, table, fileId: deletedFileId });
      return NextResponse.json({ success: true, message: 'Mensagem removida' });
    }

    // 6. APAGAR ARQUIVO/MÍDIA
    if (action === 'delete_file') {
      const { fileId } = body;
      if (!fileId) {
        return NextResponse.json({ error: 'fileId é obrigatório' }, { status: 400 });
      }
      const files = await sql('SELECT "storageKey" FROM "File" WHERE id = $1', [fileId]);
      if (files.length === 0) {
        return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
      }
      if (files[0].storageKey) {
        await storageDelete(files[0].storageKey);
      }
      await sql('DELETE FROM "File" WHERE id = $1', [fileId]);
      getIo()?.emit('media_deleted', { id: fileId });
      await logAdminAction(adminUserId, 'delete_file', targetUserId, { fileId });
      return NextResponse.json({ success: true, message: 'Mídia removida' });
    }

    // 7. KICK / FORÇAR LOGOUT
    if (action === 'kick') {
      await kickUser(targetUserId, 'Você foi desconectado por um administrador.');
      await logAdminAction(adminUserId, 'kick', targetUserId, {});
      return NextResponse.json({ success: true, message: 'Usuário desconectado' });
    }

    // 8. BROADCAST GLOBAL
    if (action === 'broadcast') {
      const { message } = body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        return NextResponse.json({ error: 'Mensagem do broadcast é obrigatória' }, { status: 400 });
      }
      const admin = await sql('SELECT username FROM "User" WHERE id = $1', [adminUserId]);
      getIo()?.emit('global_announcement', {
        message: message.trim(),
        adminName: admin[0]?.username || 'Admin',
        createdAt: new Date().toISOString()
      });
      await logAdminAction(adminUserId, 'broadcast', null, { message: message.trim() });
      return NextResponse.json({ success: true, message: 'Anúncio enviado para todos' });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('Erro na API Admin (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

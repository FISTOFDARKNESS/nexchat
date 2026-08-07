import { readFile, unlink } from 'fs/promises';
import path from 'path';
import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { storageFetch, storageDelete } from '@/lib/storage';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function GET(req, ctx) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;
    const { id } = await ctx.params;

    const rows = await sql('SELECT * FROM "File" WHERE id = $1 LIMIT 1', [id]);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }
    const file = rows[0];
    const isOwner = file.ownerId === userId;

    // Expirou (view-once 24h)
    if (file.expiresAt && new Date(file.expiresAt) < new Date()) {
      await cleanup(file);
      return NextResponse.json({ error: 'Arquivo expirado' }, { status: 404 });
    }

    // View-once já visualizado: some de vez
    if (file.viewOnce && file.viewedAt && !isOwner) {
      await cleanup(file);
      return NextResponse.json({ error: 'Arquivo expirado' }, { status: 404 });
    }

    // Controle de acesso: dono, participantes do DM, membros do grupo ou avatar de um amigo
    let allowed = isOwner;
    if (!allowed) {
      const dm = await sql(
        `SELECT 1 FROM "DirectMessage" WHERE "attachmentId" = $1 AND ($2 = "senderId" OR $2 = "receiverId") LIMIT 1`,
        [id, userId]
      );
      allowed = dm.length > 0;
    }
    if (!allowed) {
      const gm = await sql(
        `SELECT 1 FROM "GroupMessage" gm
         JOIN "GroupMember" gmem ON gmem."groupId" = gm."groupId" AND gmem."userId" = $2
         WHERE gm."attachmentId" = $1 LIMIT 1`,
        [id, userId]
      );
      allowed = gm.length > 0;
    }
    if (!allowed) {
      // Avatar de outro usuário: libera para quem tem amizade (qualquer status) e não está bloqueado
      const av = await sql(
        `SELECT 1 FROM "User" WHERE ("avatarUrl" = '/files/' || $1 OR "avatarUrl" = '/api/files/' || $1) AND id = $2 LIMIT 1`,
        [id, file.ownerId]
      );
      if (av.length > 0) {
        const fr = await sql(
          `SELECT 1 FROM "Friendship"
           WHERE ("userId1" = $1 AND "userId2" = $2) OR ("userId1" = $2 AND "userId2" = $1) LIMIT 1`,
          [userId, file.ownerId]
        );
        const bl = await sql(
          `SELECT 1 FROM "Block"
           WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1) LIMIT 1`,
          [userId, file.ownerId]
        );
        allowed = fr.length > 0 && bl.length === 0;
      }
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Sem permissão para acessar este arquivo' }, { status: 403 });
    }

    // Lê o arquivo ANTES de marcar como visto (se sumiu, não consome o view-once)
    let data;
    try {
      data = file.storageKey
        ? await storageFetch(file.storageKey)
        : await readFile(path.join(UPLOADS_DIR, file.storagePath));
    } catch {
      await sql('DELETE FROM "File" WHERE id = $1', [id]);
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    // View-once: primeira visualização de um não-dono marca como visto
    let markViewed = false;
    if (file.viewOnce && !file.viewedAt && !isOwner) {
      await sql(`UPDATE "File" SET "viewedAt" = now() WHERE id = $1`, [id]);
      markViewed = true;
      // Avisa o DM inteiro (remetente e destinatário) para remover a mensagem após 15s
      const dm = await sql(
        `SELECT id, "senderId", "receiverId" FROM "DirectMessage" WHERE "attachmentId" = $1 LIMIT 1`,
        [id]
      );
      if (dm.length > 0 && globalThis.__nexchatIo) {
        const sorted = [dm[0].senderId, dm[0].receiverId].sort();
        globalThis.__nexchatIo
          .to(`friend_chat_${sorted[0]}_${sorted[1]}`)
          .emit('view_once_viewed', { messageId: dm[0].id, fileId: id });
      }
      // Após 15s some de vez: arquivo (storage/disco) + registro + mensagem
      if (dm.length > 0) {
        const messageId = dm[0].id;
        setTimeout(async () => {
          try {
            await cleanup(file);
          } catch { /* melhor esforço */ }
          await sql('DELETE FROM "DirectMessage" WHERE id = $1', [messageId]).catch(() => {});
        }, 15_000);
      } else {
        setTimeout(() => cleanup(file).catch(() => {}), 15_000);
      }
    }

    return new NextResponse(data, {
      headers: {
        'Content-Type': file.mime,
        'Content-Length': String(data.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline'
      }
    });
  } catch (error) {
    console.error('Erro na API de Arquivos:', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

// Remove do bucket/disco e do banco
async function cleanup(file) {
  if (file.storageKey) {
    await storageDelete(file.storageKey).catch(() => {});
  } else {
    try {
      await unlink(path.join(UPLOADS_DIR, file.storagePath));
    } catch { /* arquivo já não existe */ }
  }
  await sql('DELETE FROM "File" WHERE id = $1', [file.id]);
}

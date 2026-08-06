import { readFile, unlink } from 'fs/promises';
import path from 'path';
import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

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

    // Controle de acesso: dono, participantes do DM ou membros do grupo
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
      return NextResponse.json({ error: 'Sem permissão para acessar este arquivo' }, { status: 403 });
    }

    // View-once: primeira visualização de um não-dono marca como visto
    let markViewed = false;
    if (file.viewOnce && !file.viewedAt && !isOwner) {
      await sql(`UPDATE "File" SET "viewedAt" = now() WHERE id = $1`, [id]);
      markViewed = true;
      // Avisa o DM inteiro (remetente e destinatário) para remover a mensagem da conversa
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
      // Some de vez: remove a mensagem da conversa (todos os dispositivos e recargas)
      if (dm.length > 0) {
        await sql('DELETE FROM "DirectMessage" WHERE id = $1', [dm[0].id]);
      }
    }

    let data;
    try {
      data = await readFile(path.join(process.cwd(), file.storagePath));
    } catch {
      await sql('DELETE FROM "File" WHERE id = $1', [id]);
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    // View-once visualizado: agenda a exclusão do arquivo do servidor
    if (markViewed) {
      setTimeout(() => cleanup(file).catch(() => {}), 1500);
    }

    return new NextResponse(data, {
      headers: {
        'Content-Type': file.mime,
        'Content-Length': String(data.length),
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline'
      }
    });
  } catch (error) {
    console.error('Erro na API de Arquivos:', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

// Remove do disco e do banco
async function cleanup(file) {
  try {
    await unlink(path.join(process.cwd(), file.storagePath));
  } catch { /* arquivo já não existe */ }
  await sql('DELETE FROM "File" WHERE id = $1', [file.id]);
}

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

const MAX_SIZE = {
  avatar: 2 * 1024 * 1024,   // 2 MB
  image: 5 * 1024 * 1024,    // 5 MB (foto)
  video: 10 * 1024 * 1024,   // 10 MB (vídeo)
  audio: 10 * 1024 * 1024,   // 10 MB (áudio/voz)
  file: 10 * 1024 * 1024     // 10 MB (arquivos)
};

function extFromMime(mime) {
  const map = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
    'audio/mpeg': '.mp3', 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/wav': '.wav',
    'application/pdf': '.pdf', 'text/plain': '.txt'
  };
  return map[mime] || '';
}

function classify(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    const form = await req.formData();
    const file = form.get('file');
    const purpose = form.get('purpose') || 'media'; // 'avatar' | 'media' | 'voice'
    const viewOnce = form.get('viewOnce') === 'true';

    if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) {
      return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'application/octet-stream';
    const kind = classify(mime);

    let max;
    if (purpose === 'avatar') max = MAX_SIZE.avatar;
    else if (kind === 'image') max = MAX_SIZE.image;
    else if (kind === 'video') max = MAX_SIZE.video;
    else if (kind === 'audio') max = MAX_SIZE.audio;
    else max = MAX_SIZE.file;

    if (bytes.length > max) {
      return NextResponse.json({ error: `Arquivo muito grande (máx ${Math.round(max / 1024 / 1024)} MB)` }, { status: 413 });
    }

    if (purpose === 'avatar' && kind !== 'image') {
      return NextResponse.json({ error: 'Avatar deve ser uma imagem' }, { status: 400 });
    }

    const ext = extFromMime(mime);
    if (!ext) {
      return NextResponse.json({ error: 'Tipo de arquivo não suportado' }, { status: 400 });
    }

    const dirName = purpose === 'avatar' ? 'uploads/avatar' : purpose === 'voice' ? 'uploads/voice' : 'uploads/media';
    const dir = path.join(process.cwd(), dirName);
    await mkdir(dir, { recursive: true });

    const storageName = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    const storagePath = path.join(dirName, storageName);
    await writeFile(path.join(process.cwd(), storagePath), bytes);

    // View-once: expira após 24h (ou ao ser visualizado)
    const expiresAt = viewOnce ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
    const result = await sql(
      `INSERT INTO "File" ("ownerId", filename, mime, size, "storagePath", "viewOnce", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, file.name || 'arquivo', mime, bytes.length, storagePath, viewOnce, expiresAt]
    );
    const row = result[0];
    return NextResponse.json({
      success: true,
      file: { id: row.id, url: `/files/${row.id}`, mime, size: bytes.length, viewOnce }
    });
  } catch (error) {
    console.error('Erro na API de Upload:', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

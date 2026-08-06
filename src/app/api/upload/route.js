import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { storageUpload } from '@/lib/storage';

const MAX_SIZE = {
  avatar: 2 * 1024 * 1024,   // 2 MB
  image: 25 * 1024 * 1024,   // 25 MB free / 50 MB premium
  video: 25 * 1024 * 1024,   // 25 MB free / 50 MB premium
  audio: 25 * 1024 * 1024,   // 25 MB free / 50 MB premium
  file: 25 * 1024 * 1024     // 25 MB free / 50 MB premium
};

async function getPremiumLimit(userId) {
  const user = await sql('SELECT "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1', [userId]);
  const u = user[0];
  if (u && u.premiumTier === 'premium' && u.premiumExpiresAt && new Date(u.premiumExpiresAt) > new Date()) {
    return {
      image: 50 * 1024 * 1024,
      video: 50 * 1024 * 1024,
      audio: 50 * 1024 * 1024,
      file: 50 * 1024 * 1024,
    };
  }
  return MAX_SIZE;
}

function extFromMime(mime) {
  const map = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
    'audio/mpeg': '.mp3', 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/mp4': '.m4a', 'audio/m4a': '.m4a', 'audio/aac': '.aac',
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
    else {
      const limits = await getPremiumLimit(userId);
      if (kind === 'image') max = limits.image;
      else if (kind === 'video') max = limits.video;
      else if (kind === 'audio') max = limits.audio;
      else max = limits.file;
    }

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
    const folder = purpose === 'avatar' ? 'avatar' : purpose === 'voice' ? 'voice' : 'media';
    const storageName = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;

    // 1) Tenta salvar no bucket "marketplace" (Supabase Storage)
    let storageKey = null;
    let storagePath = path.join(dirName, storageName);
    try {
      storageKey = await storageUpload(folder, storageName, bytes, mime);
    } catch { /* ignora e usa fallback local */ }

    // 2) Fallback: disco local
    if (!storageKey) {
      const dir = path.join(process.cwd(), dirName);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(process.cwd(), storagePath), bytes);
    }

    // View-once: expira após 24h (ou ao ser visualizado)
    const expiresAt = viewOnce ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
    const result = await sql(
      `INSERT INTO "File" ("ownerId", filename, mime, size, "storagePath", "storageKey", "viewOnce", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, file.name || 'arquivo', mime, bytes.length, storagePath, storageKey, viewOnce, expiresAt]
    );
    const row = result[0];

    // Notifica admins em tempo real sobre a nova mídia
    try {
      const io = globalThis.__nexchatIo;
      if (io) {
        const owner = await sql('SELECT username FROM "User" WHERE id = $1', [userId]);
        io.emit('media_uploaded', {
          id: row.id,
          filename: row.filename,
          mime,
          size: bytes.length,
          viewOnce,
          createdAt: new Date().toISOString(),
          ownerId: userId,
          ownerName: owner[0]?.username || 'desconhecido'
        });
      }
    } catch (e) {
      console.warn('Erro ao notificar nova mídia:', e.message);
    }

    return NextResponse.json({
      success: true,
      file: { id: row.id, url: `/api/files/${row.id}`, mime, size: bytes.length, viewOnce }
    });
  } catch (error) {
    console.error('Erro na API de Upload:', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}

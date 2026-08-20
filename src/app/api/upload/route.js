import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import sharp from 'sharp';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { storageUpload } from '@/lib/storage';
import { getClientIp } from '@/lib/ip';
import { rateLimit } from '@/lib/ratelimit';

const MAX_SIZE = {
  avatar: 2 * 1024 * 1024,   
  image: 25 * 1024 * 1024,   
  video: 25 * 1024 * 1024,   
  audio: 25 * 1024 * 1024,   
  file: 25 * 1024 * 1024     
};

const HARD_CAP = 60 * 1024 * 1024; 

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

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
    'audio/mpeg': '.mp3', 'audio/webm': '.webm', 'audio/opus': '.opus', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/mp4': '.m4a', 'audio/m4a': '.m4a', 'audio/aac': '.aac',
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

function sniffKind(buf) {
  const b = buf.subarray(0, 32);
  const tag = (s) => b.subarray(0, s.length).toString('latin1') === s;
  const at = (off, s) => b.subarray(off, off + s.length).toString('latin1') === s;
  if (tag('\x89PNG')) return 'image';
  if (tag('\xFF\xD8\xFF')) return 'image';
  if (tag('GIF8')) return 'image';
  if (tag('RIFF') && at(8, 'WEBP')) return 'image';
  if (tag('RIFF') && at(8, 'WAVE')) return 'audio';
  if (tag('RIFF') && at(8, 'AVI ')) return 'video';
  if (tag('OggS')) return 'audio';
  if (tag('ID3') || (b[0] === 0xFF && (b[1] === 0xFB || b[1] === 0xF3 || b[1] === 0xF2))) return 'audio';
  if (tag('fLaC')) return 'audio';
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return 'av'; 
  if (at(4, 'ftyp')) return 'av'; 
  return null;
}

function magicMatches(buf, kind) {
  const sniffed = sniffKind(buf);
  if (!sniffed) return false;
  if (sniffed === 'av') return kind === 'audio' || kind === 'video';
  return sniffed === kind;
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    const ip = getClientIp(req);
    const rl = rateLimit(`upload:${userId}`, 20, 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Muitos uploads. Tente novamente mais tarde.', errorKey: 'tooManyUploads' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > HARD_CAP) {
      return NextResponse.json({ error: 'Arquivo muito grande' }, { status: 413 });
    }

    const form = await req.formData();
    const file = form.get('file');
    const purpose = form.get('purpose') || 'media'; 
    const viewOnce = form.get('viewOnce') === 'true';

    if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) {
      return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 });
    }

    const rawMime = file.type || 'application/octet-stream';
    const mime = rawMime.split(';')[0].trim() || 'application/octet-stream';
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

    if (file.size > max) {
      return NextResponse.json({ error: `Arquivo muito grande (máx ${Math.round(max / 1024 / 1024)} MB)` }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    if (kind !== 'file' && !magicMatches(bytes, kind)) {
      return NextResponse.json({ error: 'Arquivo inválido ou com tipo incompatível' }, { status: 400 });
    }

    if (purpose === 'avatar' && kind !== 'image') {
      return NextResponse.json({ error: 'Avatar deve ser uma imagem' }, { status: 400 });
    }

    const ext = extFromMime(mime);
    if (!ext) {
      return NextResponse.json({ error: 'Tipo de arquivo não suportado' }, { status: 400 });
    }

    let processed = { bytes, mime, ext };
    try {
      if (kind === 'image' && mime !== 'image/gif') {
        if (purpose === 'avatar') {
          processed.bytes = await sharp(bytes).rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
          processed.mime = 'image/webp';
          processed.ext = '.webp';
        } else {
          const img = sharp(bytes).rotate();
          const meta = await img.metadata();
          const w = meta.width || 0;
          const h = meta.height || 0;
          if (w > 1600 || h > 1600) {
            const scale = Math.min((1600 / w) || 1, (1600 / h) || 1);
            img.resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
            if (mime === 'image/png') processed.bytes = await img.png({ quality: 85 }).toBuffer();
            else if (mime === 'image/webp') processed.bytes = await img.webp({ quality: 82 }).toBuffer();
            else processed.bytes = await img.jpeg({ quality: 82 }).toBuffer();
          }
        }
      }
    } catch (e) {
      console.warn('Falha ao otimizar imagem, usando original:', e.message);
      processed = { bytes, mime, ext };
    }

    if (kind === 'audio' && ffmpegPath) {
      try {
        const isOpus = /opus/i.test(processed.mime) || /webm/i.test(processed.mime) || processed.ext === '.ogg' || processed.ext === '.opus';
        const inExt = processed.ext || '.webm';
        const tag = crypto.randomBytes(4).toString('hex');
        const inPath = path.join(os.tmpdir(), `nex_up_in_${Date.now()}_${tag}${inExt}`);
        const outPath = path.join(os.tmpdir(), `nex_up_out_${Date.now()}_${tag}.ogg`);
        await writeFile(inPath, processed.bytes);
        const args = ['-y', '-i', inPath];
        if (isOpus) args.push('-c:a', 'copy');
        else args.push('-c:a', 'libopus', '-b:a', '64k');
        args.push('-f', 'ogg', outPath);
        await new Promise((resolve, reject) => {
          const p = spawn(ffmpegPath, args);
          let stderr = '';
          p.stderr.on('data', (d) => { stderr += d.toString(); });
          p.on('error', reject);
          p.on('close', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code + ' ' + stderr.slice(-300))));
        });
        const out = await readFile(outPath);
        if (out && out.length > 0) {
          processed.bytes = out;
          processed.mime = 'audio/ogg';
          processed.ext = '.ogg';
        }
        await unlink(inPath).catch(() => {});
        await unlink(outPath).catch(() => {});
      } catch (e) {
        console.warn('Falha ao converter áudio para Ogg Opus, mantendo original:', e.message);
      }
    }

    const dirName = purpose === 'avatar' ? 'uploads/avatar' : purpose === 'voice' ? 'uploads/voice' : 'uploads/media';
    const folder = purpose === 'avatar' ? 'avatar' : purpose === 'voice' ? 'voice' : 'media';
    const storageName = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${processed.ext}`;

    let storageKey = null;
    let storagePath = path.join(dirName, storageName);
    try {
      storageKey = await storageUpload(folder, storageName, processed.bytes, processed.mime);
    } catch {  }

    if (!storageKey) {
      const dir = path.join(UPLOADS_DIR, purpose === 'avatar' ? 'avatar' : purpose === 'voice' ? 'voice' : 'media');
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, storageName), processed.bytes);
    }

    const expiresAt = viewOnce ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
    const result = await sql(
      `INSERT INTO "File" ("ownerId", filename, mime, size, "storagePath", "storageKey", "viewOnce", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, file.name || 'arquivo', processed.mime, processed.bytes.length, storagePath, storageKey, viewOnce, expiresAt]
    );
    const row = result[0];

    try {
      const io = globalThis.__nexchatIo;
      if (io) {
        const owner = await sql('SELECT username FROM "User" WHERE id = $1', [userId]);
        io.emit('media_uploaded', {
          id: row.id,
          filename: row.filename,
          mime: processed.mime,
          size: processed.bytes.length,
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
      file: { id: row.id, url: `/api/files/${row.id}`, mime: processed.mime, size: processed.bytes.length, viewOnce }
    });
  } catch (error) {
    console.error('Erro na API de Upload:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

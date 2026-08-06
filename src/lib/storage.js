// Supabase Storage (bucket "marketplace") — media do NexChat
// Fallback: se o bucket/políticas não existirem, os uploads continuam locais.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const BUCKET = 'marketplace';

export function storageEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY && BUCKET);
}

// Upload -> retorna a storageKey (ex.: "media/123_x.webm") ou null em falha
export async function storageUpload(folder, name, bytes, mime) {
  if (!storageEnabled()) return null;
  const key = `${folder}/${name}`;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': mime,
        'x-upsert': 'false'
      },
      body: bytes
    });
    if (!res.ok) {
      console.warn('Falha no upload para o bucket marketplace:', res.status, await res.text().catch(() => ''));
      return null;
    }
    return key;
  } catch (e) {
    console.warn('Erro no upload para o bucket marketplace:', e.message);
    return null;
  }
}

// Baixa o arquivo (proxy de acesso controlado)
export async function storageFetch(key) {
  if (!storageEnabled()) throw new Error('Storage indisponível');
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY
    },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`Falha ao buscar objeto (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// Remove o arquivo do bucket
export async function storageDelete(key) {
  if (!storageEnabled()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY
      }
    });
    return res.ok;
  } catch (e) {
    console.warn('Erro ao remover objeto do bucket:', e.message);
    return false;
  }
}

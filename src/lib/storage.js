// Supabase Storage (bucket "marketplace") — media do NexChat
// Usa SUPABASE_SERVICE_ROLE_KEY quando disponível (cria o bucket automaticamente).
// Fallback: se o storage não funcionar, os uploads continuam locais.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const BUCKET = 'marketplace';

const key = () => SERVICE_KEY || PUBLISHABLE_KEY;

export function storageEnabled() {
  return Boolean(SUPABASE_URL && key() && BUCKET);
}

export function storageUsesServiceRole() {
  return Boolean(SUPABASE_URL && SERVICE_KEY && BUCKET);
}

let ensurePromise = null;
// Cria o bucket público se não existir (só com service role; anon não pode criar)
function ensureBucket() {
  if (!storageUsesServiceRole()) return Promise.resolve();
  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey': SERVICE_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true })
        });
      } catch (e) {
        console.warn('Falha ao garantir o bucket marketplace:', e.message);
      }
    })();
  }
  return ensurePromise;
}

// Upload -> retorna a storageKey (ex.: "media/123_x.webm") ou null em falha
export async function storageUpload(folder, name, bytes, mime) {
  if (!storageEnabled()) return null;
  await ensureBucket();
  const keyValue = key();
  const keyPath = `${folder}/${name}`;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${keyPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keyValue}`,
        'apikey': keyValue,
        'Content-Type': mime,
        'x-upsert': 'false'
      },
      body: bytes
    });
    if (!res.ok) {
      console.warn('Falha no upload para o bucket marketplace:', res.status, await res.text().catch(() => ''));
      return null;
    }
    return keyPath;
  } catch (e) {
    console.warn('Erro no upload para o bucket marketplace:', e.message);
    return null;
  }
}

// Baixa o arquivo (proxy de acesso controlado)
export async function storageFetch(keyPath) {
  if (!storageEnabled()) throw new Error('Storage indisponível');
  const keyValue = key();
  const base = storageUsesServiceRole()
    ? `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${keyPath}`
    : `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${keyPath}`;
  const res = await fetch(base, {
    headers: {
      'Authorization': `Bearer ${keyValue}`,
      'apikey': keyValue
    },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`Falha ao buscar objeto (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// Remove o arquivo do bucket
export async function storageDelete(keyPath) {
  if (!storageEnabled()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${keyPath}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${key()}`,
        'apikey': key()
      }
    });
    return res.ok;
  } catch (e) {
    console.warn('Erro ao remover objeto do bucket:', e.message);
    return false;
  }
}

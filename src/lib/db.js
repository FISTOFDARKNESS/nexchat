import { Pool } from 'pg';

let pool = null;

function sanitizeConnectionString(url) {
  const [base, query = ''] = url.split('?');
  if (!query) return url;
  const kept = query.split('&').filter((p) => !/^ssl/i.test(p));
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
}

function getPool() {
  if (!pool) {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) {
      console.warn('DATABASE_URL env var is not configured yet. Database queries will fail.');
      return null;
    }
    // Remove params sslmode/ssl da URL, pois o pg os mescla por cima das opções do Pool
    const connectionString = sanitizeConnectionString(rawUrl);
    pool = new Pool({
      connectionString,
      max: 10, // número máximo de clientes no pool
      connectionTimeoutMillis: 15000,
      ssl: { rejectUnauthorized: false }, // Supabase exige SSL
      statement_timeout: 15000,
    });
  }
  return pool;
}

export async function sql(sqlStr, params = []) {
  const currentPool = getPool();
  if (!currentPool) {
    throw new Error('Database pool not initialized. Check your DATABASE_URL environment variable.');
  }
  const client = await currentPool.connect();
  try {
    const result = await client.query(sqlStr, params);
    return result.rows;
  } catch (err) {
    console.error('db.sql error:', err.message, 'for:', sqlStr.slice(0, 150));
    throw err;
  } finally {
    client.release();
  }
}

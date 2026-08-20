const { Pool } = require('pg');

let pool = null;

function sanitizeConnectionString(url) {
  const [base, query = ''] = url.split('?');
  if (!query) return url;
  const kept = query.split('&').filter((p) => !/^ssl/i.test(p));
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
}

function toTransactionMode(url) {
  try {
    const u = new URL(url);
    if (!/pooler\.supabase\.com$/i.test(u.hostname)) return url;
    if (u.port === '6543') return url;
    const idx = url.indexOf('@');
    const after = idx === -1 ? url : url.slice(idx + 1);
    const hostEnd = after.indexOf('/');
    const hostPart = hostEnd === -1 ? after : after.slice(0, hostEnd);
    const rest = hostEnd === -1 ? '' : after.slice(hostEnd);
    return (idx === -1 ? '' : url.slice(0, idx + 1)) + hostPart.replace(/(:\d+)?$/, ':6543') + rest;
  } catch {
    return url;
  }
}

function getPool() {
  if (!pool) {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) {
      console.warn('DATABASE_URL env var is not configured yet. Database queries will fail.');
      return null;
    }
    const connectionString = toTransactionMode(sanitizeConnectionString(rawUrl));
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 15000,
    });
  }
  return pool;
}

async function sql(sqlStr, params = []) {
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

module.exports = { sql, getPool };

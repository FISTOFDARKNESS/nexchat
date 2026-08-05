import { Pool } from 'pg';

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn('DATABASE_URL env var is not configured yet. Database queries will fail.');
      return null;
    }
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

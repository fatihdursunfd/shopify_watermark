import pkg from 'pg';
import { QUERIES } from './queries.js';

const { Pool } = pkg;

let pool = null;

try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000, // Increased to 10s for cloud DB cold starts
    idleTimeoutMillis: 30000,
  });
  console.log('⚠️  PostgreSQL pool created (will test on first query)');
} catch (error) {
  console.error('❌ PostgreSQL Pool Creation Failed:', error.message);
  pool = null;
}

// Auto-run migration (create tables)
const createTables = async () => {
  if (!pool) return;
  try {
    await pool.query(QUERIES.SCHEMA);
    console.log('✅ Database tables verified/created');
  } catch (e) {
    console.error('❌ Failed to create tables:', e);
  }
};

createTables();

export default pool;
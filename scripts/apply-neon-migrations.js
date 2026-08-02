const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return acc;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1).trim();
    acc[key] = value.replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const envPath = path.resolve(__dirname, '../.env.local');
const dotEnvPath = path.resolve(__dirname, '../.env');
const envVars = Object.assign(
  {},
  loadEnvFile(dotEnvPath),
  loadEnvFile(envPath),
  process.env
);

const DATABASE_URL = envVars.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required in .env.local, .env or environment variables.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const migrations = [
  'supabase/migrations/000_init_pgvector_documents.sql',
  'supabase/migrations/20260726000000_nvidia_embeddings_2048.sql',
];

(async () => {
  try {
    for (const migration of migrations) {
      const fullPath = path.resolve(__dirname, '..', migration);
      console.log(`Applying migration: ${migration}`);
      const sql = fs.readFileSync(fullPath, 'utf8');
      await pool.query(sql);
      console.log(`Applied ${migration}`);
    }
    console.log('All Neon migrations applied successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();

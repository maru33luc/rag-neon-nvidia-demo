const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
const neonUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const dumpFile = process.env.DUMP_FILE || path.resolve(__dirname, '../supabase_documents.dump');

if (!neonUrl) {
  console.error('Missing required environment variable NEON_DATABASE_URL or DATABASE_URL.');
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(`Failed to run ${command}:`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

if (supabaseUrl && !fs.existsSync(dumpFile)) {
  console.log('Dumping Supabase documents table to', dumpFile);
  run('pg_dump', [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--table=public.documents',
    '--file',
    dumpFile,
    supabaseUrl,
  ]);
}

if (!fs.existsSync(dumpFile)) {
  console.error(
    `Backup file not found: ${dumpFile}. Set SUPABASE_DATABASE_URL to create it or set DUMP_FILE to an existing backup file.`
  );
  process.exit(1);
}

console.log('Restoring documents into Neon');
run('pg_restore', [
  '--no-owner',
  '--no-acl',
  '--dbname',
  neonUrl,
  '--table',
  'public.documents',
  dumpFile,
]);

console.log('Migration complete.');
console.log('Remember to apply Neon migrations before restoring data if needed.');

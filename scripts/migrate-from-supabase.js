const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
const neonUrl =
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_URL ||
  (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD
    ? `postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}/${process.env.PGDATABASE || process.env.POSTGRES_DATABASE || ''}?channel_binding=require&sslmode=require`
    : undefined);
const dumpFile = process.env.DUMP_FILE || path.resolve(__dirname, '../supabase_documents.json');
const supabaseQuery =
  'SELECT id, content, owner, embedding FROM public.documents ORDER BY id';
const batchSize = 50;

if (!neonUrl) {
  console.error('Missing required environment variable NEON_DATABASE_URL or DATABASE_URL.');
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true, ...options });
  if (result.error) {
    console.error(`Failed to run ${command}:`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

function dumpSupabaseRows() {
  if (supabaseUrl) {
    console.log('Dumping rows from Supabase source database to', dumpFile);
    run(
      'npx supabase db query --db-url "' +
        supabaseUrl +
        '" "' +
        supabaseQuery +
        '" --output json > "' +
        dumpFile +
        '"'
    );
    return;
  }

  console.log('Dumping rows from the linked Supabase project to', dumpFile);
  run('npx supabase db query --linked "' + supabaseQuery + '" --output json > "' + dumpFile + '"');
}

function parseSupabaseRows(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const start = raw.indexOf('{');
  if (start === -1) {
    console.error('Unable to parse Supabase query output: no JSON object found.');
    process.exit(1);
  }

  const jsonText = raw.slice(start);
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse JSON from Supabase query output:', error);
    process.exit(1);
  }

  if (!Array.isArray(parsed.rows)) {
    console.error('Supabase query output does not contain rows.');
    process.exit(1);
  }

  return parsed.rows.map((row) => {
    let embedding = row.embedding;
    if (typeof embedding === 'string') {
      try {
        embedding = JSON.parse(embedding);
      } catch (error) {
        console.error('Failed to parse embedding string for row:', row);
        process.exit(1);
      }
    }

    if (!Array.isArray(embedding)) {
      console.error('Unexpected embedding shape for row:', row);
      process.exit(1);
    }

    return {
      id: row.id,
      content: row.content,
      owner: row.owner || null,
      embedding,
    };
  });
}

function restoreSqlFile(sqlFile) {
  console.log('Restoring SQL backup into Neon from', sqlFile);
  run('npx supabase db query --db-url "' + neonUrl + '" --file "' + sqlFile + '"');
}

function restorePgDumpFile(dumpFilePath) {
  console.log('Restoring binary dump into Neon from', dumpFilePath);
  run('pg_restore --no-owner --no-acl --dbname "' + neonUrl + '" --table public.documents "' + dumpFilePath + '"');
}

function restoreDumpFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    const rows = parseSupabaseRows(filePath);
    if (rows.length === 0) {
      console.log('No rows found in the provided JSON export. Nothing to restore.');
      return;
    }

    return restoreRows(rows);
  }

  if (ext === '.sql') {
    return restoreSqlFile(filePath);
  }

  if (ext === '.dump' || ext === '.backup') {
    return restorePgDumpFile(filePath);
  }

  console.error(
    `Unsupported dump file format: ${ext}. Provide a .json, .sql, .dump, or .backup file.`
  );
  process.exit(1);
}

async function restoreRows(rows) {
  const pool = new Pool({ connectionString: neonUrl });
  try {
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      const values = [];
      const placeholders = chunk
        .map((row, index) => {
          const base = index * 4;
          values.push(row.id);
          values.push(row.content);
          values.push(JSON.stringify(row.embedding));
          values.push(row.owner);
          return `($${base + 1}, $${base + 2}, $${base + 3}::vector, $${base + 4})`;
        })
        .join(', ');

      const sql = `INSERT INTO public.documents (id, content, embedding, owner) VALUES ${placeholders} ON CONFLICT (id) DO NOTHING`;
      await pool.query(sql, values);
    }
  } finally {
    await pool.end();
  }
}

function ensureDumpFile() {
  if (!fs.existsSync(dumpFile)) {
    if (path.extname(dumpFile).toLowerCase() === '.json') {
      dumpSupabaseRows();
    } else if (supabaseUrl) {
      console.log('Dump file does not exist, exporting Supabase rows to', dumpFile);
      dumpSupabaseRows();
    } else {
      console.error(
        `Dump file not found: ${dumpFile}. Set SUPABASE_DATABASE_URL or provide an existing JSON or SQL backup file via DUMP_FILE.`
      );
      process.exit(1);
    }
  }

  if (!fs.existsSync(dumpFile)) {
    console.error(
      `Dump file not found: ${dumpFile}. Set SUPABASE_DATABASE_URL or make sure the linked Supabase project is available.`
    );
    process.exit(1);
  }
}

(async () => {
  ensureDumpFile();

  const ext = path.extname(dumpFile).toLowerCase();
  if (ext === '.json') {
    const rows = parseSupabaseRows(dumpFile);
    if (rows.length === 0) {
      console.log('No rows found in Supabase documents table. Nothing to restore.');
      return;
    }

    console.log(`Restoring ${rows.length} documents to Neon...`);
    await restoreRows(rows);
    console.log('Migration complete.');
    return;
  }

  await restoreDumpFile(dumpFile);
  console.log('Migration complete.');
})();

#!/usr/bin/env node
// Execute a SQL file directly against Postgres using pg.
// Usage:
//   node tools/run-pg-sql.js --url <postgres_url> --file <path.sql>
// or use discrete params:
//   node tools/run-pg-sql.js --host ... --port 5432 --db ... --user ... --password ... --file <path.sql>

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') out.url = argv[++i];
    else if (arg === '--host') out.host = argv[++i];
    else if (arg === '--port') out.port = Number(argv[++i]);
    else if (arg === '--db' || arg === '--database') out.database = argv[++i];
    else if (arg === '--user' || arg === '--username') out.user = argv[++i];
    else if (arg === '--password') out.password = argv[++i];
    else if (arg === '--file') out.file = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Missing --file <path.sql>');
    process.exit(2);
  }

  const sql = fs.readFileSync(path.resolve(args.file), 'utf8');

  const config = args.url
    ? { connectionString: args.url, ssl: { rejectUnauthorized: false } }
    : {
        host: args.host,
        port: args.port || 5432,
        database: args.database,
        user: args.user,
        password: args.password,
        ssl: { rejectUnauthorized: false }
      };

  try {
    const client = new Client(config);
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log('SQL applied successfully.');
  } catch (err) {
    console.error('Failed to apply SQL:', err?.stack || err?.message || String(err));
    process.exit(1);
  }
}

main();


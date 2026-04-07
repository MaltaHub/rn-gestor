#!/usr/bin/env node
// Simple helper to execute a SQL file against Supabase Management API SQL endpoint.
// Usage:
//   node tools/run-supabase-sql.js --project <project_ref> --token <supabase_pat> --file <path.sql>

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') out.project = argv[++i];
    else if (arg === '--token') out.token = argv[++i];
    else if (arg === '--file') out.file = argv[++i];
    else if (arg === '--sql') out.sql = argv[++i];
  }
  return out;
}

async function main() {
  const { project, token, file, sql } = parseArgs(process.argv);
  if (!project || !token || (!file && !sql)) {
    console.error('Usage: node tools/run-supabase-sql.js --project <ref> --token <pat> --file <path.sql>');
    process.exit(2);
  }

  const query = sql ?? fs.readFileSync(path.resolve(file), 'utf8');
  const res = await fetch(`https://api.supabase.com/v1/projects/${project}/db/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('Request failed:', res.status, res.statusText, text);
    process.exit(1);
  }

  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err?.stack || err?.message || String(err));
  process.exit(1);
});


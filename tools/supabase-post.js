#!/usr/bin/env node
// Minimal helper: POST JSON to Supabase Management API
// Usage: node tools/supabase-post.js --path /v1/projects/<ref>/... --token <PAT> --body '{"query":"..."}'
//    or: node tools/supabase-post.js --path ... --token <PAT> --body-file query.json

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--path') out.path = argv[++i];
    else if (a === '--token') out.token = argv[++i];
    else if (a === '--body') out.body = argv[++i];
    else if (a === '--body-file') out.bodyFile = argv[++i];
  }
  return out;
}

async function main() {
  const fs = require('fs');
  const { path, token, body, bodyFile } = parseArgs(process.argv);
  if (!path || !token || (!body && !bodyFile)) {
    console.error('Usage: node tools/supabase-post.js --path /v1/projects/... --token <PAT> --body <json> | --body-file <file>');
    process.exit(2);
  }
  const url = `https://api.supabase.com${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: bodyFile ? fs.readFileSync(bodyFile, 'utf8') : body
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Error:', res.status, res.statusText);
    console.error(text);
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err?.stack || err?.message || String(err));
  process.exit(1);
});

#!/usr/bin/env node
// Minimal helper: GET from Supabase Management API
// Usage: node tools/supabase-get.js --path /v1/projects/<ref> --token <PAT>

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--path') out.path = argv[++i];
    else if (a === '--token') out.token = argv[++i];
  }
  return out;
}

async function main() {
  const { path, token } = parseArgs(process.argv);
  if (!path || !token) {
    console.error('Usage: node tools/supabase-get.js --path /v1/projects/... --token <PAT>');
    process.exit(2);
  }
  const url = `https://api.supabase.com${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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


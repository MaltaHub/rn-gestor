#!/usr/bin/env node
// Procura segredos vazados nos arquivos versionados (roda no CI).
// Uso: node scripts/check-secrets.mjs
// Sai com código 1 e lista arquivo:linha quando acha algo.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".json", ".yaml", ".yml", ".toml", ".md", ".txt", ".sql", ".ps1", ".sh", ".gs", ".html", ".css", ".env"]);

const PATTERNS = [
  ["chave privada", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ["chave AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["token do Supabase (sbp_)", /\bsbp_[0-9a-f]{40}\b/],
  ["chave secreta do Supabase (sb_secret_)", /\bsb_secret_[A-Za-z0-9_-]{20,}/],
  ["JWT de service_role", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}/],
  // Valor com cara de segredo: 24+ caracteres misturando letras e dígitos (nomes como
  // "estado_transferencia_virado" não contam).
  ["atribuição de segredo", /\b(secret|token|api[_-]?key|service[_-]?role[_-]?key|password)\b\s*[:=]\s*["'](?=[^"']*\d)(?=[^"']*[A-Za-z])[^"'\s]{24,}["']/i]
];

// Valores de exemplo/placeholder que não são segredo.
const ALLOW = /(your-|placeholder|example|exemplo|xxxx|<[^>]+>|ci-placeholder)/i;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => TEXT_EXTENSIONS.has(extname(file)) || file.endsWith(".env.example"))
  .filter((file) => !file.endsWith("package-lock.json") && !file.endsWith("database.types.ts"));

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [label, pattern] of PATTERNS) {
      if (pattern.test(line) && !ALLOW.test(line)) findings.push(`${file}:${index + 1}  ${label}`);
    }
  });
}

if (findings.length > 0) {
  console.error(`check-secrets: ${findings.length} possível(is) segredo(s) versionado(s):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`check-secrets: ${files.length} arquivos, nenhum segredo encontrado.`);

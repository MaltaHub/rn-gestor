// Gera components/ui-grid/core/relations.generated.ts a partir das Relationships
// declaradas em lib/supabase/database.types.ts (typegen do Supabase).
//
// Motivacao: o mapa de FKs (RELATION_BY_SHEET_COLUMN) era mantido a mao e ficava
// incompleto. O typegen ja carrega TODAS as FKs declaradas no banco (coluna ->
// tabela/coluna alvo); aqui extraimos isso para um mapa runtime, "democratizando"
// o conhecimento de relacoes para todo o sistema (grade + configurador de feeds).
//
// Uso: `node scripts/generate-relations.mjs` (rode depois de `npm run supabase:types`).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const TYPES_PATH = join(repoRoot, "lib", "supabase", "database.types.ts");
const OUT_PATH = join(repoRoot, "components", "ui-grid", "core", "relations.generated.ts");

// Tabelas que existem como "sheet" navegavel (espelha GridTableName em
// lib/domain/grid-policy.ts). Relacoes cujo dono OU alvo nao esteja aqui sao
// ignoradas: nao da pra buscar/expandir uma tabela que o grid nao serve.
const GRID_TABLES = new Set([
  "anuncios",
  "caracteristicas_tecnicas",
  "caracteristicas_visuais",
  "carro_caracteristicas_tecnicas",
  "carro_caracteristicas_visuais",
  "carros",
  "controle_envelopes",
  "documentos",
  "observacoes",
  "finalizados",
  "grupos_repetidos",
  "log_alteracoes",
  "lookup_announcement_statuses",
  "lookup_audit_actions",
  "lookup_locations",
  "lookup_sale_statuses",
  "lookup_user_roles",
  "lookup_user_statuses",
  "lookup_vehicle_states",
  "modelos",
  "remetentes",
  "repetidos",
  "usuarios_acesso",
  "vendas",
  "venda_entradas"
]);

function matchClose(text, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractQuoted(listText) {
  return Array.from(listText.matchAll(/"([^"]+)"/g)).map((entry) => entry[1]);
}

const src = readFileSync(TYPES_PATH, "utf8");

const publicIdx = src.indexOf("public: {");
const tablesIdx = src.indexOf("Tables: {", publicIdx);
if (tablesIdx === -1) {
  throw new Error("Nao encontrei 'Tables: {' em database.types.ts");
}
const tablesBraceOpen = src.indexOf("{", tablesIdx);
const tablesBraceClose = matchClose(src, tablesBraceOpen, "{", "}");
const tablesBlock = src.slice(tablesBraceOpen + 1, tablesBraceClose);

// Quebra o bloco Tables nas entradas de primeiro nivel (uma por tabela).
function topLevelTables(block) {
  const tables = [];
  let i = 0;
  while (i < block.length) {
    const rest = block.slice(i);
    const head = rest.match(/^\s*([a-zA-Z0-9_]+):\s*\{/);
    if (!head) {
      i += 1;
      continue;
    }
    const braceOpen = i + head[0].length - 1;
    const braceClose = matchClose(block, braceOpen, "{", "}");
    tables.push({ name: head[1], body: block.slice(braceOpen + 1, braceClose) });
    i = braceClose + 1;
  }
  return tables;
}

const relations = {};
const skipped = [];

for (const table of topLevelTables(tablesBlock)) {
  const relIdx = table.body.indexOf("Relationships:");
  if (relIdx === -1) continue;
  const bracketOpen = table.body.indexOf("[", relIdx);
  if (bracketOpen === -1) continue;
  const bracketClose = matchClose(table.body, bracketOpen, "[", "]");
  const relText = table.body.slice(bracketOpen + 1, bracketClose);

  const relationRegex =
    /columns:\s*\[([^\]]*)\][\s\S]*?referencedRelation:\s*"([^"]+)"[\s\S]*?referencedColumns:\s*\[([^\]]*)\]/g;

  for (const match of relText.matchAll(relationRegex)) {
    const sourceColumns = extractQuoted(match[1]);
    const referencedRelation = match[2];
    const referencedColumns = extractQuoted(match[3]);

    // FKs compostas nao mapeiam para o RelationRef (coluna unica) — pula.
    if (sourceColumns.length !== 1 || referencedColumns.length !== 1) continue;
    const sourceColumn = sourceColumns[0];
    const keyColumn = referencedColumns[0];

    if (!GRID_TABLES.has(table.name) || !GRID_TABLES.has(referencedRelation)) {
      skipped.push(`${table.name}.${sourceColumn} -> ${referencedRelation}`);
      continue;
    }

    relations[table.name] ??= {};
    // Primeira FK declarada para a coluna vence (evita sobrescrever com duplicata).
    relations[table.name][sourceColumn] ??= { table: referencedRelation, keyColumn };
  }
}

const sortedTables = Object.keys(relations).sort();
const bodyLines = sortedTables.map((table) => {
  const columns = Object.keys(relations[table]).sort();
  const inner = columns
    .map((column) => {
      const ref = relations[table][column];
      return `    ${JSON.stringify(column)}: { table: ${JSON.stringify(ref.table)}, keyColumn: ${JSON.stringify(ref.keyColumn)} }`;
    })
    .join(",\n");
  return `  ${JSON.stringify(table)}: {\n${inner}\n  }`;
});

const output = `// ARQUIVO GERADO — nao editar a mao.
// Origem: lib/supabase/database.types.ts (Relationships do typegen do Supabase).
// Regerar com: node scripts/generate-relations.mjs
import type { SheetKey } from "@/components/ui-grid/types";

export type GeneratedRelationRef = { table: SheetKey; keyColumn: string };

/**
 * Todas as FKs declaradas no banco, coluna -> tabela/coluna alvo, filtradas para
 * tabelas servidas pelo grid. Eh mesclado com overrides manuais em grid-rules.
 */
export const GENERATED_RELATION_BY_SHEET_COLUMN: Partial<Record<SheetKey, Record<string, GeneratedRelationRef>>> = {
${bodyLines.join(",\n")}
};
`;

writeFileSync(OUT_PATH, output, "utf8");

console.log(`Gerado ${OUT_PATH}`);
console.log(`Tabelas com relacoes: ${sortedTables.length}`);
if (skipped.length > 0) {
  console.log(`Relacoes ignoradas (alvo/dono fora do grid): ${skipped.length}`);
  for (const entry of skipped) console.log(`  - ${entry}`);
}

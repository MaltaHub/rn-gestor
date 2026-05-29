#!/usr/bin/env node
// Audit CSS literals across the project and report:
//   docs/css-audit.md     - divergences (literal -> existing token suggestion)
//   docs/ui-inventory.md  - per-file inventory of classes, tokens used, literals
//
// Run: node scripts/css-audit.mjs

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "playwright-report",
  "test-results",
  "visual-review",
  "visual-review-restored",
  ".git",
  "supabase",
  "dist",
  "build",
  "coverage"
]);

const TOKENS_FILE = join(ROOT, "styles", "tokens.css");

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile() && /\.css$/i.test(entry)) out.push(full);
  }
  return out;
}

function relPath(p) {
  return relative(ROOT, p).split(sep).join("/");
}

// ---------- normalization ----------

function normColorHex(v) {
  v = v.trim().toLowerCase();
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  m = /^#([0-9a-f]{6,8})$/.exec(v);
  if (m) return v;
  return v;
}

function normColorRgb(v) {
  const m = /^rgba?\(([^)]+)\)$/i.exec(v.trim());
  if (!m) return v.trim().toLowerCase();
  const parts = m[1].split(/[\s,\/]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return v.trim().toLowerCase();
  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  const a = parts.length >= 4 ? Number(parts[3]) : 1;
  if (![r, g, b].every((n) => Number.isFinite(n))) return v.trim().toLowerCase();
  if (a === 1) {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function normColor(v) {
  v = v.trim();
  if (v.startsWith("#")) return normColorHex(v);
  if (/^rgba?\(/i.test(v)) return normColorRgb(v);
  return v.toLowerCase();
}

function normLength(v) {
  return v.trim().toLowerCase();
}

function normShadow(v) {
  return v
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s*,\s*/g, ", ")
    .toLowerCase();
}

// ---------- tokens parsing ----------

function parseTokens(src) {
  const valueByName = new Map();
  const declRe = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = declRe.exec(src))) {
    valueByName.set(m[1], m[2].trim());
  }

  // category -> normalized value -> [tokenNames]
  const colorIndex = new Map();
  const lengthIndex = new Map();
  const shadowIndex = new Map();
  const fontFamilyIndex = new Map();

  function add(idx, key, name) {
    if (!idx.has(key)) idx.set(key, []);
    if (!idx.get(key).includes(name)) idx.get(key).push(name);
  }

  for (const [name, value] of valueByName) {
    const v = value.trim();

    if (/^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(/i.test(v) || /^hsla?\(/i.test(v)) {
      add(colorIndex, normColor(v), name);
      continue;
    }
    if (/^\d+(?:\.\d+)?(?:px|rem|em|%)$/.test(v)) {
      add(lengthIndex, normLength(v), name);
      continue;
    }
    if (/box-shadow/i.test(name) || (/\d+px/.test(v) && /rgba?\(/i.test(v))) {
      add(shadowIndex, normShadow(v), name);
      continue;
    }
    if (/^["']?[A-Za-z]/.test(v) && /font/i.test(name)) {
      add(fontFamilyIndex, v.toLowerCase(), name);
      continue;
    }
  }

  return { valueByName, colorIndex, lengthIndex, shadowIndex, fontFamilyIndex };
}

// ---------- per-file extraction ----------

const CSS_PROP_LINE = /^\s*([a-z-]+)\s*:\s*([^;]+);?\s*$/i;
const CLASS_RE = /\.([A-Za-z_][\w-]*)/g;
const VAR_RE = /var\(\s*--([a-z0-9-]+)/gi;

const LENGTH_PROPS = new Set([
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "gap",
  "row-gap",
  "column-gap",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "font-size",
  "line-height",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius"
]);

const RADIUS_PROPS = new Set([
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius"
]);

const COLOR_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "border",
  "border-color",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline",
  "outline-color",
  "fill",
  "stroke",
  "box-shadow",
  "text-shadow",
  "caret-color"
]);

const SHADOW_PROPS = new Set(["box-shadow", "text-shadow"]);
const FONT_FAMILY_PROPS = new Set(["font-family", "font"]);

function extractFromFile(filePath, src, tokenIdx) {
  const lines = src.split(/\r?\n/);
  const classes = new Set();
  const tokensUsed = new Set();
  // literal findings: { category, raw, normalized, property, line, suggestion: tokenName|null }
  const findings = [];

  // collect class selectors anywhere
  for (const m of src.matchAll(CLASS_RE)) classes.add(m[1]);
  // collect token usage
  for (const m of src.matchAll(VAR_RE)) tokensUsed.add(m[1]);

  // line-by-line property scan (simple, no nested blocks tracking)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // skip token declarations themselves
    if (/^\s*--[\w-]+\s*:/.test(line)) continue;
    const m = CSS_PROP_LINE.exec(line);
    if (!m) continue;
    const prop = m[1].toLowerCase();
    const value = m[2].trim();
    if (!value) continue;

    // Colors
    if (COLOR_PROPS.has(prop) || /color/i.test(prop)) {
      const colorRe = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\))/g;
      let cm;
      while ((cm = colorRe.exec(value))) {
        const raw = cm[0];
        const norm = normColor(raw);
        const suggestion = tokenIdx.colorIndex.get(norm)?.[0] ?? null;
        findings.push({
          category: "color",
          raw,
          normalized: norm,
          property: prop,
          line: i + 1,
          suggestion
        });
      }
    }

    // Shadows (full string compare)
    if (SHADOW_PROPS.has(prop)) {
      const norm = normShadow(value);
      const suggestion = tokenIdx.shadowIndex.get(norm)?.[0] ?? null;
      if (!/^\s*var\(/.test(value)) {
        findings.push({
          category: "shadow",
          raw: value,
          normalized: norm,
          property: prop,
          line: i + 1,
          suggestion
        });
      }
    }

    // Lengths (radii, spacing, font-size)
    if (LENGTH_PROPS.has(prop)) {
      const lenRe = /(?<![\w-])(-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw))/g;
      let lm;
      while ((lm = lenRe.exec(value))) {
        const raw = lm[1];
        const norm = normLength(raw);
        const suggestion = tokenIdx.lengthIndex.get(norm)?.[0] ?? null;
        let category = "spacing";
        if (RADIUS_PROPS.has(prop)) category = "radius";
        else if (prop === "font-size") category = "font-size";
        else if (prop === "line-height") category = "line-height";
        else if (
          ["width", "height", "min-width", "min-height", "max-width", "max-height"].includes(prop)
        )
          category = "dimension";
        findings.push({
          category,
          raw,
          normalized: norm,
          property: prop,
          line: i + 1,
          suggestion
        });
      }
    }

    // Font family
    if (FONT_FAMILY_PROPS.has(prop)) {
      if (!/var\(/.test(value)) {
        findings.push({
          category: "font-family",
          raw: value,
          normalized: value.toLowerCase(),
          property: prop,
          line: i + 1,
          suggestion: tokenIdx.fontFamilyIndex.get(value.toLowerCase())?.[0] ?? null
        });
      }
    }
  }

  return {
    file: relPath(filePath),
    classes: [...classes].sort(),
    tokensUsed: [...tokensUsed].sort(),
    findings
  };
}

// ---------- report generation ----------

function pct(num, den) {
  if (!den) return "0%";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function buildAuditReport(filesData, tokenIdx) {
  const all = [];
  for (const f of filesData) for (const fnd of f.findings) all.push({ ...fnd, file: f.file });

  const byCategory = new Map();
  for (const fnd of all) {
    if (!byCategory.has(fnd.category)) byCategory.set(fnd.category, []);
    byCategory.get(fnd.category).push(fnd);
  }

  let md = "";
  md += "# CSS Audit\n\n";
  md += `_Gerado automaticamente por \`scripts/css-audit.mjs\` em ${new Date().toISOString()}._\n\n`;
  md += "## Sumário\n\n";
  md += `- Arquivos CSS analisados: **${filesData.length}**\n`;
  md += `- Total de literais encontrados: **${all.length}**\n`;
  const withSuggestion = all.filter((f) => f.suggestion);
  md += `- Literais com token equivalente disponível: **${withSuggestion.length}** (${pct(
    withSuggestion.length,
    all.length
  )})\n`;
  md += `- Literais sem token equivalente: **${all.length - withSuggestion.length}** (${pct(
    all.length - withSuggestion.length,
    all.length
  )})\n\n`;

  md += "### Por categoria\n\n";
  md += "| Categoria | Total | Com token | Sem token |\n";
  md += "|---|---:|---:|---:|\n";
  for (const [cat, list] of [...byCategory.entries()].sort()) {
    const withTok = list.filter((f) => f.suggestion).length;
    md += `| ${cat} | ${list.length} | ${withTok} | ${list.length - withTok} |\n`;
  }
  md += "\n";

  // Detail per category
  for (const [cat, list] of [...byCategory.entries()].sort()) {
    md += `## ${cat}\n\n`;

    // Group by normalized value
    const byValue = new Map();
    for (const fnd of list) {
      const key = fnd.normalized;
      if (!byValue.has(key)) byValue.set(key, { suggestion: fnd.suggestion, raws: new Set(), occurrences: [] });
      const entry = byValue.get(key);
      entry.raws.add(fnd.raw);
      entry.occurrences.push({ file: fnd.file, line: fnd.line, property: fnd.property });
      if (!entry.suggestion && fnd.suggestion) entry.suggestion = fnd.suggestion;
    }

    const sortedValues = [...byValue.entries()].sort(
      (a, b) => b[1].occurrences.length - a[1].occurrences.length
    );

    // Section with suggestion
    const withTok = sortedValues.filter(([, v]) => v.suggestion);
    const noTok = sortedValues.filter(([, v]) => !v.suggestion);

    if (withTok.length) {
      md += `### Substituir por token existente\n\n`;
      for (const [value, info] of withTok) {
        const raws = [...info.raws].join(" / ");
        md += `- **\`${raws}\`** → \`var(--${info.suggestion})\` (${info.occurrences.length}x)\n`;
        for (const occ of info.occurrences.slice(0, 8)) {
          md += `  - ${occ.file}:${occ.line} \`${occ.property}\`\n`;
        }
        if (info.occurrences.length > 8) md += `  - … (+${info.occurrences.length - 8})\n`;
      }
      md += "\n";
    }

    if (noTok.length) {
      md += `### Sem token equivalente (candidatos a virar token)\n\n`;
      for (const [, info] of noTok) {
        const raws = [...info.raws].join(" / ");
        md += `- **\`${raws}\`** (${info.occurrences.length}x)\n`;
        for (const occ of info.occurrences.slice(0, 6)) {
          md += `  - ${occ.file}:${occ.line} \`${occ.property}\`\n`;
        }
        if (info.occurrences.length > 6) md += `  - … (+${info.occurrences.length - 6})\n`;
      }
      md += "\n";
    }
  }

  return md;
}

function buildInventory(filesData, tokenByName) {
  let md = "";
  md += "# UI / CSS Inventory\n\n";
  md += `_Gerado automaticamente por \`scripts/css-audit.mjs\` em ${new Date().toISOString()}._\n\n`;
  md += "## Tokens disponíveis (`styles/tokens.css`)\n\n";
  md += "| Token | Valor |\n|---|---|\n";
  for (const [name, value] of tokenByName) md += `| \`--${name}\` | \`${value}\` |\n`;
  md += "\n";

  md += "## Arquivos\n\n";
  const sorted = [...filesData].sort((a, b) => a.file.localeCompare(b.file));
  for (const f of sorted) {
    const literals = f.findings.length;
    const literalsWithTok = f.findings.filter((x) => x.suggestion).length;
    md += `### ${f.file}\n\n`;
    md += `- Classes: ${f.classes.length ? f.classes.map((c) => `\`.${c}\``).join(", ") : "_(nenhuma)_"}\n`;
    md += `- Tokens em uso: ${f.tokensUsed.length ? f.tokensUsed.map((t) => `\`--${t}\``).join(", ") : "_(nenhum)_"}\n`;
    md += `- Literais: ${literals} (com token equivalente: ${literalsWithTok})\n`;
    if (literals) {
      const byCat = new Map();
      for (const fnd of f.findings) {
        if (!byCat.has(fnd.category)) byCat.set(fnd.category, 0);
        byCat.set(fnd.category, byCat.get(fnd.category) + 1);
      }
      const parts = [...byCat.entries()].sort().map(([c, n]) => `${c}: ${n}`);
      md += `  - Por categoria: ${parts.join(", ")}\n`;
    }
    md += "\n";
  }
  return md;
}

// ---------- main ----------

function main() {
  if (!existsSync(TOKENS_FILE)) {
    console.error(`tokens file not found: ${TOKENS_FILE}`);
    process.exit(1);
  }
  const tokensSrc = readFileSync(TOKENS_FILE, "utf8");
  const tokenIdx = parseTokens(tokensSrc);
  // build a flat name->value map for inventory
  const tokenByName = new Map();
  const declRe = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let dm;
  while ((dm = declRe.exec(tokensSrc))) tokenByName.set(dm[1], dm[2].trim());

  const cssFiles = walk(ROOT).filter((p) => {
    const r = relPath(p);
    // ignore tokens file itself and built CSS
    if (r === "styles/tokens.css") return false;
    return true;
  });

  const filesData = cssFiles.map((p) => extractFromFile(p, readFileSync(p, "utf8"), tokenIdx));

  const docsDir = join(ROOT, "docs");
  if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });

  const auditMd = buildAuditReport(filesData, tokenIdx);
  const invMd = buildInventory(filesData, tokenByName);

  writeFileSync(join(docsDir, "css-audit.md"), auditMd, "utf8");
  writeFileSync(join(docsDir, "ui-inventory.md"), invMd, "utf8");

  const totalFindings = filesData.reduce((acc, f) => acc + f.findings.length, 0);
  const withSug = filesData.reduce(
    (acc, f) => acc + f.findings.filter((x) => x.suggestion).length,
    0
  );

  console.log(`css-audit: ${cssFiles.length} arquivos, ${totalFindings} literais (${withSug} com token equivalente)`);
  console.log(`  -> docs/css-audit.md`);
  console.log(`  -> docs/ui-inventory.md`);
}

main();

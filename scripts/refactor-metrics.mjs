#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROADMAP_TARGETS = [
  'components/ui-grid/holistic-sheet.tsx',
  'components/files/file-manager-workspace.tsx',
  'app/api/v1/grid/[table]/route.ts',
];

const REQUIRED_HEADINGS = [
  '### Linhas antes/depois (obrigatório)',
  '### Delta lint warnings (obrigatório)',
  '### Evidência de testes (obrigatório)',
  '### Tempo de review (obrigatório)',
  '## Checklist de risco por fase (gate de merge)',
];

function run(cmd, options = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function escapeForRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRoadmapTarget(file) {
  return ROADMAP_TARGETS.includes(file);
}

function getChangedFiles(baseRef = 'HEAD~1') {
  const out = run(`git diff --name-only ${baseRef}...HEAD`);
  return out ? out.split('\n').filter(Boolean) : [];
}

function readFileFromRef(ref, file) {
  try {
    return run(`git show ${ref}:${file}`);
  } catch {
    return null;
  }
}

function countLinesFromText(text) {
  if (!text) return 0;
  return text.split('\n').length;
}

function countLinesFromRef(ref, file) {
  const content = readFileFromRef(ref, file);
  return countLinesFromText(content);
}

function countLinesFromHead(file) {
  if (!fs.existsSync(file)) return 0;
  return countLinesFromText(fs.readFileSync(file, 'utf8'));
}

function lintWarningsForFiles(files) {
  if (!files.length) return { totalWarnings: 0, byFile: {} };

  const quoted = files.map((file) => `"${file}"`).join(' ');
  let raw;

  try {
    raw = run(`npx eslint -f json ${quoted}`);
  } catch (error) {
    raw = error.stdout?.toString() ?? '[]';
  }

  const parsed = JSON.parse(raw || '[]');
  const byFile = {};
  let totalWarnings = 0;

  for (const result of parsed) {
    const relative = path.relative(process.cwd(), result.filePath);
    const warningCount = result.warningCount ?? 0;
    byFile[relative] = warningCount;
    totalWarnings += warningCount;
  }

  return { totalWarnings, byFile };
}

function lintWarningsForBaseRef(baseRef, files) {
  if (!files.length) return { totalWarnings: 0, byFile: {} };

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-metrics-'));

  try {
    for (const file of files) {
      const content = readFileFromRef(baseRef, file);
      if (content === null) continue;

      const fullPath = path.join(tmpRoot, file);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, `${content}\n`);
    }

    const lintTargets = files
      .map((file) => path.join(tmpRoot, file))
      .filter((fullPath) => fs.existsSync(fullPath));

    if (!lintTargets.length) return { totalWarnings: 0, byFile: {} };

    const quoted = lintTargets.map((file) => `"${file}"`).join(' ');
    let raw;

    try {
      raw = run(`npx eslint -f json ${quoted}`);
    } catch (error) {
      raw = error.stdout?.toString() ?? '[]';
    }

    const parsed = JSON.parse(raw || '[]');
    const byFile = {};
    let totalWarnings = 0;

    for (const result of parsed) {
      const filePath = path.relative(tmpRoot, result.filePath);
      const warningCount = result.warningCount ?? 0;
      byFile[filePath] = warningCount;
      totalWarnings += warningCount;
    }

    return { totalWarnings, byFile };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function validatePrBody(body) {
  const failures = [];
  const normalized = body || "";

  for (const heading of REQUIRED_HEADINGS) {
    if (!normalized.includes(heading)) failures.push(`Seção obrigatória ausente: ${heading}`);
  }

  const numberFields = ["Antes", "Depois", "Delta", "Base", "Atual"];
  for (const label of numberFields) {
    if (!new RegExp(`- ${escapeForRegex(label)}:\\s*-?\\d+`, "i").test(normalized)) {
      failures.push(`Campo obrigatório inválido: ${label}.`);
    }
  }

  if (!/- Tempo total de revisão:\s*.+/i.test(normalized)) {
    failures.push("Campo obrigatório inválido: Tempo total de revisão.");
  }
  if (!/- Nº de revisores:\s*\d+/i.test(normalized)) {
    failures.push("Campo obrigatório inválido: Nº de revisores.");
  }
  if (!/```txt[\s\S]+```/.test(normalized)) {
    failures.push("Evidência de testes inválida: bloco de comandos/saída não encontrado.");
  }

  for (const phase of ["Fase 1", "Fase 2", "Fase 3"]) {
    const phaseStart = normalized.indexOf(`### ${phase}`);
    const nextPhaseMatch = phaseStart >= 0 ? normalized.slice(phaseStart + 1).match(/\n### Fase [123]/) : null;
    const phaseEnd = phaseStart >= 0 && nextPhaseMatch ? phaseStart + 1 + nextPhaseMatch.index : normalized.length;
    const phaseSection = phaseStart >= 0 ? normalized.slice(phaseStart, phaseEnd) : "";

    for (const item of ["Segurança validada", "Regressão visual validada", "Performance validada"]) {
      if (!new RegExp(`- \\[x\\] ${escapeForRegex(item)}`, "i").test(phaseSection)) {
        failures.push(`Checklist de risco incompleto em ${phase}: ${item}.`);
      }
    }
  }

  return failures;
}

function collectCommand(args) {
  const baseRef = args[0] || 'origin/main';
  const outputFile = args[1] || 'docs/refactor-metrics/current.json';
  const changedFiles = getChangedFiles(baseRef).filter(isRoadmapTarget);
  const headLint = lintWarningsForFiles(changedFiles);

  const files = changedFiles.map((file) => {
    const linesBefore = countLinesFromRef(baseRef, file);
    const linesAfter = countLinesFromHead(file);
    return {
      file,
      linesBefore,
      linesAfter,
      deltaLines: linesAfter - linesBefore,
      lintWarnings: headLint.byFile[file] ?? 0,
    };
  });

  const result = {
    generatedAt: new Date().toISOString(),
    baseRef,
    changedFiles,
    totals: {
      linesBefore: files.reduce((sum, file) => sum + file.linesBefore, 0),
      linesAfter: files.reduce((sum, file) => sum + file.linesAfter, 0),
      deltaLines: files.reduce((sum, file) => sum + file.deltaLines, 0),
      lintWarnings: headLint.totalWarnings,
    },
    files,
  };

  writeJson(outputFile, result);
  console.log(`Métricas salvas em ${outputFile}`);
}

function gateCommand(args) {
  const baselineFile = args[0] || 'docs/refactor-metrics/baseline.json';
  const baseRef = args[1] || process.env.GITHUB_BASE_REF || 'origin/main';
  const prBody = process.env.PR_BODY || '';

  const changedFiles = getChangedFiles(baseRef).filter(isRoadmapTarget);
  const headLint = lintWarningsForFiles(changedFiles);
  const baseLint = lintWarningsForBaseRef(baseRef, changedFiles);
  const baseline = readJson(baselineFile);
  const failures = [...validatePrBody(prBody)];

  if (!Array.isArray(baseline?.targets)) {
    failures.push(`Baseline ausente ou inválido: ${baselineFile}`);
  } else {
    const targetMap = new Map(baseline.targets.map((target) => [target.file, target]));

    for (const file of changedFiles) {
      const target = targetMap.get(file);
      if (!target) {
        failures.push(`Meta mínima não informada para arquivo alterado: ${file}`);
        continue;
      }

      const maxWarnings = target.maxLintWarnings;
      const currentWarnings = headLint.byFile[file] ?? 0;
      const previousWarnings = baseLint.byFile[file] ?? 0;

      if (typeof maxWarnings !== 'number') {
        failures.push(`Meta de lint inválida para ${file}`);
      } else if (currentWarnings > maxWarnings) {
        failures.push(`Warnings acima do limite em ${file}: atual ${currentWarnings}, limite ${maxWarnings}.`);
      }

      if (currentWarnings > previousWarnings) {
        failures.push(`Warnings aumentaram em ${file}: base ${previousWarnings}, atual ${currentWarnings}.`);
      }
    }
  }

  if (failures.length) {
    console.error('Falha no quality gate de refactor:\n');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log('Quality gate de refactor aprovado.');
}

const [, , command, ...rest] = process.argv;

if (command === 'collect') collectCommand(rest);
else if (command === 'gate') gateCommand(rest);
else {
  console.log('Uso: node scripts/refactor-metrics.mjs <collect|gate> [args]');
  process.exit(1);
}

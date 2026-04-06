const fs = require('fs');
const path = require('path');

function needsFix(text) {
  return /[ÃÂ�]/.test(text);
}

function decodeLatin1Utf8(str) {
  let prev = str;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(escape(prev));
      if (next === prev) return next;
      prev = next;
    } catch (_) {
      return prev;
    }
  }
  return prev;
}

function fixFile(filePath) {
  const raw = fs.readFileSync(filePath, 'latin1');
  const source = typeof raw === 'string' ? raw : raw.toString('latin1');
  if (!needsFix(source)) {
    console.log(`[skip] ${filePath} (no mojibake markers)`);
    return false;
  }
  const fixed = decodeLatin1Utf8(source)
    // Normalize common punctuation we want consistent
    .replace(/\u00b7/g, '·')
    // Targeted label fixes observed in UI
    .replace(/PreÃƒÆ’Ã‚Â§o/g, 'Preço')
    .replace(/AtÃƒÆ’Ã‚Â©/g, 'Até')
    .replace(/PREPARAÃƒÆ’Ã¢â‚¬Â¡AO/g, 'PREPARAÇÃO')
    .replace(/paginaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o sÃƒÆ’Ã‚Â£o/g, 'paginação são')
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢/g, '•')
    .replace(/ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â²/g, '↑')
    .replace(/ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¼/g, '↓');

  let next = fixed;
  // Replace expand/collapse glyphs with ASCII v/> for robustness
  next = next.replace(/\{\s*expandedGroupIds\.has\(rowId\)\s*\?\s*"[\s\S]*?"\s*:\s*"[\s\S]*?"\s*\}/g,
    '{expandedGroupIds.has(rowId) ? "v" : ">"}');

  // Replace branch markers in child rows with ASCII
  next = next.replace(/(<span className=\"sheet-child-branch\">)\{\s*isBucketStart\s*\?\s*"[\s\S]*?"\s*:\s*"[\s\S]*?"\s*\}(<\/span>)/g,
    '$1{isBucketStart ? "--" : "|-"}$2');

  // Replace section toggles (technical/characteristics) to +/-
  next = next.replace(/\{\s*carFormSectionsOpen\.technical\s*\?\s*"[^"]*"\s*:\s*"\+"\s*\}/g,
    '{carFormSectionsOpen.technical ? "-" : "+"}');
  next = next.replace(/\{\s*carFormSectionsOpen\.characteristics\s*\?\s*"[^"]*"\s*:\s*"\+"\s*\}/g,
    '{carFormSectionsOpen.characteristics ? "-" : "+"}');

  // Replace print column order arrows content to ASCII ^ / v
  next = next.replace(/(data-testid=\{`print-column-up-\$\{column\}`\}[\s\S]*?>)([\s\S]*?)(<\/button>)/g,
    '$1\n                                  ^\n                                $3');
  next = next.replace(/(data-testid=\{`print-column-down-\$\{column\}`\}[\s\S]*?>)([\s\S]*?)(<\/button>)/g,
    '$1\n                                  v\n                                $3');

  // Replace print section order arrows content as well
  next = next.replace(/(data-testid=\{`print-section-up-\$\{[^}]+\}`\}[\s\S]*?>)([\s\S]*?)(<\/button>)/g,
    '$1\n                                      ^\n                                    $3');
  next = next.replace(/(data-testid=\{`print-section-down-\$\{[^}]+\}`\}[\s\S]*?>)([\s\S]*?)(<\/button>)/g,
    '$1\n                                      v\n                                    $3');

  // Replace stray em-dash mojibake
  next = next.replace(/ÃƒÆ’Ã¢â‚¬â€/g, '—');

  // Fix specific Portuguese strings that were corrupted in code
  next = next.replace(/altera��ǜo de pre��o/g, 'alteração de preço');
  next = next.replace(/anǧncio/g, 'anúncio');
  next = next.replace(/Contexto de altera��ǜo de pre��o Ǹ obrigat��rio\./g, 'Contexto de alteração de preço é obrigatório.');

  if (next === source) {
    console.log(`[noop] ${filePath}`);
    return false;
  }

  const backup = `${filePath}.bak`;
  if (!fs.existsSync(backup)) {
    fs.writeFileSync(backup, source, 'utf8');
  }
  fs.writeFileSync(filePath, next, 'utf8');
  console.log(`[fixed] ${filePath}`);
  return true;
}

function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error('Usage: node tools/fix-mojibake.js <file> [more files]');
    process.exit(2);
  }
  let changed = 0;
  for (const rel of targets) {
    const abs = path.resolve(rel);
    if (fs.existsSync(abs)) {
      if (fs.statSync(abs).isDirectory()) {
        // Process .ts/.tsx under dir
        const walk = (dir) => {
          for (const entry of fs.readdirSync(dir)) {
            const p = path.join(dir, entry);
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p);
            else if (/\.(t|j)sx?$/.test(entry)) changed += fixFile(p) ? 1 : 0;
          }
        };
        walk(abs);
      } else {
        changed += fixFile(abs) ? 1 : 0;
      }
    } else {
      console.error(`[warn] Not found: ${rel}`);
    }
  }
  if (changed === 0) {
    console.log('No files changed.');
  } else {
    console.log(`Changed ${changed} file(s).`);
  }
}

if (require.main === module) main();

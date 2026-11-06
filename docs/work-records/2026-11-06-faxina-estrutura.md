# 2026-11-06 — Faxina da estrutura de pastas

## Pedido
"Faxine a estrutura de pastas do projeto, porque tem muitos arquivos e pastas que não conheço o
propósito. Se necessário, reestruture para melhor aproveitamento cognitivo, com o que é recomendado
pela indústria."

## O que mudou
- **Fora do git (só local, já ignorados):** 22 logs `tmp-*.log`, `debug.log`, `visual-review*` (pastas
  e PNGs), `mobile-audit/` (29 MB de capturas/scripts de diagnóstico), `playwright-report/`,
  `test-results/`. Nada versionado foi tocado nessa etapa.
- **Removidos do repo (sem uso):** `patch.diff` (patch de abril), `query.json` (consulta solta),
  `tests/e2e/fotos/` (10 imagens que nenhum teste usa), `components/dashboard-card.tsx`,
  `components/atoms/*`, `components/ui-grid/sections/toolbar-section.tsx`,
  `components/vendedor/vendedor-soon.tsx`, `lib/supabase/server.ts` (duplicata de
  `lib/api/supabase-admin.ts`) — com o CSS deles. Relatórios gerados `docs/css-audit.md` e
  `docs/ui-inventory.md` saíram do git (ficam no `.gitignore`; `node scripts/css-audit.mjs` recria).
- **`tools/` → `scripts/`:** uma pasta só de utilitários (`scripts/db/` para SQL/Management API,
  `scripts/fix-mojibake.js`).
- **`docs/`:** diagnósticos e planos de março–maio foram para `docs/archive/`; `docs/README.md`
  explica cada parte. `processo-documental.md` segue na raiz de `docs/`.
- **README.md reescrito** com o mapa pasta → propósito (o antigo citava PRD inexistente, rotas
  desatualizadas e caminhos `/workspaces/...`). AGENTS.md (estrutura, tamanhos dos monólitos) e
  CLAUDE.md (`/editor` apagado, visual na suíte) atualizados.

## Mantido de propósito
- `plugins/`, `.agents/`, `.engineering-quality.yaml`: plugin do Codex. Os scripts dele fixam o caminho
  `plugins/engineering-quality-governor/` — mover quebraria a ferramenta. Documentado no README.
- `apps-script/` (backup no Google, publicado à mão), `supabase/functions/` (Edge Function
  `consulta-placa`), `styles/` (CSS das páginas públicas).
- Organização de `app/`, `components/`, `lib/` já segue o padrão do Next (rotas por pasta, UI por
  feature, regras em `lib/domain`) — sem movimentação para não gerar churn sem ganho.

## Verificação
- tsc, eslint, vitest (653); busca por referências aos caminhos removidos/movidos (nenhuma restante
  fora de registros históricos).

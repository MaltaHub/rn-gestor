# Painel de métricas de refactor por fase

## Baseline inicial (2026-04-22)
| Fase | Alvo | Arquivo monitorado | Linhas baseline | Limite lint warnings |
|---|---|---|---:|---:|
| Fase 1 | `holistic-sheet` | `components/ui-grid/holistic-sheet.tsx` | 7201 | 0 |
| Fase 2 | `file-manager-workspace` | `components/files/file-manager-workspace.tsx` | 2380 | 0 |
| Fase 3 | `route.ts` | `app/api/v1/grid/[table]/route.ts` | 20 | 0 |

## Progresso acumulado
> Atualize por PR com base no output de `docs/refactor-metrics/current.json`.

| Fase | Última coleta | Linhas antes | Linhas depois | Delta linhas | Delta warnings |
|---|---|---:|---:|---:|---:|
| Fase 1 | pendente | pendente | pendente | pendente | pendente |
| Fase 2 | pendente | pendente | pendente | pendente | pendente |
| Fase 3 | pendente | pendente | pendente | pendente | pendente |

## Como atualizar
1. Executar `node scripts/refactor-metrics.mjs collect origin/main docs/refactor-metrics/current.json`.
2. Consolidar no painel os dados de `linhas antes/depois`, `delta linhas` e `lint warnings` por fase.
3. Ajustar `docs/refactor-metrics/baseline.json` somente com aprovação técnica registrada em PR.

## Gate de merge por risco
Cada fase deve marcar explicitamente os 3 riscos no template de PR:
- Segurança.
- Regressão visual.
- Performance.

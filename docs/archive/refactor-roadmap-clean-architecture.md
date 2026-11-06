# Roadmap de Refatoração para Clean Architecture

Data de referência: 2026-04-22  
Escopo do baseline: conjunto priorizado de arquivos críticos (não o repositório inteiro bruto).

## 1) Baseline por arquivo crítico

> Método usado no baseline:
> - **Linhas**: contagem física por arquivo.
> - **Número de funções**: funções declaradas (`function`) + constantes com arrow function (`const x = () =>`).
> - **Dependências importadas**: total de módulos únicos em `import`.
> - **Warnings lint**: `eslint` por arquivo (somente warnings; erros = 0 na amostra).

| Arquivo crítico | Linhas | Nº funções | Dependências importadas | Warnings lint |
|---|---:|---:|---:|---:|
| `components/ui-grid/holistic-sheet.tsx` | 7241 | 142 | 17 | 15 |
| `components/files/file-manager-workspace.tsx` | 2824 | 42 | 9 | 7 |
| `components/audit/audit-log-dashboard.tsx` | 961 | 14 | 2 | 0 |
| `components/auth/auth-provider.tsx` | 598 | 17 | 7 | 0 |
| `app/api/v1/grid/[table]/route.ts` | 527 | 8 | 11 | 0 |

### Observações do baseline

- Os **2 maiores monólitos** são `holistic-sheet.tsx` e `file-manager-workspace.tsx`.
- O maior risco técnico imediato está em:
  - alta densidade de lógica + UI no `holistic-sheet`;
  - warnings de hooks (dependências) nos dois maiores componentes;
  - acoplamento de regras de domínio na rota genérica de grid.

---

## 2) Metas por fase

## Fase 1 — Reduzir 35% dos 2 maiores monólitos

### Meta quantitativa (por arquivo)

| Arquivo | Baseline | Meta Fase 1 (−35%) | Limite alvo (linhas) |
|---|---:|---:|---:|
| `components/ui-grid/holistic-sheet.tsx` | 7241 | −2534 | **<= 4707** |
| `components/files/file-manager-workspace.tsx` | 2824 | −989 | **<= 1835** |

### Resultado esperado da fase

- Separação por camadas (apresentação, hooks de orquestração, regras de domínio de UI).
- Queda de warnings de hooks para no máximo 50% do baseline desses dois arquivos.

## Fase 2 — Redução acumulada de 50% (nos mesmos 2 monólitos)

### Meta quantitativa (acumulada)

| Arquivo | Baseline | Meta Fase 2 acumulada (−50%) | Limite alvo (linhas) |
|---|---:|---:|---:|
| `components/ui-grid/holistic-sheet.tsx` | 7241 | −3621 | **<= 3620** |
| `components/files/file-manager-workspace.tsx` | 2824 | −1412 | **<= 1412** |

### Resultado esperado da fase

- Casos de uso de UI explícitos e testáveis.
- Componentes de seção independentes com contratos estáveis.
- Rota de grid consumindo serviços mais coesos (menos regra inline em handler).

## Fase 3 — Atingir 60% no conjunto priorizado

### Meta quantitativa (conjunto priorizado)

- **Baseline conjunto priorizado**: 12.151 linhas.
- **Meta Fase 3 (−60%)**: remover 7.291 linhas.
- **Orçamento alvo final**: **<= 4.860 linhas** no conjunto priorizado.

> Importante: esta meta é sobre o **conjunto priorizado** de arquivos críticos, não sobre todas as linhas do repositório.

---

## 3) Checkpoints de risco por fase

| Fase | Segurança | Regressão visual | Performance | Tempo de PR review |
|---|---|---|---|---|
| Fase 1 | Nenhum endpoint novo sem validação explícita de entrada/saída; revisão de autorização em rotas tocadas. | Snapshot + smoke dos fluxos principais da grid e arquivos antes/depois de extrações. | Medir tempo de render inicial e interação crítica (scroll, seleção, upload). Regressão máxima: +10%. | PRs com no máximo ~500 linhas líquidas alteradas por fatia. |
| Fase 2 | Consolidar fronteira de permissão: regras críticas centralizadas em serviço/caso de uso. | Testes visuais por seção extraída (toolbar, sidepanel, dialogs). | Baseline e comparação de latência em operações de massa (bulk edit/upload). Regressão máxima: +5%. | PRs de refatoração com escopo por módulo; review médio alvo <= 1 dia útil. |
| Fase 3 | Auditoria de trilha de mudanças em fluxos sensíveis + cobertura de cenários de acesso negado. | Regressão visual zero em jornadas críticas definidas no checklist final. | Sem regressão perceptível em UX; target de estabilidade em sessões longas. | PRs menores e temáticos; redução de retrabalho por comentário recorrente. |

---

## 4) Épicos, DoD e checklist de testes

## Épico A — Decompor `holistic-sheet` (UI Grid)

### Definition of Done (DoD)

- Arquivo principal com responsabilidade de composição (sem regras extensas inline).
- Hooks de estado/efeitos separados por domínio (seleção, filtros, dados, impressão).
- Seções visuais isoladas em componentes próprios com props tipadas.
- Warnings de lint do arquivo reduzidos em pelo menos 70% até o fim do épico.

### Checklist de testes

- [ ] Unit: utilitários puros (filtros, ordenação, parsing, formatadores).
- [ ] Integração: hooks principais (seleção, mutações, carregamento).
- [ ] E2E: edição de célula, filtros compostos, ações em lote, impressão/export.
- [ ] Regressão visual: estados de loading, erro, vazio e sucesso.

## Épico B — Modularizar `file-manager-workspace`

### Definition of Done (DoD)

- Fluxos de upload, seleção e navegação desacoplados em hooks/componentes dedicados.
- Controle de fila de upload com estado determinístico e eventos observáveis.
- Remoção dos warnings de `react-hooks/exhaustive-deps` no escopo do épico.
- Contratos de API mantidos/explicitados com tipagem.

### Checklist de testes

- [ ] Unit: regras de fila (pause/resume/cancel/retry).
- [ ] Integração: upload em lote + falha parcial + retomada.
- [ ] E2E: navegação por pasta, multi-seleção, upload e reorder.
- [ ] Performance: tempo médio de enfileiramento e resposta de UI em lotes.

## Épico C — Endurecer backend da grid e fronteira de domínio

### Definition of Done (DoD)

- `app/api/v1/grid/[table]/route.ts` reduzido a orquestração HTTP (sem regra de domínio extensa).
- Validação de entrada padronizada e política de campos por allow-list.
- Serviços de domínio reutilizáveis entre rota genérica e rotas específicas.
- Logs/auditoria cobrindo operações críticas de leitura e escrita.

### Checklist de testes

- [ ] Unit: validadores de payload e políticas de coluna.
- [ ] Integração: cenários de autorização por papel e tentativa de escrita proibida.
- [ ] Contrato API: respostas de erro/sucesso estáveis.
- [ ] Segurança: testes de negação para tabelas/colunas fora da política.

## Épico D — Sustentação arquitetural (auth/auditoria + governança de qualidade)

### Definition of Done (DoD)

- `auth-provider` e dashboard de auditoria com responsabilidades claras e baixo acoplamento.
- Métricas de qualidade visíveis por épico (linhas, warnings, cobertura, tempo de review).
- Padrão de PR com escopo pequeno e checklist obrigatório preenchido.

### Checklist de testes

- [ ] Integração: sessão expirada, refresh de token, acesso por papel.
- [ ] E2E: jornada admin e trilha de auditoria.
- [ ] Regressão visual: telas de autenticação e auditoria.
- [ ] Qualidade: lint, typecheck e suite de testes obrigatórios no CI.

---

## 5) Cadência sugerida de execução

- **Sprint 1-2 (Fase 1):** quebrar os 2 maiores monólitos em fatias funcionais.
- **Sprint 3-4 (Fase 2):** consolidar serviços/casos de uso e estabilizar testes por módulo.
- **Sprint 5+ (Fase 3):** otimizar conjunto priorizado até meta de 60% e fechar débitos de risco.

## 6) Métricas de acompanhamento (obrigatórias por PR)

- Linhas do(s) arquivo(s) alvo antes/depois.
- Delta de warnings lint no escopo alterado.
- Evidência de teste executado (unit/integration/e2e conforme checklist).
- Tempo de review (abertura -> aprovação) para medir saúde do fluxo.

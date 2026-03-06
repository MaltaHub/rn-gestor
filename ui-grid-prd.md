# PRD - Framework Final do `ui_grid`

## 1. Objetivo
Definir o framework final da feature `ui_grid` para replicacao no novo projeto, mantendo os comportamentos atuais e evoluindo para uma implementacao mais otimizada, limpa, robusta, moderna e inteligente.

## 2. Problema que o Grid resolve
1. Consolidar visualizacao e operacao de tabelas heterogeneas do ERP em uma unica experiencia consistente.
2. Suportar operacoes operacionais de alta frequencia: selecao, filtros complexos, edicao rapida, lote, copia/cola e navegacao por teclado.
3. Integrar status de negocio em tempo real no contexto da grade (anuncios, repetidos, divergencia de preco, conferencia).

## 3. Escopo da Feature
### Em escopo
1. Renderizacao tabular com header dinamico por tabela.
2. Selecao de linhas e celulas (single, multi, range).
3. Filtros por coluna e busca global.
4. Ordenacao multi-coluna.
5. Paginacao local e server-driven.
6. Redimensionamento de colunas com persistencia.
7. Tooltips inteligentes (FK, overflow de celula, grupos repetidos).
8. Edicao inline por celula e edicao completa via painel.
9. Operacoes de copia/cola em massa de celulas.
10. Comportamentos especiais por tabela (`CARROS`, `ANUNCIOS`, `REPETIDOS_GRUPOS`).

### Fora de escopo (MVP do novo grid)
1. Virtualizacao de linhas acima de 5k por pagina.
2. Colunas agrupadas/pivot.
3. Formula engine nativa na grade.

## 4. Visao de Produto para o Grid
`ui_grid` sera um framework interno de interacao de dados, composto por nucleo de estado, motor de interacao, renderizacao e plugins de dominio. Ele deve permitir evolucao de regras sem reescrita do componente base.

## 5. Personas e necessidades
1. Vendedor: leitura rapida, foco em status visual, selecao simples e navegacao por teclado.
2. Secretario: filtros fortes, operacoes em lote, edicoes recorrentes.
3. Gerente: analise de divergencias e anomalias com feedback visual.
4. Admin: controle total, produtividade em massa e rastreabilidade.

## 6. Mapa funcional (estado atual observado)
1. Header com ordenacao multi-coluna e indicador de prioridade.
2. Linha de filtros por coluna via `FilterTooltip`.
3. Botao de selecao global com ciclo inteligente (none -> all -> invert -> clear).
4. Botao de ocultar/exibir linhas selecionadas (estado local por tabela).
5. Selecao de linha por clique com regras desktop/mobile/mode-lote.
6. Selecao de celula com click, ctrl/cmd, shift, arraste e teclado.
7. Hotkeys: setas, shift+setas, ctrl/cmd+c, ctrl/cmd+v.
8. Edicao inline em double-click (com fila de persistencia).
9. Render de tooltips FK e tooltip de overflow de texto.
10. Render de estilos condicionais por dominio (`rowRepeatedGroup`, `rowAnuncioPriceMismatch`, etc).
11. Expansao de grupos em `REPETIDOS_GRUPOS` com linhas-filhas.
12. Persistencia local de filtros e larguras por `localStorage`.
13. Integracao com paginacao e busca do `Controller`.

## 7. Arquitetura alvo do Framework
## 7.1 Modulos
1. `GridCore`: estado interno, ciclo de vida, API publica.
2. `GridRenderer`: render de head/body/colgroup.
3. `GridSelectionEngine`: selecao de linhas/celulas/ranges.
4. `GridFilterEngine`: aplicacao de filtros e integracao tooltip/store.
5. `GridSortEngine`: ordenacao local estavel + cadeia de criterios.
6. `GridEditEngine`: inline edit, validacoes e enfileiramento.
7. `GridClipboardEngine`: copia/cola tabular (CSV/TSV).
8. `GridLayoutEngine`: resize de colunas, largura total, responsividade.
9. `GridDomainPlugins`: extensoes de dominio (anuncios, repetidos, conferencia, finalizacao).
10. `GridEventBusAdapter`: contratos de eventos padronizados.

## 7.2 API publica do grid (obrigatoria)
1. `init(config)`
2. `setData({ header, rows, totalRows, page, pageSize })`
3. `setState(partialState)`
4. `render()`
5. `reset()`
6. `destroy()`
7. `moveCellSelectionBy(dr, dc, opts)`
8. `getSelection()`
9. `applyExternalFilterState(filters)`
10. `applyExternalColumnWidths(widths)`

## 8. Modelo de estado (contrato)
1. `tableKey: string`
2. `header: string[]`
3. `rows: object[]`
4. `viewRows: object[]`
5. `selectedRowKeys: Set<string>`
6. `selectedCells: Set<string>` no formato `rowIndex::column`
7. `lastCellAnchor: { rIdx, col } | null`
8. `columnFilters: Record<string, string>`
9. `columnWidths: Record<string, number>`
10. `sort: { column, dir, chain[] }`
11. `currentPage, pageSize, totalRows`
12. `hiddenRowKeysByTable: Record<tableKey, Set<rowKey>>`
13. `expandedGroupIds: Set<string>`

## 9. Contrato de eventos (obrigatorio)
1. `selection:changed` payload com `rows`, `cells`, `source`.
2. `filters:changed` payload com `col`, `value`, `cleared`.
3. `view:updated` payload com `count`.
4. `grid:cell-edit-start` e `grid:cell-edit-end`.
5. `grid:copy` e `grid:paste`.
6. `grid:row-expand-toggle`.
7. `data:loading` e `data:loaded`.

## 10. Requisitos funcionais detalhados
1. RF-GRID-001: renderizar colunas dinamicamente por `header`.
2. RF-GRID-002: suportar ordenacao multi-coluna com prioridade visual.
3. RF-GRID-003: suportar filtros por coluna com expressoes:
`DATA`, `PROCH`, operadores (`=`, `!=`, `>`, `>=`, `<`, `<=`), `EXCETO`, `VAZIO`, multiselect.
4. RF-GRID-004: suportar busca global com `contains|exact|starts|ends`.
5. RF-GRID-005: suportar selecao de linhas por click/ctrl/shift e modo lote.
6. RF-GRID-006: suportar selecao de celulas por click/ctrl/shift/arraste.
7. RF-GRID-007: navegacao de celulas por teclado com scroll into view.
8. RF-GRID-008: copia de celulas para clipboard em texto simples/CSV.
9. RF-GRID-009: colagem tabular em bloco com enfileiramento de persistencia.
10. RF-GRID-010: edicao inline com double-click, bloqueando coluna PK.
11. RF-GRID-011: redimensionar coluna por drag, com persistencia por tabela.
12. RF-GRID-012: ocultar linhas selecionadas e restaurar ocultas.
13. RF-GRID-013: suportar linhas expandidas para grupos repetidos.
14. RF-GRID-014: tooltips para FK, grupos e overflow de celula.
15. RF-GRID-015: refletir classes visuais de status por plugin de dominio.

## 11. Requisitos nao funcionais
1. RNF-GRID-001: render inicial de 100 linhas em < 120ms em desktop medio.
2. RNF-GRID-002: interacoes de selecao e resize com latencia percebida < 16ms.
3. RNF-GRID-003: nenhuma perda de selecao em rerenders nao estruturais.
4. RNF-GRID-004: fallback funcional sem `navigator.clipboard`.
5. RNF-GRID-005: resiliencia a dados faltantes/null/headers mutantes.
6. RNF-GRID-006: cobertura de testes automatizados dos fluxos criticos.

## 12. Comportamentos de UX obrigatorios
1. A coluna de selecao sempre permanece na primeira posicao.
2. `select all` respeita apenas linhas visiveis no contexto atual.
3. Ao aplicar filtro, resetar pagina para 1 e limpar selecao.
4. Ao alterar sort, limpar selecao e manter estabilidade de ordenacao.
5. Double-click inicia inline edit; single-click seleciona celula.
6. Em mobile/coarse pointer, selecao prioriza simplicidade (linha unica).
7. Tooltips nao devem “piscar” nem ficar presos apos mouseleave.
8. Botao de ocultar linhas muda semantica entre “ocultar selecionadas” e “mostrar ocultas”.

## 13. Contrato com backend/API
1. Endpoint de listagem deve aceitar:
`page`, `pageSize`, `filters`, `query`, `matchMode`, `sort`.
2. Endpoint de upsert deve aceitar payload de linha completa.
3. Endpoint de delete deve aceitar PK (ou chave sintetica para tabela sem PK).
4. Endpoint de finalize/rebuild deve ser acionavel por acoes de linha.
5. Retorno de listagem deve conter:
`header`, `rows`, `totalRows`, `page`, `pageSize`.

## 14. Persistencia local (UX state)
1. `FilterStore`: salvar/ler filtros por tabela (`scope=grid`).
2. `ColumnWidthStore`: salvar/ler larguras por tabela.
3. `LastTableStore`: lembrar ultima tabela por usuario.
4. `ConferenceStore`: guardar marcacoes de conferencia por usuario/tabela.

## 15. Seguranca
1. Nenhuma credencial de banco no frontend.
2. Todas as mutacoes passam por API serverless autenticada.
3. Sanitizacao de conteudo para copiar/colar e para tooltips.
4. Bloqueio de edicao inline em colunas chave (PK).

## 16. Observabilidade
1. Logar eventos de erro de render, edicao, copy/paste e filtro invalido.
2. Medir tempo de render head/body.
3. Medir latencia de operacoes de fila de CRUD.
4. Dashboard com erros por tabela e operacao.

## 17. Estrategia de testes
1. Unitarios:
`SelectionEngine`, `SortEngine`, `FilterEngine`, `ClipboardEngine`.
2. Integracao:
grid + controller + stores.
3. E2E:
selecao range, filtro complexo, resize persistente, inline edit, copy/paste.
4. Regressao visual:
classes de status e linhas expandidas.

## 18. Fases de implementacao sugeridas
1. Fase A: Core + render + estado + contrato de eventos.
2. Fase B: sort/filter/paginacao + persistencia local.
3. Fase C: selecao avancada + teclado + resize.
4. Fase D: inline edit + clipboard + fila CRUD.
5. Fase E: plugins de dominio (`CARROS`, `ANUNCIOS`, `REPETIDOS_GRUPOS`).
6. Fase F: hardening, testes, metricas e a11y.

## 19. Criterios de aceite
1. Todos os RF-GRID-001..015 validados em homologacao.
2. RNF de performance atendidos para dataset MVP.
3. Persistencia de filtros/larguras funcionando por tabela.
4. Sem regressao em acoes de lote e painel de edicao.
5. Comportamentos especiais de dominio reproduzidos fielmente.

## 20. Decisoes arquiteturais recomendadas no novo repo
1. Implementar o grid em TypeScript com API de plugin declarativa.
2. Separar regras de dominio do renderer por feature flags/plugins.
3. Encapsular stores locais com versao (`v1`, `v2`) para migracao.
4. Adotar testes de contrato para eventos e payloads.
5. Preparar opcao de virtualizacao sem quebrar API publica.

# Plano de Reprojeto do Playground

Data: 2026-04-27

## 1. Objetivo

Reprojetar o sistema de Playground para funcionar como uma planilha operacional leve, com alimentadores independentes posicionados sobre o grid. O novo desenho deve reduzir picos de processamento, permitir arrastar alimentadores e fragmentos sem sobreposicao, isolar filtros/ordenacao por alimentador, melhorar a UI de cores, permitir ocultar linhas de grade e corrigir a margem grande na impressao.

O estado atual centraliza a maior parte da funcionalidade em `components/playground/playground-workspace.tsx`, materializa alimentadores dentro de `page.cells` e mistura responsabilidades de UI, dominio, persistencia, fetch, selecao, formatacao e impressao. O reprojeto deve separar dominio, aplicacao e apresentacao para que a evolucao do playground seja previsivel e testavel.

## 2. Decisoes Fechadas

- Alimentadores e fragmentos serao blocos independentes renderizados sobre o grid, nao celulas globais gravadas na planilha base.
- Fragmentos serao grupos automaticos por coluna/valor.
- O usuario escolhe a coluna de fragmentacao e escolhe quais valores viram fragmentos.
- A opcao "todas as ocorrencias exceto" deve existir para facilitar criar fragmentos a partir de muitos valores.
- Cada fragmento tera header, posicao, filtros, ordenacao, colunas e expansao de FK proprios.
- O alimentador pai continua existindo e deve mostrar as linhas nao destacadas em fragmentos, quando aplicavel.
- Remover um fragmento devolve aquele grupo ao alimentador pai.
- O usuario pode segurar e arrastar alimentadores/fragmentos livremente pelo grid.
- Drops em area ocupada devem usar snap livre para o espaco valido mais proximo.
- Linhas individuais nao serao arrastadas como fragmentos.
- Filtros e ordenacao dos alimentadores devem ser executados por alimentador/fragmento no servidor, com debounce, cache e cancelamento de requests obsoletos.
- Header de alimentador/fragmento aparece no hover, focus ou enquanto menu/dropdown estiver aberto.
- Header deve ficar logo acima do bloco, adjacente a linha de indices.
- O header deve conter nome da tabela alimentada ou nome do grupo fragmentado e botao dropdown de acoes.
- O header deve permitir expandir FK, seguindo o padrao do grid principal/gerador de impressao.

## 3. Problemas Atuais A Corrigir

- `PlaygroundWorkspace` concentra muitas responsabilidades e tem alto custo de manutencao.
- `renderFeedIntoPage` escreve dados de alimentadores em `page.cells`, acoplando alimentadores ao grid global.
- Reordenar ou filtrar alimentador hoje tende a exigir alteracao global ou rerender amplo da planilha.
- Refresh de alimentadores busca linhas sequencialmente e pode gerar picos de CPU/render.
- Resize de linhas/colunas atualiza estado React em cada movimento de mouse.
- Grid renderiza todas as linhas/colunas visiveis, mesmo quando o viewport mostra uma pequena parte.
- Nao existe modelo de colisao/snap para alimentadores.
- Nao existe modelo de fragmentacao por grupos.
- UI de cores e formatacao esta pesada e visualmente blocada.
- Impressao do playground usa `body { margin: 24px; }`.
- Impressao geral em `components/ui-grid/print-job.ts` usa `@page { margin: 8mm; }` e `body { padding: 56px 12px 12px; }`, criando margem visual grande.

## 4. Arquitetura Alvo

### 4.1 Camadas

Criar uma organizacao por camadas dentro de `components/playground`:

- `domain/`: tipos de dominio, geometria, colisao, fragmentacao, queries, estilos e regras puras.
- `application/`: hooks/casos de uso para workbook, alimentadores, fragmentos, drag, fetch, cache, persistencia e impressao.
- `ui/`: componentes visuais pequenos e controlados.
- `infra/`: adaptadores de API, storage e migracao de workbook.

Responsabilidades por camada:

- Dominio nao deve importar React, browser APIs ou chamadas HTTP.
- Application pode usar React hooks, `fetchSheetRows`, storage e cancelamento de requests.
- UI deve receber props ja derivadas e emitir eventos sem conhecer persistencia/API.
- Infra deve normalizar dados externos e migrar versoes.

### 4.2 Estrutura Sugerida

```text
components/playground/
  domain/
    geometry.ts
    collision.ts
    feed-query.ts
    feed-fragments.ts
    workbook-model.ts
    cell-style.ts
  application/
    use-playground-workbook.ts
    use-playground-grid-viewport.ts
    use-playground-feed-data.ts
    use-playground-drag.ts
    use-playground-fragments.ts
    use-playground-print.ts
  ui/
    playground-toolbar.tsx
    playground-grid-canvas.tsx
    playground-feed-block.tsx
    playground-feed-header.tsx
    playground-feed-table.tsx
    playground-feed-menu.tsx
    playground-filter-popover.tsx
    playground-color-toolbar.tsx
  infra/
    playground-storage.ts
    playground-api.ts
    playground-migrations.ts
  types.ts
```

Nao e necessario criar todos os arquivos em uma unica entrega, mas a separacao final deve seguir esta direcao.

## 5. Modelo De Dados

### 5.1 Workbook

Evoluir o workbook para `version: 2`.

```ts
type PlaygroundWorkbook = {
  version: 2;
  activePageId: string;
  pages: PlaygroundPage[];
  preferences: PlaygroundPreferences;
};
```

### 5.2 Preferencias

```ts
type PlaygroundPreferences = {
  showGridLines: boolean;
  printMargin: "compact";
};
```

Default:

- `showGridLines: true`
- `printMargin: "compact"`

### 5.3 Pagina

```ts
type PlaygroundPage = {
  id: string;
  name: string;
  rowCount: number;
  colCount: number;
  cells: Record<string, PlaygroundCell>;
  rowHeights: Record<string, number>;
  columnWidths: Record<string, number>;
  hiddenRows: Record<string, boolean>;
  hiddenColumns: Record<string, boolean>;
  feeds: PlaygroundFeed[];
  updatedAt: string;
};
```

`cells` deve guardar apenas conteudo manual e estilos persistentes da planilha base. Dados de alimentadores nao devem mais ser materializados em `cells`.

### 5.4 Alimentador

```ts
type PlaygroundFeed = {
  id: string;
  table: SheetKey;
  title?: string;
  position: GridPosition;
  columns: string[];
  columnLabels: Record<string, string>;
  query: PlaygroundFeedQuery;
  displayColumnOverrides: Record<string, string>;
  fragments: PlaygroundFeedFragment[];
  renderedAt: string;
};
```

### 5.5 Fragmento

```ts
type PlaygroundFeedFragment = {
  id: string;
  parentFeedId: string;
  sourceColumn: string;
  valueLiteral: string;
  valueLabel: string;
  position: GridPosition;
  columns?: string[];
  columnLabels?: Record<string, string>;
  query: PlaygroundFeedQuery;
  displayColumnOverrides: Record<string, string>;
  renderedAt?: string;
};
```

### 5.6 Posicao E Tamanho

```ts
type GridPosition = {
  row: number;
  col: number;
};

type GridRect = {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
};
```

`rowSpan` deve considerar:

- 1 linha de header visual flutuante, quando visivel.
- 1 linha de indices/cabecalho da tabela.
- quantidade de linhas carregadas/paginadas do bloco.

Para colisao, usar o retangulo ocupado pelo bloco sem depender de hover.

### 5.7 Query Do Alimentador

```ts
type PlaygroundFeedQuery = {
  query: string;
  matchMode: "contains" | "exact" | "starts" | "ends";
  filters: GridFilters;
  sort: SortRule[];
  page: number;
  pageSize: number;
};
```

Default:

- `query: ""`
- `matchMode: "contains"`
- `filters: {}`
- `sort: []`
- `page: 1`
- `pageSize: 50`

## 6. Contrato De API

### 6.1 Listagem Por Alimentador

Reutilizar `fetchSheetRows` para cada alimentador/fragmento, enviando `filters` e `sort` proprios.

Necessario ajustar o backend para que os filtros de alimentador aceitem todas as colunas legiveis nao virtuais da tabela, nao apenas `searchableColumns`.

Regra proposta em `lib/api/grid-config.ts`:

- `filterableColumns`: default deve ser `readableColumns` sem colunas virtuais, sem colunas `__*` e sem colunas explicitamente excluidas.
- `sortableColumns`: manter default atual, com colunas visiveis e nao virtuais.

Manter a validacao por allowlist em `lib/api/grid/contract.ts`.

### 6.2 Facets Para Fragmentos E Filtros

Criar endpoint para valores distintos:

```text
GET /api/v1/grid/:table/facets?column=local&filters=...&query=...&matchMode=contains
```

Resposta:

```ts
type GridFacetPayload = {
  table: SheetKey;
  column: string;
  options: Array<{
    literal: string;
    label: string;
    count: number;
  }>;
};
```

Regras:

- Validar `column` contra `filterableColumns`.
- Aplicar filtros/query atuais do alimentador, exceto o filtro da propria coluna quando a facet for para editar aquela coluna.
- Ordenar por label com locale `pt-BR`, numeric true.
- Representar vazios com `literal: "VAZIO"` e `label: "(vazio)"`.

### 6.3 Exclusao De Fragmentos No Alimentador Pai

Para o pai esconder grupos que viraram fragmentos, suportar exclusao multipla.

Formato recomendado:

```ts
filters: {
  local: "EXCETO loja_3|loja_5"
}
```

Atualizar parser em:

- `components/ui-grid/front-grid.ts`
- `lib/api/grid/service.ts`
- testes de contrato/filtro

Se a coluna de fragmentacao ja tiver filtro proprio, combinar a regra com cuidado:

- Query do pai = filtros do pai + exclusao dos fragmentos ativos.
- Query do fragmento = filtros do pai + filtro `sourceColumn = valueLiteral` + filtros proprios do fragmento.

## 7. Layout E Interacao

### 7.1 Renderizacao Base

Trocar a estrutura de tabela pura por uma area com:

- Grid base para cabecalhos, linhas/colunas, celulas manuais e selecao.
- Overlay absoluto para blocos de alimentadores e fragmentos.
- Coordenadas derivadas de `rowHeights`, `columnWidths`, scroll e viewport.

O grid base deve continuar suportando:

- Selecao de celula, linha, coluna e pagina.
- Edicao de celula manual.
- Redimensionamento de linha/coluna.
- Ocultar/restaurar linhas e colunas.
- Pintura de celulas manuais.

### 7.2 Virtualizacao

Implementar virtualizacao simples por janela visivel:

- Calcular linhas/colunas visiveis pelo scroll e dimensoes acumuladas.
- Renderizar margem de overscan de 5 linhas e 3 colunas.
- Renderizar blocos de alimentador somente quando seu retangulo intersectar viewport + overscan.

Aceite:

- Scroll em pagina 300 x 52 nao deve renderizar 15.600 celulas simultaneamente.
- Arraste deve atualizar apenas transform visual enquanto o pointer esta ativo.

### 7.3 Drag De Alimentadores E Fragmentos

Fluxo:

1. Pointer down no header do bloco.
2. Guardar item ativo, origem, retangulo inicial e offset do ponteiro.
3. Durante pointer move, calcular coordenada candidata a partir do grid.
4. Aplicar `transform: translate(...)` no preview, sem persistir no workbook.
5. Mostrar estado visual se a posicao candidata colide.
6. No pointer up, resolver snap livre.
7. Persistir `position` final no feed/fragmento.

Regra de colisao:

- Dois blocos colidem se seus `GridRect` se sobrepoem.
- O item arrastado deve ignorar o proprio retangulo original.
- Candidatos fora dos limites da pagina devem ser rejeitados.
- Snap deve buscar primeiro perto da coordenada solta, expandindo em anel:
  - mesma linha/coluna,
  - depois vizinhos proximos,
  - depois linhas abaixo/acima,
  - mantendo distancia Manhattan minima.

Aceite:

- O usuario pode arrastar livremente e soltar em area vazia.
- Se soltar em area ocupada, o bloco encaixa no espaco livre mais proximo.
- Se nao houver espaco, retorna para origem e mostra erro.

### 7.4 Fragmentacao

Menu do alimentador:

- "Fragmentar por coluna"
- Escolher coluna.
- Carregar facets da coluna.
- Mostrar busca, selecionar valores, selecionar todos, desmarcar todos.
- Modo "todos exceto": cria fragmentos para todas as opcoes exceto as desmarcadas.
- Confirmar fragmentacao.

Ao confirmar:

- Criar um fragmento por valor selecionado.
- Cada fragmento recebe `query` propria com filtro `=valueLiteral`.
- Posicionar fragmentos em cascata/snap a partir do lado direito ou abaixo do pai.
- Pai passa a excluir valores fragmentados.

Header do fragmento:

- Titulo: `{tabela} - {coluna}: {valor}`
- Dropdown com atualizar, filtrar, ordenar, colunas, expandir FK, mover para pai, remover fragmento.

## 8. Filtros, Ordenacao E FK

### 8.1 Filtro Isolado

Cada alimentador e fragmento tem seu proprio estado de filtro.

Reutilizar conceitos de:

- `applyFrontFiltersAndSort`
- `buildColumnFilterOptions`
- popover fixo do `HolisticSheet`
- filtros do gerador de impressao

Como o processamento final sera servidor-side, o popover deve:

- Buscar facets via endpoint.
- Montar expressoes `=valor`, `valor1|valor2`, `VAZIO`, `!VAZIO`.
- Debounce de busca textual.
- Aplicar no `query.filters` do bloco.
- Resetar `query.page` para 1.
- Chamar reload apenas daquele bloco.

### 8.2 Ordenacao Isolada

Clique no cabecalho da coluna do bloco:

- sem Shift: alterna asc -> desc -> sem ordenacao apenas naquele bloco.
- com Shift: compoe sort chain apenas daquele bloco.

Nao deve afetar:

- grid base,
- outros alimentadores,
- outros fragmentos,
- alimentador pai, quando a acao ocorreu no fragmento.

### 8.3 Expansao FK

Usar `RELATION_BY_SHEET_COLUMN`, `buildRelationDisplayLookup` e `resolveDisplayValueFromLookup`.

No menu/header:

- Permitir "Expandir FK" para colunas relacionais.
- Abrir seletor de coluna da tabela relacionada.
- Persistir em `displayColumnOverrides` do bloco.

Para fragmentos:

- Se nao houver override proprio, herdar do pai.
- Se o usuario alterar no fragmento, o fragmento passa a ter override proprio.

## 9. UI E Design

### 9.1 Direcao Visual

O playground deve ser clean, minimalista e operacional.

Remover:

- Cards grandes aninhados.
- Gradientes decorativos pesados.
- Bordas arredondadas grandes.
- Banners permanentes que empurram o layout sem necessidade.

Preferir:

- Toolbar compacta.
- Icon buttons com texto somente quando necessario.
- Menus e popovers discretos.
- Headers de bloco finos.
- Linhas, bordas e sombras suaves.
- Densidade visual proxima de planilha.

### 9.2 Header De Alimentador/Fragmento

Comportamento:

- Oculto por default em operacao normal.
- Visivel quando mouse entra no bloco.
- Permanece visivel enquanto hover, focus dentro do bloco ou dropdown aberto.
- Some quando mouse/focus saem e menu esta fechado.

Conteudo:

- Handle de drag.
- Nome da tabela ou fragmento.
- Contador de linhas carregadas/total.
- Estado de atualizacao.
- Botao dropdown.

Dropdown:

- Atualizar.
- Filtrar.
- Ordenar.
- Colunas.
- Fragmentar.
- Expandir FK.
- Remover.

### 9.3 Linha Superior Do Bloco

Cada bloco deve renderizar:

- Cabecalho de colunas.
- Indice/linha top com botoes de filtro/ordenacao por coluna.
- Indicador de sort ativo.
- Indicador de filtro ativo.
- Indicador de FK expandida.

### 9.4 Toggle De Linhas De Grade

Adicionar controle em "Estrutura" ou "Visual":

- Label: "Linhas de grade"
- Estado persistido por workbook.
- Classe CSS no shell: `is-grid-lines-hidden`.

Quando desligado:

- Remover bordas internas do grid base.
- Manter bordas de selecao e bordas externas dos blocos.
- Alimentadores ainda devem ter separacao minima entre celulas para leitura.

### 9.5 UI De Cores

Trocar controles atuais por:

- Swatches predefinidos de fundo.
- Swatches predefinidos de texto.
- Input color compacto para cor customizada.
- Toggle de negrito.
- Botao aplicar.
- Botao limpar.
- Preview pequeno da combinacao.

Aplicacao:

- Celulas manuais: salvar em `page.cells`.
- Celulas de alimentador: salvar em estilo por chave estavel.

Modelo sugerido:

```ts
type PlaygroundFeedCellStyleKey = {
  feedId: string;
  fragmentId?: string;
  rowKey: string;
  column: string;
};
```

`rowKey` deve usar PK da tabela quando existir; fallback para indice apenas se nao houver PK disponivel.

## 10. Impressao

### 10.1 Playground

Atualizar `buildPrintDocument` ou mover para `use-playground-print.ts`.

Regras:

- `@page { margin: 4mm; }`
- `body { margin: 0; padding: 0; }`
- Header compacto.
- Tabela inicia proxima ao topo.
- Preservar cores com `print-color-adjust: exact`.
- Nao imprimir UI de toolbar/header flutuante.

### 10.2 Gerador De Impressao Principal

Atualizar `components/ui-grid/print-job.ts`:

- Reduzir `@page { margin: 8mm; }` para `@page { margin: 4mm; }`.
- Remover padding superior grande do body em print.
- Manter barra de acoes somente na tela; em print ela ja e oculta.
- Garantir que `.print-shell` nao crie margem extra.

Aceite:

- HTML capturado nos testes nao deve conter `body { padding: 56px 12px 12px; }`.
- Impressao deve manter indices de destaque e cores.

## 11. Performance

### 11.1 Reducao De Picos

- Nao atualizar workbook em cada pointer move.
- Usar refs para estado transitorio de drag/resize.
- Persistir em React somente no fim do gesto.
- Debounce de 250 ms em filtros/search.
- Cancelar request anterior com `AbortController` quando a query do bloco muda.
- Cachear payload por assinatura `{table, columns, filters, sort, page, pageSize, displayOverrides}`.
- Limitar refresh em massa a 3 requests simultaneos.
- Reaproveitar facets enquanto filtros base nao mudarem.

### 11.2 Render

- Separar componentes memoizados:
  - `PlaygroundGridCanvas`
  - `PlaygroundFeedBlock`
  - `PlaygroundFeedTable`
  - `PlaygroundFeedHeader`
- Evitar passar `activePage` inteiro para cada celula/bloco.
- Derivar arrays de linhas/colunas visiveis com memoizacao.
- Usar maps por id para feeds/fragments quando houver atualizacao pontual.

### 11.3 Storage

- Persistir workbook com debounce de 300 ms.
- Durante drag, nao salvar ate o drop.
- Migracao deve ser idempotente.

## 12. Migracao

Criar `migratePlaygroundWorkbook(raw): PlaygroundWorkbook`.

De v1 para v2:

- Preservar paginas, celulas manuais, linhas/colunas ocultas e dimensoes.
- Preservar feeds existentes com:
  - `position` a partir de `targetRow/targetCol`.
  - `query` default.
  - `displayColumnOverrides: {}`.
  - `fragments: []`.
- Remover de `page.cells` as celulas com `feedId`, porque dados vivos passam a vir do payload do alimentador.
- Adicionar `preferences`.

Compatibilidade:

- `loadPlaygroundWorkbook` deve aceitar v1 e v2.
- `savePlaygroundWorkbook` deve sempre gravar v2.
- Se houver workbook invalido, criar novo workbook v2.

## 13. Fases De Implementacao

### Fase 1 - Base De Dominio E Migracao

- [x] Criar tipos v2 em `components/playground/types.ts`.
- [x] Criar `domain/geometry.ts` com conversao de linha/coluna para pixel e retangulos.
- [x] Criar `domain/collision.ts` com overlap, bounds e snap livre.
- [x] Criar `domain/feed-query.ts` com merge de filtros pai/fragmento e exclusao de fragmentos.
- [x] Criar `domain/feed-fragments.ts` com criacao/remocao de fragmentos por facet.
- [x] Criar `infra/playground-migrations.ts`.
- [x] Atualizar storage para migrar v1 -> v2.
- [x] Adicionar testes unitarios de migracao, colisao e query.

### Fase 2 - API De Facets E Filtros Ampliados

- [x] Ajustar default de `filterableColumns` para colunas legiveis nao virtuais.
- [x] Adicionar suporte a `EXCETO valor1|valor2` no backend.
- [x] Adicionar suporte equivalente no front-grid.
- [x] Criar rota `GET /api/v1/grid/[table]/facets`.
- [x] Criar adapter `components/playground/infra/playground-api.ts`.
- [x] Testar facets, allowlist e exclusao multipla.

### Fase 3 - Feed Data Isolado

- [x] Criar `use-playground-feed-data`.
- [x] Implementar cache por assinatura de query.
- [x] Implementar cancelamento de requests obsoletos.
- [x] Implementar refresh individual por feed/fragmento.
- [x] Implementar refresh em massa com concorrencia limitada.
- [x] Remover dependencia de `renderFeedIntoPage` para dados vivos.
- [x] Manter `renderFeedIntoPage` somente temporariamente para migracao/testes legados ou remove-lo ao final.

### Fase 4 - Canvas, Virtualizacao E Blocos

- [x] Criar `PlaygroundGridCanvas`.
- [x] Implementar viewport virtualizado de linhas/colunas.
- [x] Criar overlay absoluto para blocos.
- [x] Criar `PlaygroundFeedBlock`.
- [x] Criar `PlaygroundFeedHeader`.
- [x] Substituir `PlaygroundFeedTable` por celulas reais projetadas no grid.
- [x] Remover sticky/scroll interno do bloco; alimentador acompanha o scroll unico do grid.
- [x] Garantir que blocos fora da viewport renderizem somente header/estado, sem corpo proprio.

### Fase 5 - Drag, Snap E Colisao

- [x] Criar `use-playground-drag`.
- [x] Usar Pointer Events no header/handle do bloco.
- [x] Renderizar preview via transform durante drag.
- [x] Resolver snap no drop.
- [x] Persistir nova posicao somente no drop.
- [x] Mostrar feedback visual de colisao/snap.
- [x] Cobrir E2E de arraste sem sobreposicao.

### Fase 5.1 - Area, Integracao Celular E Resize Vertical

- [x] Consolidar conceito de `Area` para alimentador e fragmento.
- [x] Criar dominio puro `playground-area`.
- [x] Calcular resize vertical por faixa de colunas, sem inserir/remover linhas globais.
- [x] Proteger estruturas horizontalmente paralelas fora da faixa afetada.
- [x] Detectar conflito quando uma area cruza a borda de resize.
- [x] Remover scroll proprio do alimentador.
- [x] Renderizar valores de alimentador como celulas resolvidas do grid.
- [x] Permitir selecao de celulas dentro dos alimentadores.
- [x] Criar preview holografico/pontilhado do `AreaResizePlan`.
- [x] Integrar aplicacao assistida do `AreaResizePlan` apos refresh de alimentador.
- [x] Expor escolha do usuario entre modo fixo e deslocamento por faixa.
- [x] Cobrir E2E: refresh com expansao, preview e aplicacao do ajuste vertical.

### Fase 6 - Fragmentacao Por Grupos

- [x] Criar menu "Fragmentar por coluna".
- [x] Buscar facets da coluna escolhida.
- [x] Permitir selecionar valores individuais.
- [ ] Permitir modo "todos exceto".
- [x] Criar fragmentos e posicionar via snap.
- [x] Fazer pai excluir valores fragmentados.
- [x] Permitir remover fragmento e devolver valor ao pai.
- [x] Permitir atualizar fragmento isoladamente.
- [x] Cobrir E2E: fragmentar por `local`, mover fragmento, remover fragmento.

### Fase 7 - Filtros, Ordenacao E FK Nos Blocos

- [x] Criar popover de filtro por coluna para feed/fragmento.
- [x] Implementar ordenacao isolada por alvo de alimentador/fragmento.
- [x] Mostrar indicadores de filtro/sort no cabecalho de coluna da area.
- [x] Posicionar botoes de filtro e ordenacao nos indices/top row do alimentador, semelhante ao RenderGrid principal.
- [x] Mostrar botoes de filtro/ordenacao somente no hover do indice da coluna da area.
- [x] Usar valores ja carregados do alimentador como fallback quando facets nao responderem JSON valido.
- [x] Cobrir E2E: selecionar celula alimentada, ordenar e filtrar coluna sem tocar no grid global.
- [x] Implementar expansao FK por bloco com `RELATION_BY_SHEET_COLUMN`.
- [x] Renderizar celulas alimentadas com FK expandida via `displayColumnOverrides`.
- [x] Herdar FK do pai no fragmento quando fragmento nao tiver override proprio.
- [x] Cobrir E2E: ordenar e filtrar fragmento sem alterar pai/outros blocos.

### Fase 8 - UI Visual, Grade E Cores

- [x] Reduzir visual do shell do playground.
- [ ] Remover card grande desnecessario ao redor da planilha.
- [x] Ajustar toolbar para grupos compactos.
- [x] Implementar header hover/focus/menu aberto.
- [x] Adicionar toggle "Linhas de grade".
- [x] Persistir preferencia `showGridLines`.
- [ ] Criar `PlaygroundColorToolbar`.
- [x] Implementar swatches e preview.
- [x] Aplicar cores em celulas manuais e celulas de alimentadores.
- [x] Remover scroll proprio dos alimentadores e renderizar valores como celulas do grid.
- [x] Corrigir camada do header hover do alimentador no topo da planilha.
- [x] Manter popover de filtro/ordenacao dentro do viewport.
- [x] Aplicar resize em lote quando a selecao cobre multiplas linhas/colunas ou toda a planilha.
- [x] Implementar auto-fit por duplo clique para colunas/linhas selecionadas, incluindo `All`.
- [x] Refatorar botao Feed em Hub de alimentadores com lista, detalhe e acoes por area.
- [x] Permitir renomear alimentador pelo Hub.
- [x] Permitir visualizar fragmentos no Hub e configurar colunas/labels por fragmento.
- [x] Aproximar menu `...` do titulo do alimentador/fragmento no header.
- [x] Mostrar indicador de filtros ativos junto ao titulo do alimentador/fragmento.
- [x] Adicionar dialogo de filtros ativos por alimentador/fragmento para limpar filtros isolados.
- [x] Cachear facets por alvo/coluna/query para reduzir chamadas repetidas ao abrir filtros.
- [ ] Cobrir E2E de aplicar e limpar cores.

### Fase 9 - Impressao

- [ ] Refatorar impressao do playground para `use-playground-print`.
- [x] Remover `body margin: 24px` do documento de impressao do playground.
- [x] Usar `@page { margin: 4mm; }` no playground.
- [ ] Ajustar `components/ui-grid/print-job.ts` para margem compacta.
- [ ] Atualizar testes E2E de captura de HTML de impressao.
- [ ] Validar cores/indices impressos.

### Fase 10 - Limpeza E Estabilizacao

- [ ] Remover codigo morto do antigo fluxo de `renderFeedIntoPage`.
- [ ] Quebrar `playground-workspace.tsx` em componentes/hook menores.
- [ ] Atualizar testes antigos de `grid-utils`.
- [ ] Rodar build.
- [ ] Rodar Playwright no fluxo de playground.
- [ ] Revisar acessibilidade basica de menus, headers e drag handles.

### Proximos Passos Consolidados

- [x] Fragmentacao por grupos de valores com criacao, movimento, filtro, sort e remocao por fragmento.
- [x] Suite E2E base para fragmentos com criacao, filtro, sort, movimento e remocao.
- [ ] Suite E2E complementar para fragmentos com FK expandida e resize estrutural em cadeia.
- [ ] Passada responsiva do Playground em mobile/tablet com foco em toolbar, popovers e drag handles.
- [ ] Perfil de performance com muitos alimentadores/fragmentos e virtualizacao em operacoes de resize/hover.
- [ ] Revisao final de impressao: cores, gridlines ocultas, alimentadores, FK expandida e margens compactas.

## 14. Testes Obrigatorios

### Unitarios

- [ ] `collision`: detecta sobreposicao.
- [ ] `collision`: encontra snap livre mais proximo.
- [ ] `collision`: rejeita posicao fora dos limites.
- [ ] `feed-query`: combina filtros do pai e fragmento.
- [ ] `feed-query`: pai exclui valores fragmentados.
- [ ] `feed-fragments`: cria fragmentos por valores selecionados.
- [ ] `feed-fragments`: remove fragmento e libera valor no pai.
- [ ] `migrations`: v1 para v2 preserva celulas manuais.
- [ ] `migrations`: v1 para v2 remove celulas com `feedId`.
- [ ] `cell-style`: normaliza/sanitiza cores.

### API

- [ ] contrato aceita filtro em coluna legivel nao virtual.
- [ ] contrato rejeita filtro em coluna nao permitida.
- [ ] contrato aceita `EXCETO valor1|valor2`.
- [ ] service aplica exclusao multipla corretamente.
- [ ] facets retorna literais, labels e contagens.
- [ ] facets respeita permissao de leitura.

### E2E

- [ ] criar alimentador.
- [ ] arrastar alimentador para area vazia.
- [ ] soltar alimentador em area ocupada e verificar snap.
- [ ] fragmentar por coluna `local`.
- [ ] mover fragmento sem mover pai.
- [ ] filtrar fragmento sem afetar pai.
- [ ] ordenar fragmento sem afetar pai.
- [ ] expandir FK no pai.
- [ ] expandir FK no fragmento.
- [ ] ocultar linhas de grade.
- [ ] aplicar cor em celula manual.
- [ ] aplicar cor em celula de alimentador.
- [ ] imprimir playground sem margem grande.

## 15. Comandos De Validacao

Executar conforme a fase alterada:

```powershell
npx vitest run components/playground/__tests__/grid-utils.test.ts
npx vitest run lib/api/grid/__tests__/contract.test.ts
npm run build
npm run test:e2e -- tests/e2e/ui-grid.spec.ts
```

Se forem criados novos testes especificos do playground, preferir:

```powershell
npx vitest run components/playground/__tests__
npx playwright test tests/e2e/playground.spec.ts
```

## 16. Criterios De Aceite Final

- Alimentadores e fragmentos podem ser arrastados sem sobreposicao.
- Fragmentos por grupo funcionam por coluna/valor e podem ser movidos individualmente.
- Filtros e ordenacao sao isolados por alimentador/fragmento.
- Expandir FK funciona no pai e nos fragmentos.
- Header aparece apenas em hover/focus/menu aberto.
- Grid pode ocultar linhas de grade.
- UI de cores esta compacta, clara e funcional.
- Impressao sai com margem compacta.
- Build passa.
- Testes unitarios e E2E principais passam.
- `playground-workspace.tsx` deixa de ser o centro de toda a logica e fica majoritariamente como composicao.

## 17. Riscos E Mitigacoes

- Risco: aumentar muito o contrato da API de grid.
  - Mitigacao: manter allowlist explicita e testes de rejeicao.
- Risco: drag com virtualizacao errar coordenadas em scroll.
  - Mitigacao: centralizar conversao pixel/grid em `domain/geometry.ts` e testar.
- Risco: filtros de pai e fragmento gerarem resultados duplicados.
  - Mitigacao: regra unica em `feed-query.ts` e testes para exclusao do pai.
- Risco: muitos fragmentos gerarem muitas requests.
  - Mitigacao: concorrencia limitada, cache e refresh sob demanda.
- Risco: migracao apagar dados manuais.
  - Mitigacao: remover apenas celulas com `feedId` e cobrir com teste unitario.

## 18. Ordem Recomendada De Execucao

1. Implementar dominio puro e migracao.
2. Ajustar API/facets.
3. Implementar data source isolado dos alimentadores.
4. Trocar renderizacao materializada por blocos overlay.
5. Implementar drag/snap.
6. Implementar fragmentos.
7. Implementar filtros, ordenacao e FK por bloco.
8. Refinar UI, cores e toggle de grade.
9. Corrigir impressao.
10. Remover legado e estabilizar testes.

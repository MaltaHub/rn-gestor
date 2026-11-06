# 2026-11-05 — Colunas estrangeiras no grid

## Pedido
"Na expansão recursiva de FKs, permitir adicionar colunas estrangeiras que funcionem normalmente
com filtros e tudo, inclusive com leitura avançada e escrita avançada."

## Como funciona
- Chave da coluna = caminho completo a partir de uma FK do sheet: `carro_id>chassi`,
  `carro_id>modelo_id>modelo` (mesmo motor de `core/relation-path`). Núcleo puro em
  `components/ui-grid/core/foreign-columns.ts` (+ testes).
- Entrada: popover do filtro de uma coluna FK → **+ Coluna estrangeira** → mesmo seletor de caminho
  do "Expandir PK" (entra em FKs quantos níveis quiser). Sai em **Remover coluna** no popover dela.
- Guardada no layout do sheet (`StoredSheetLayout.foreignColumns`, localStorage por usuário),
  junto com ordem/ocultas/fixada. Atualizadores de layout agora preservam campos (`...current`).
- **Materializada** no cliente: cada linha ganha `row[chave]` com o valor resolvido a partir do
  cache de relações (as tabelas do caminho são pré-carregadas). Por isso busca, filtros (opções
  e expressões), ordenação, impressão e o leitor avançado funcionam sem código especial.
- **Edição de célula**: grava na tabela de DESTINO (linha alcançada seguindo os saltos), via
  `upsertSheetRow` daquela tabela (com contexto de preço quando for carros/preço), otimista no
  cache de relações + refresh. Editável só se o papel escreve na tabela de destino e a coluna é
  editável lá (o servidor revalida tudo — nada novo é aceito do cliente).
- **Escrita avançada**: `components/ui-grid/foreign-bulk.ts` casa o CSV com as linhas carregadas
  pela chave escolhida (pode ser estrangeira, ex.: `carro_id>placa`) e distribui: colunas locais →
  bulk da própria tabela casando pelo PK; estrangeiras → bulk da tabela de destino casando pela
  chave da FK. Só atualiza (sem correspondência = erro).
- Servidor (`lib/api/grid/bulk.ts`): chave de correspondência NÃO editável (ex.: `id`) agora vale
  para casar — nunca é gravada e não gera INSERT (sem registro = erro). Teste em
  `lib/api/grid/__tests__/bulk.test.ts`.

## Limites conhecidos
- Coerção de tipo na escrita avançada usa as regras do sheet ativo (valor estrangeiro vai como
  texto; o Postgres converte números; datas devem vir em ISO).
- Alteração em massa segue só para colunas da própria tabela.
- `carros.estado_venda` é só leitura como coluna estrangeira (a venda tem fluxo próprio no grid de carros).

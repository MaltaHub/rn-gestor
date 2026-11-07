# 2026-11-07 — Forms padronizados, layout global sem rolagem e Home com duas barras

## Pedido
- Reaproveitar e remover os restos do Codex.
- Refatoração completa até do layout global: sem rolagem da página; o grid desce até o rodapé.
- Home com uma 2ª barra (diferente da 1ª): busca, filtros, [Seleção | Modo editor], [Imprimir |
  Recarregar]; no desktop tudo à vista, no celular uma barra só com o essencial e o resto escondido.
  "Abrir tabela ao lado" era redundante com o modo editor; "Recalcular repetidos" não é usado — apagar.
- Padronizar TODOS os forms flutuantes: registro (modelos, locais…), confirmação (no lugar dos
  alertas do navegador), listas (filtro de coluna e afins) e descrição (contexto de alteração de
  preço). Mesmo componente, com invocações especiais nos casos extraordinários (ex.: CARROS com busca
  de placa e criação de modelo). Foco preso e recursividade: form aberto a partir de outro fica na
  frente, até a cadeia terminar. Visual do seletor de coluna do OCR.
- A Home deixou de lembrar colunas ocultas/fixadas depois do "adicionar coluna".
- Os botões de documento do form não abriam a pasta.

## O que mudou
- **Codex:** AGENTS.md fundido no CLAUDE.md; scanner de segredos portado (`scripts/check-secrets.mjs`,
  roda no CI); plugin, `.agents/`, `.engineering-quality.yaml`, tool registry e portão de refactor por
  PR removidos; `docs/project-control/work-records` → `docs/work-records`.
- **Casca única** `components/ui/dialog/focus-dialog.tsx` + pilha global (`dialog-stack.ts`): foco preso,
  Esc fecha só o do topo, foco volta para quem abriu, z-index por ordem de abertura.
  - Confirmação/texto: `confirmDialog`, `promptDialog`, `alertDialog`, `copyDialog` (host no layout
    raiz). Todos os `window.confirm/alert/prompt` do app saíram (grid, atalhos, admin, playground,
    vendedor, Word).
  - Listas: `ChoiceList`/`ChoiceListDialog` (busca, setas/Enter). O `HolisticChooserDialog` virou
    chamada a ele (expansão de FK, colunas ocultas, seleção, filtros ativos). Popovers de lista
    (filtro de coluna, filtro da impressão, filtro âncora) com `popover.module.css`.
  - Descrição: `DescriptionDialog` (contexto de alteração de preço).
  - Registro: `components/ui-grid/record-form-dialog.tsx` (antes `related-record-creator`), recursivo;
    CARROS é a exceção (busca de placa + modelo digitado com "+"). O "+ modelo" e o "+ característica"
    do form de carros passaram a usá-lo.
  - O form principal (Novo/Editar/Inserir em massa) virou flutuante na mesma casca: Confirmar/Marcar/Mais
    no cabeçalho, anterior/próximo no modo editor, Salvar no rodapé; fechar com campo alterado pergunta
    antes de descartar. O painel lateral, o divisor e a "tabela ao lado" saíram.
  - Convertidos para a casca: avisos, contexto/histórico de preço, insights do anúncio, alteração em
    massa, selecionar por lista, CSV, venda, conflito de venda, coluna de outra tabela, impressão
    (exceção de duas colunas), envelopes, post-its, diálogos de Arquivos (via `Dialog` do explorer),
    CRLV, classificar documento, compartilhar fotos, templates do Word, concluir venda e os três do
    Playground.
- **Layout global:** `components/workspace/app-frame.tsx` (cabeçalho + conteúdo do tamanho da tela, sem
  rolagem da página) em Home, Arquivos, Playground, Perfil e Usuários; cabeçalho global novo em CSS
  module (uma linha também no celular).
- **Home:** barra 1 (tabela e registros) + barra 2 `GridToolsBar` presa ao topo do grid, com grupos
  encostados; no celular, uma barra só (busca, Novo, Filtros e Editor à vista; o resto no "Mais").
  "Recalcular repetidos" removido (UI, cliente e `POST /api/v1/repetidos/rebuild`); os triggers do
  banco já mantêm as projeções — as funções SQL ficaram.
- **Bug do layout:** o saneamento de ocultas/fixada/ordem rodava com o header ainda vazio (só as colunas
  estrangeiras "existiam") e gravava por cima do salvo. Agora só saneia com o schema real carregado.
- **Bug dos documentos:** o explorer lia `?carro=`/`?pasta=` no 1º render, quando a navegação interna do
  Next ainda não atualizou a URL — caía na raiz. Agora lê num efeito.
- **Retoque:** grid com cabeçalho mais leve, linhas um pouco mais baixas, divisórias finas, hover suave,
  controles do cabeçalho discretos; frame ocupa a largura toda (o `scrollbar-gutter` e uma regra antiga
  de `align-items` faziam a área crescer até a largura da tabela e cortar as barras).
- CSS morto removido do `globals.css`/`vendedor.css` (cascas antigas, popovers, sidebar).

## Verificação
- tsc, eslint, vitest; E2E com os testes do layout antigo reescritos (form flutuante, sem rolagem
  global, anterior/próximo, descarte com confirmação, celular em uma barra).
- Reproduções no navegador: layout salvo após recarregar com coluna estrangeira; atalho de documento
  faltando abre "Arquivos › Documentos › <placa>"; documento existente abre o PDF (200).

## Riscos e rollback
- O form principal deixou de ficar ao lado do grid (agora é flutuante, com anterior/próximo).
- Visualizadores de imagem/PDF (Arquivos e galeria) não são forms e continuam como estão.

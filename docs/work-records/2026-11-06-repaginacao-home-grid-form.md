# 2026-11-06 — Repaginação da Home, das tabelas e dos forms (padrão da aba Arquivos)

## Pedido
"Repaginação completa do Design da Home junto com as Tabelas e Forms para melhor otimização de
consumo de dados, menos atrito cognitivo e mais otimização de layout (sem sobreposições, sem cortes,
botões que expandem opções avançadas ao invés de vários botões poluindo o layout), removendo botões,
divs, textos e funções redundantes, seguindo o design clean da aba Arquivos."

## O que mudou
- **Barra única do grid** (`components/ui-grid/grid-command-bar.tsx` + `.module.css`, tokens do
  explorer): tabela ativa, busca (com contém/igual/começa/termina), ações da seleção (só aparecem com
  linha selecionada), Avisos (só com contagem > 0), **Novo** e o resto em **Mais**. Paginação compacta
  (setas só com mais de uma página). Substitui as 4 faixas antigas: título + toolbox de ícones +
  faixa de status + painel de busca. O selo "HOME" duplicado do cabeçalho virou `sr-only`.
- **Cabeçalho de painel** (`FormCommandBar`, no mesmo arquivo): form de edição/inserção, inserção em
  massa e "tabela ao lado". No form ficam visíveis só **Confirmar** (quando há confirmação pendente),
  **Marcar** (no modo conferência), **Salvar** e fechar; Pasta de documentos, Registrar venda,
  Disponibilizar, Cancelar venda e Excluir foram para **Mais**. A aba "Formulario: X" só aparece
  quando há dois painéis.
- **Gaveta de tabelas** (`tables-drawer.tsx` + `.module.css`): lista compacta no desenho da árvore do
  Arquivos (nome, contagem de avisos, cadeado se for só leitura), filtro por nome, Esc fecha; a
  descrição virou dica. Renderizada em portal — a antiga ficava presa no contexto de empilhamento do
  layout e o topo sumia atrás do cabeçalho do app.
- **Form cortado à direita**: `.sheet-form-panel-shell` não tinha coluna definida e o conteúdo
  alargava a grid (610 px num painel de 511). Agora `grid-template-columns: minmax(0, 1fr)`.
- **FK legível por padrão** (`DEFAULT_RELATION_DISPLAY_COLUMN` em `core/grid-rules.ts`): sem escolha
  salva, `modelo_id` mostra o modelo, `carro_id` a placa, `remetente_id` o nome etc. (antes: UUID
  cru). O storage guarda só a escolha do usuário; o padrão é aplicado na leitura.
- **Consumo de dados**: `ensureRelationLoaded` reaproveita a busca em andamento (mapa de promessas +
  cópia do cache em ref para closures velhas). Abertura da Home: **62 → 19** requisições `/api` no
  dev (os pares restantes são o StrictMode do dev rodando efeitos duas vezes).
- **CSS morto**: 87 classes `sheet-*`/`workspace-*` sem uso em código saíram do `app/globals.css`
  (−1.778 linhas; 261 regras removidas, 23 seletores podados) — sidebar, topbar, status-row,
  toolbox, compact-menu, auth antigo, child-grid etc.

- **Anos sem separador** (`value-format.ts`): `ano_fab`/`ano_mod`/`ano_ipva_pago`, `*_numero` e
  `codigo*` saíam como "2.022"; agora "2022". Quantidades (hodômetro) seguem com separador.
- **Specs visuais**: `grid-toolbox`, `grid-header-responsive` e `grid-mobile` testavam o layout
  antigo (toolbox, 2 faixas) → trocados por `visual/grid-command-bar.spec.ts` (nada cortado, sem
  rolagem horizontal, menus dentro da tela em 1440/1024/390; gaveta acima do cabeçalho).
  `arquivos-flows` mockava a API antiga de pastas (o explorer usa `/files/index` desde 04/11) e foi
  removido — `files.spec.ts` cobre o explorer. Referências visuais (de maio) regeradas; a fixture
  `CARROS_FIXTURE` ganhou `header` (sem ele o snapshot "com dados" saía vazio e passava porque a
  diferença ficava abaixo de 1%).

## Verificação
- tsc, eslint, vitest (652).
- Capturas em 1440/1280/1024/390: barra e cabeçalho do form sem corte e sem rolagem horizontal;
  menus abrem para o lado que cabe (no celular o "Mais" do form abre para a direita).
- E2E `ui-grid` atualizado: helper `menuItem()` abre o "Mais" quando o item mora lá; layouts mobile
  medidos na barra nova; expectativas de FK legível por padrão; testes que ainda citavam
  `carros.nome` (setas, placeholder do vendedor, form mobile) corrigidos.

## Pendente / próximos
- Faxina da estrutura de pastas (pedido do Kaic para depois da repaginação).

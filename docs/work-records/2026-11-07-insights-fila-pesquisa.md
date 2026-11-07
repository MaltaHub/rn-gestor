# 2026-11-07 — Insights: botão único com Fila e Pesquisa

## Pedido
"Na página antiga tinha dois botões de insights, e agora tem apenas um, mas quando estou na tabela de
anúncios, eu preciso clicar no veículo para o insight aparecer." O botão deve agrupar tudo, com dois
modos: **Fila** (card por insight com o número de ocorrências; o card descreve a 1ª; resolveu, sai e
o card passa ao próximo caso — ex.: preços divergentes) e **Pesquisa** (busca pela placa → placas
com insight → insights da placa). Nos dois, a última etapa rola até a linha; nada aparece sem
ocorrência.

## O que mudou
- `lib/domain/grid-insights.ts` (puro): ocorrências = 1 problema × 1 linha, a partir das linhas já
  carregadas (anúncios pelos campos `__insight_*` de cada linha, documentos pelas flags, carros/
  vendas pela pendência de compliance). `groupInsightsByKey` (fila) e `groupInsightsByPlate`
  (pesquisa).
- `components/ui-grid/insights/insights-dialog.tsx`: painel único na casca `FocusDialog`; modo
  lembrado no navegador; card com caso da vez, ‹ › para olhar os outros casos, "Selecionar N" (ações
  em massa) e, em anúncios, "Marcar verificado".
- `holistic-sheet`: saem o botão/diálogo "Insights do anúncio" (`useGridAnuncioInsights` e
  `anuncio-insights-display.ts` apagados) e o diálogo "Avisos"; "ir para a linha" acha a página,
  rola, seleciona e pisca a linha (mostra tudo antes se filtro/busca a escondem).

## Verificação
- Unitário `grid-insights.test.ts`; e2e `visual/grid-insights.spec.ts` (fila → linha, pesquisa →
  placa → linha, busca vazia, selecionar). CI na nuvem.

## Riscos e rollback
- Só cliente; sem mudança de API/banco. Rollback = reverter o commit.
- A rota de insights por anúncio (`/api/v1/anuncios/:id/...`) ficou sem uso no grid; não foi removida.

# Plano de Consolidacao + Testes (Playwright)

## Objetivo
Consolidar a aplicacao como produto unico (design + funcional + logica) com validacao automatizada de fluxo operacional no `ui_grid`.

## Pilares de qualidade
1. Design: visual limpo, baixa poluicao de botoes, foco em icones e hierarquia discreta.
2. Funcional: interacao de planilha real (filtro, ordenacao, selecao, edicao, lote, navegacao).
3. Logico: operacoes refletidas no backend (`upsert`, `delete`, `finalizar`, `rebuild`) sem divergencia de estado.

## Estrategia de consolidacao
1. Base visual minimalista:
   - Toolbar de acao iconica com `aria-label`.
   - Estados discretos (hover, selected, warning, repeated, sold).
   - Priorizar dados sobre chrome visual.
2. Contrato unico do grid:
   - `GET/POST /api/v1/grid/:table`
   - `DELETE /api/v1/grid/:table/:id`
   - Operacoes de dominio: `/finalizados/:id`, `/repetidos/rebuild`.
3. Persistencia UX state:
   - Filtros, sort e largura de colunas por sheet em `localStorage`.
4. Hardening:
   - Fila de persistencia para mutacoes de celula/lote.
   - Auditoria em backend para mutacoes criticas.

## Plano de testes Playwright
1. Suite `ui-grid.spec.ts` (E2E com mocks de API controlados).
2. Casos cobertos:
   - Render minimalista + troca de sheet.
   - Edicao inline com persistencia apos recarga.
   - Insercao e remocao de linha.
   - Finalizacao de carro e reflexo de estado.
   - Rebuild de repetidos.
3. Gate de qualidade:
   - `npm run build`
   - `npm run test:e2e`

## Expansoes recomendadas
1. Adicionar projeto mobile no Playwright para validar pointer-coarse.
2. Adicionar testes de clipboard range (copy/paste bloco 2x2).
3. Adicionar testes visuais por screenshot para regressao de estilo.
4. Integrar suite em CI (Vercel/Actions) com bloqueio de merge por falha.

# 2026-07-07 — info_confirmada vira tupla (campos/chave_manual) + botão Vender (ADMIN)

## O que mudou

### Banco (migration `20260707143932_carros_info_confirmada_tupla`, aplicada no remoto)

- `carros.info_confirmada`: **boolean → jsonb** `{"campos": bool, "chave_manual": bool}`.
  - Conversão in-place: `campos` herdou o boolean antigo; `chave_manual` nasceu `false`
    para todos (66 carros ficaram `{campos:true, chave_manual:false}`, 124 tudo false).
  - Default de insert: `{"campos": false, "chave_manual": false}`.
- Trigger `fn_carros_info_confirmada_gate` (BEFORE ins/upd):
  - `campos`: zera se faltar campo importante (ano_mod, chassi, renavam, hodometro,
    modelo_id) — regra antiga preservada.
  - `chave_manual`: **zera quando `tem_chave_r` ou `tem_manual` mudam** (IS DISTINCT FROM).
  - Sempre reescreve a tupla normalizada (tolera shape inválido).
- RPC `fn_carros_confirmar_info(p_carro_id uuid, p_alvo text default 'campos')`:
  - assinatura antiga `(uuid)` dropada; o default `'campos'` mantém o código antigo
    funcionando na janela de deploy (não precisa de migration de contract).
  - `campos` incompleto → `CARRO_INFO_INCOMPLETA` (23514 → rota devolve 409).
  - **Hardening novo:** `revoke execute from public/anon/authenticated` +
    `grant to service_role` (a função antiga era executável por PUBLIC).
- Verificado direto no remoto: confirmação por alvo, reset por mudança de
  `tem_chave_r`, e rejeição de campos incompletos (23514). Estado do carro de teste
  restaurado.

### Histórico de schema

- Recriado o `.sql` órfão `20260701192629_fn_carros_confirmar_info.sql` (estava
  aplicado no remoto desde 2026-07-01 mas nunca entrou no git — conteúdo extraído
  via `pg_get_functiondef`).

### App

- `lib/domain/compliance.ts`: `CarroInfoConfirmada`, `parseCarroInfoConfirmada`
  (tolera boolean legado dos mocks: vale só para `campos`) e `rowHasPendencia` de
  carros agora exige **as duas posições true** para sair da fonte amarela.
- Rota `POST /api/v1/carros/[id]/confirmar-info`: body `{ alvo: "campos" | "chave_manual" }`
  validado (400 `CARRO_CONFIRMAR_ALVO_INVALIDO` se inválido). RBAC segue SECRETARIO+.
- `holistic-sheet.tsx`:
  - Botão "Confirmar informações" virou **menu dropdown** (`<details>`, classes
    `sheet-compact-menu*` reaproveitadas) com as duas confirmações; cada item mostra
    ✓ quando já confirmado. "Campos importantes" continua bloqueado enquanto faltar
    campo; "Chave e manual" confirma direto. Ambos salvam o form antes (mesmo fluxo
    `confirmAfterSaveRef`, agora carregando o alvo).
  - **Botão "Vender" de volta no form de carros** (`data-testid="form-vender"`),
    **ADMINISTRADOR-only** (`canVenderCarro`), abre o fluxo de registro de venda
    (`requestVendaCreationFlow` → venda dialog, com conflito tratado).
  - Código morto removido: `handleFinalizeSelected` (batch "Finalizar selecionado",
    sem call site desde Stage 5) e `runFinalize` do `components/ui-grid/api.ts`
    (a rota `/api/v1/finalizados/[id]` segue viva — `erp-console.tsx` usa).

### Testes

- `compliance.test.ts`: tupla (4 combinações) + parser (legado/lixo).
- e2e `ui-grid.spec.ts`: teste do venda-dialog revivido (`form-finalize` →
  `form-vender`, forma_pagamento atualizada p/ "financiamento"); teste novo do menu
  Confirmar (mock de `confirmar-info` no beforeEach); teste do batch removido de vez.

## Por quê

Pedido do dono: ação rápida de "vendido" para o admin, e confirmação de veículo em
duas dimensões independentes — dados cadastrais e itens físicos (chave reserva +
manual) — com re-confirmação forçada quando chave/manual mudam.

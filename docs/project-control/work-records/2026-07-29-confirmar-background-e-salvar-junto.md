# 2026-07-29 — menu "Confirmar" de CARROS: roda em background e salva junto

## O que mudou

Nada de banco/schema — só app + testes. Duas queixas do dono, mesmo botão:

### 1. Confirmar não pode se perder quando o form fecha

`submitInsertForm` (`components/ui-grid/holistic-sheet.tsx`) tinha um
`if (submitRequestId !== formOpenRequestRef.current) return;` **antes** do bloco de
confirmação. Fechar o form (ou abrir outro veículo) enquanto o save estava em voo
incrementa esse ref → o save ia até o fim, mas a chamada de `confirmar-info` era
descartada: o veículo continuava não confirmado, sem aviso nenhum.

- O early-return virou `formStillOpen()` (helper local) aplicado **só ao que mexe na
  UI do form** (repopular valores, `form-info`, dialogs de estado_venda/PRONTO).
- A confirmação agora roda sempre até o fim. Com o form fechado, o feedback migra
  para o `flowToast` (sucesso e erro) em vez de sumir.
- Mesmo tratamento no `catch` do submit: falha de save com o form já fechado vira
  toast de erro ("Alteração não salva" / "Confirmação não concluída") em vez de
  silêncio.
- `closeFormPanel` zera `formSubmitting` (o botão ficava travado em "Salvando..."
  porque o `finally` ignora o form fechado).

### 2. Confirmar = um segundo "Salvar alterações"

O menu só aparecia com base na tupla **salva**. Como o trigger do banco zera
`chave_manual` quando `tem_chave_r`/`tem_manual` mudam, alterar a chave num veículo
já confirmado escondia o menu — era preciso salvar primeiro (pra tupla cair) e só
então confirmar. Dois passos pra uma coisa só.

- `lib/domain/compliance.ts` ganhou `CARRO_CHAVE_MANUAL_FIELDS`,
  `hasCarroChaveManualChange(savedRow, pendingRow)` (comparação `?? null` dos dois
  lados, espelhando o `is distinct from` do trigger) e
  `projectCarroInfoConfirmada({ saved, missingImportantFields, chaveManualChanged })`.
- O menu passa a olhar a **tupla projetada** (como ela vai ficar depois de salvar o
  form como está): visibilidade, `disabled` e o ✓ de cada item. Alterou a chave? O
  item reabre na hora, e um clique salva **e** confirma (a ordem save → confirm já
  existia, então o trigger zera e a RPC reconfirma em seguida).
- Projeção nunca confirma sozinha — só derruba. Salvar sem confirmar continua
  removendo a confirmação (é o trigger).

## Testes

- `compliance.test.ts`: `hasCarroChaveManualChange` (null/ausente iguais, campo fora
  do form não conta) e `projectCarroInfoConfirmada` (4 cenários).
- e2e `ui-grid.spec.ts`:
  - fixture: `formColumns` de carros (chave/manual só no **form**, header do grid
    intacto), `car-3` já confirmado em chave/manual, e o mock de update passou a
    espelhar o trigger (`applyCarroInfoConfirmadaGate`) — sem isso o mock não
    reproduzia o motivo do bug.
  - teste novo "salva e confirma junto (sem salvar antes)": desmarcar a chave reabre
    o item na hora; um clique salva (`tem_chave_r: false` no payload) e confirma.
  - teste novo "confirmacao continua em background": save atrasado 700ms, form
    fechado no meio → `confirmar-info` ainda é chamado e o toast aparece. Verificado
    que ele falha com o early-return antigo.
- Suíte completa: 484 unit ok; e2e ui-grid com 7 falhas **pré-existentes**
  (impressão/bulk), idênticas no HEAD limpo.

## Por quê

Pedido do dono: "o confirmar tem que funcionar em background" (fechava o form e não
salvava) e "não é prático ter que salvar antes pra depois confirmar".

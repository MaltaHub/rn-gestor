# 2026-11-07 — OCR da nota fiscal de entrada: destinos, fornecedor e código da nota

## Pedido
- "O picker de registro dos campos do OCR está limitado a 3 tabelas, mas eu preciso de todas" — para
  montar o template da nota fiscal de entrada.
- Campo novo em Carros, `codigo_nota_fiscal`, para o OCR conferir o código da nota com o da tabela.
  Único, sempre caixa alta, sempre no formato `O21_1_2026_5890` (1º trecho alfanumérico).

## O que mudou
- **Picker:** as abas de tabela rolavam na horizontal com a barra escondida — só 3 apareciam. Agora
  quebram em linhas, com a explicação de onde cada tabela grava.
- **Fornecedor (remetentes)** entra no catálogo do OCR (vínculo `fornecedor`, por
  `documentos.remetente_id`): acha pelo CPF/CNPJ, senão o já ligado ao veículo, senão pelo nome;
  cadastra se não existir e liga ao veículo. Fornecedor existente é compartilhado: só campos VAZIOS
  são preenchidos. Regra pura em `lib/domain/ocr/fornecedor.ts`.
- **Banco** (aplicado no remoto e registrado em `schema_migrations`):
  - `20261107150000_carros_codigo_nota_fiscal.sql` — coluna `text` opcional;
  - `20261107151000_carros_codigo_nota_fiscal_unico.sql` — índice único em `upper(btrim(..))`, vazio
    não conta;
  - `20261107152000_..._caixa_alta.sql` e `20261107153000_..._formato.sql` — regras intermediárias,
    substituídas por `20261107154000_..._formato_alfanumerico.sql` (`^[A-Z0-9]+_[0-9]+_[0-9]{4}_[0-9]+$`).
- **Código:** regra única em `lib/domain/carros/codigo-nota-fiscal.ts` (formato, normalização,
  comparação tolerante a O/0 e separadores), usada pelo serviço de carros (400 com exemplo; 409
  quando repetido), pelo form (caixa alta e exemplo no campo) e pelo OCR.
- **OCR:** destino `carros.codigo_nota_fiscal` (grava), trava `check.codigo_nota_fiscal` (o valor
  lido precisa ser o do veículo; sem código cadastrado, recusa) e âncora "Código da nota fiscal do
  veículo" (o documento precisa conter o código).

## Verificação
- Unitários: `codigo-nota-fiscal`, `fornecedor` (decisão + catálogo), suíte de domínio inteira (315).
- tsc/eslint; CI e E2E na nuvem.
- Banco: constraint e índice conferidos por consulta só leitura; coluna vazia (0 linhas).

## Riscos e rollback
- Coluna nova e opcional (expand). Rollback: `drop constraint`/`drop index`/`drop column` em migration
  nova (nada no app depende de valores já gravados).
- Finalização (`fn_finalizar_veiculo`) ainda não copia o código para `finalizados` — decidir se vai
  para `nota_entrada_numero`.

## Pendente
- Regra de Documentos (VIRADO só com responsável) e o novo painel de Insights (fila/pesquisa).

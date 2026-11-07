# 2026-11-07 — Titular do CRLV VIRADO vira cadastro (responsavel_virado_id)

## Pedido
"O OCR também [deve] ser capaz de identificar o CNPJ do CRLV, mas para registrar precisa remover os
caracteres e deixar apenas o número, pois o número do CNPJ ou CPF que estiver no CRLV deverá ser
vinculado ao responsavel_virado ... agora deve mudar para responsavel_virado_id ... o cnpj ou cpf
deve ser ou a PK ou SK ... se o responsável não estiver cadastrado, o form de cadastro deve abrir
... os dados obrigatórios do responsavel_virado deverá ser nome e cnpj/cpf!"

Decisões do Kaic: CPF/CNPJ dos 5 titulares atuais informados por ele; CRLV VIRADO **só vira com o
titular** — a mecânica de identificar/registrar o titular é ligada no OCR pelo próprio usuário (o
arquivo classificado sozinho não vira mais). Finalização NÃO copia o código da nota.

## O que mudou
- **Banco** — `20261107170000_responsaveis_virado.sql` (aplicada; expand):
  - `responsaveis_virado` (id uuid PK; `nome` e `cpf_cnpj` obrigatórios; CPF/CNPJ só dígitos, com
    dígito verificador — `fn_cpf_cnpj_valido` — e índice único = chave secundária). Trigger
    normaliza (caixa alta / só dígitos) e barra com `REGRA:` (sem nome, sem documento, inválido,
    repetido). RLS ligado sem políticas; backup webhook ligado.
  - Os 5 titulares em uso cadastrados; `documentos.responsavel_virado_id` (FK, `on delete
    restrict`) e os 98 VIRADO ligados pelo nome.
  - `fn_documentos_normaliza_crlv`: titular pelo id (informar ⇒ VIRADO; VIRADO sem titular ⇒
    REGRA; outra situação ⇒ sem titular). Texto antigo vira espelho do nome; escrita de texto
    (código velho) é traduzida para o cadastro (nome não cadastrado ⇒ REGRA).
  - `fn_documentos_reparse_carro`: CRLV VIRADO classificado não sobe mais a situação.
- **App:** tabela nova no grid ("RESPONSÁVEIS (CRLV)", Catálogos; SECRETARIO grava); Documentos
  usa `responsavel_virado_id` (lista + "+" abre o cadastro). OCR: destino "CPF/CNPJ (titular do
  CRLV virado)" grava só números, acha e liga o titular; não cadastrado ⇒ abre o form de cadastro
  já com o CPF/CNPJ (e o nome, se lido) e grava de novo. O picker abre nessa tabela em templates de
  CRLV VIRADO.
- Corrigido junto: a caixa alta do `codigo_nota_fiscal` no form estava no mapa de autocompletar.
- Backup `.gs`: colunas novas (`carros.codigo_nota_fiscal`, `documentos.responsavel_virado_id`) e a
  tabela `responsaveis_virado` — **precisa reimplantar o Apps Script**.

## Verificação
- Simulação revertida antes de aplicar (9 casos: virar sem titular, titular vira, apagar titular,
  outra situação, texto legado, nome não cadastrado, CPF inválido, CPF repetido, normalização).
- Pós-aplicação: 5 titulares, 98/98 VIRADO ligados. Unitários (catálogo/destino do titular), suíte
  de lib/components (657), tsc/eslint; CI e E2E na nuvem.

## Riscos e rollback
- Expand: o texto `responsavel_virado` continua preenchido (espelho). Rollback do app = reverter o
  commit; o banco segue compatível com o código antigo (texto traduzido para o cadastro).
- **Contract (pendente, migration separada):** apagar `documentos.responsavel_virado` e a tradução
  de texto do trigger, depois do deploy e do `.gs` reimplantado.

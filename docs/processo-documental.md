# Processo documental e administrativo do veículo

Loja de veículos usados: o que importa para comprar, regularizar e vender um carro.
Este documento é a referência de **onde cada dado mora** e **qual arquivo registra o quê**.

## Os 4 eixos (+ perícia)

| Etapa | Documento (tipo na pasta) | O que registra | Onde |
|---|---|---|---|
| Compra | **Nota fiscal de entrada** (`nota_entrada`) | cria a nota de ENTRADA ligada ao arquivo | `notas_fiscais` |
| Compra | **CRLV BRANCO** (`crlv_branco`) | situação do CRLV = BRANCO (ainda no nome do antigo dono) | `documentos.estado_transferencia` |
| Compra | **Perícia** (`pericia`) | cria a perícia ligada ao arquivo | `pericias` |
| Transferência | **CRLV VIRADO** (`crlv_virado`) | situação do CRLV = VIRADO | `documentos.estado_transferencia` |
| Venda | **Nota fiscal de saída** (`nota_saida`) | cria a nota de SAÍDA ligada ao arquivo | `notas_fiscais` |

Os demais tipos (Procuração, ATPV, Pesquisa, Recibo de venda, Termo de entrega, Comp. endereço,
Identidade do consumidor final) **só arquivam**.

Fonte do catálogo: `components/files/document-slots.ts` (`DOCUMENT_TYPES`). O banco reconhece o
tipo pelo **token no nome do arquivo** (`<tipo>_<placa>.<ext>`, ex.: `crlv_virado_abc1d23.pdf`)
em `fn_documentos_parse_token` / `fn_documentos_reparse_carro` (trigger em `arquivos_arquivos`).
Automação pausada na pasta = o banco não registra nada a partir dos arquivos.

## Onde cada dado mora

**`carros`** — identidade do veículo: placa, chassi, renavam, **crv** (número do CRV atual — muda
quando o carro é virado) e **crv_codigo_seguranca** (usado para emitir a ATPV-e).

**`documentos`** (1 linha por veículo) — o processo:
- Compra: `origem` (COMPRA/TROCA), `remetente_id` (**fornecedor** — tabela `remetentes`, exibida
  como "Fornecedores"), `valor_compra`.
- CRLV: `estado_transferencia` = situação do CRLV
  - `AGUARDANDO` — o documento ainda não chegou (padrão);
  - `BRANCO` — chegou, ainda no nome do antigo dono (inclui o caso com procuração);
  - `VIRADO` — transferido; `responsavel_virado` = **titular** em nome de quem foi virado.
  Regras (trigger `fn_documentos_normaliza_crlv`): informar um titular sem escolher a situação ⇒
  VIRADO; situação diferente de VIRADO ⇒ titular vazio. Arquivo CRLV BRANCO nunca rebaixa VIRADO.
- `envelope` (+ `envelope_ordem`) e `observacao`.

**`notas_fiscais`** (1 por arquivo) — `tipo` (ENTRADA/SAIDA), `numero`, `serie`, `chave_acesso`
(44 dígitos, única), `data_emissao`, `valor`, `arquivo_id`. Comprador fica em `vendas`; fornecedor
em `documentos.remetente_id` — **não duplicar aqui**.

**`pericias`** (1 por arquivo; refeita = novo registro) — `autorizada` (quem fez), `data_pericia`,
`hodometro`, `status` (APROVADO | DESAPROVADO | APROVADO_COM_APONTAMENTO), `observacao`, `arquivo_id`.

## OCR

Templates (console em Arquivos, só ADMINISTRADOR) podem gravar em qualquer coluna editável dessas
tabelas. Notas e perícias gravam **no registro do arquivo enviado** (o upload termina antes da
gravação; o servidor amarra por `carro_id` + `arquivo_id`). Regras próprias: CRV e código de
segurança (só dígitos), chave de acesso (44 dígitos), status da perícia (texto → código).

## Insights e inconsistências

- Documentos: "PRONTO com CRLV aguardando" (carro pronto pra vender sem o documento) e
  "Envelopes fechando" (vendido com envelope não FECHADO).
- Arquivos → Inconsistências: "Em estoque sem nota de entrada" e "Venda sem nota de saída"
  (só vendas com envelope ainda não FECHADO).

## Histórico

Reestruturado em 2026-11-05 (`20261105120000_reestruturacao_documental_expand.sql`). Antes havia 6
estados de transferência, recibo de compra, tipo de processo, propósito, chave reserva e perícia
como estados soltos em `documentos`, e `responsavel_virado` misturava nomes e estados. As colunas
antigas saem na etapa de contract (migration separada, depois do deploy).

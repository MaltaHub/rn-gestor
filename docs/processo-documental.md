# Processo documental e administrativo do veículo

Loja de veículos usados: o que importa para comprar, regularizar e vender um carro.
Este documento é a referência de **onde cada dado mora** e **qual arquivo registra o quê**.

## Os 4 eixos (+ perícia)

| Etapa | Documento (tipo na pasta) | O que registra | Onde |
|---|---|---|---|
| Compra | **Nota fiscal de entrada** (`nota_entrada`) | cria a nota de ENTRADA ligada ao arquivo | `notas_fiscais` |
| Compra | **CRLV BRANCO** (`crlv_branco`) | situação do CRLV = BRANCO (ainda no nome do antigo dono) | `documentos.estado_transferencia` |
| Compra | **Perícia** (`pericia`) | cria a perícia ligada ao arquivo | `pericias` |
| Compra | **Procuração** (`procuracao`) | situação do CRLV = PROCURAÇÃO (se ainda não virado) | `documentos.estado_transferencia` |
| Transferência | **CRLV VIRADO** (`crlv_virado`) | situação do CRLV = VIRADO | `documentos.estado_transferencia` |
| Venda | **Nota fiscal de saída** (`nota_saida`) | cria a nota de SAÍDA ligada ao arquivo | `notas_fiscais` |

Os demais tipos (ATPV, Pesquisa, Recibo de venda, Termo de entrega, Comp. endereço,
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
  como "Fornecedores": nome, CPF/CNPJ, contato, endereço), `valor_compra`.
- CRLV: `estado_transferencia` = situação do CRLV
  - `AGUARDANDO` — o documento ainda não chegou (padrão);
  - `BRANCO` — chegou, ainda no nome do antigo dono;
  - `PROCURACAO` — negociado por procuração (sem transferir para a loja);
  - `VIRADO` — transferido; `responsavel_virado_id` = **titular** em nome de quem foi virado
    (cadastro `responsaveis_virado`: nome + CPF/CNPJ obrigatórios; CPF/CNPJ só dígitos e único).
  Regras (trigger `fn_documentos_normaliza_crlv`): informar um titular sem escolher a situação ⇒
  VIRADO; VIRADO sem titular é barrado; situação diferente de VIRADO ⇒ titular vazio. Pelos
  arquivos a situação só sobe (BRANCO < PROCURAÇÃO) e nunca rebaixa; **CRLV VIRADO classificado
  não vira sozinho** — o titular vem do OCR do CRLV (destino "CPF/CNPJ (titular do CRLV virado)":
  acha pelo CPF/CNPJ e liga; não cadastrado ⇒ abre o cadastro) ou é informado à mão.
  O texto `responsavel_virado` ficou só como espelho do nome (busca/backup) até o contract.
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

## Troca (veículo recebido na venda)

- A venda registra a troca em `venda_entradas` (`tipo = carro_troca`, `carro_troca_id`).
- O carro de troca aponta para o seu **ponto de entrada**: `documentos.origem_venda_id` (+ `origem = TROCA`),
  gravado pelo trigger `fn_venda_entradas_ponto_de_entrada` (criar/editar venda ou grid).
- Quando um dos lados é finalizado (apagado), o ponteiro passa para o snapshot em `finalizados`
  (mesmo id): `documentos.origem_finalizado_id` e `venda_entradas.carro_troca_finalizado_id`.

## Finalização (90 dias após a venda)

- Base: `carros.data_venda` — preenchida à mão ou pelo fluxo de venda (trigger da venda concluída).
  Vendido sem data **não** é finalizado: aparece em Arquivos → Inconsistências ("Vendido sem data de venda").
- `fn_finalizar_veiculo` grava o snapshot em `finalizados` (veículo, compra, fornecedor, notas,
  venda, comprador, trocas + `snapshot` jsonb com tudo), repassa os ponteiros de troca, arquiva a pasta
  de documentos e apaga o veículo com todos os dados. As **fotos** saem do storage antes (app).
- Documentos ficam 5 anos (`finalizados.documentos_expiram_em`) e depois saem do storage.
- Disparo: `pg_cron` (`rn-gestor-finalizacao`, de hora em hora) → `POST /api/v1/internal/finalizacao`
  com token interno; um lote de 10 veículos por execução.
- **Liga/desliga:** `internal.app_settings.finalizacao_ativa` (`'true'` apaga; qualquer outro valor = só relatório).
- Tabela Finalizados no grid: só GERENTE ou acima (guarda dados do comprador).

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

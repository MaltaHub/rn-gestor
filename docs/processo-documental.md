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

- **Cadastro no fluxo de venda** (/vender → Negociação → "Veículo na troca"): placa com consulta
  AUTOMÁTICA ao completar a placa (preenche só o que está vazio: modelo, cor, anos e chassi; 2ª
  tentativa em falha passageira, como o cadastro do grid), **modelo** do catálogo (nome novo entra no catálogo),
  **local** e o **propósito** declarado pelo vendedor — `carros.proposito` = VENDA (vitrine) ou
  REPASSE (fora da vitrine/catálogo; o trigger `fn_carros_proposito_calculos` mantém
  `participa_calculos = false`). O carro entra DISPONÍVEL em PREPARAÇÃO; placa já cadastrada barra
  a troca (409). Recibo: "Recibo de Venda com Troca" (modelo do sistema, escolhido sozinho quando há troca).
- **Débitos da troca** em `venda_entradas.debitos` (o que é) + `venda_entradas.debitos_valor` (R$):
  só registro — NÃO abatem do valor da troca (decisão do Kaic, 2026-11-10). No recibo com troca:
  "DÉBITOS DO VEÍCULO DA TROCA" (seção condicional `troca_tem_debitos`; `${TROCA.DEBITOS}`).

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

## Documentos da venda (Word)

O que a loja emite ao vender, em que momento e o que cada um prova. Catálogo:
`lib/domain/venda-documentos/categorias.ts` (o CHECK de `documento_templates.categoria` e
`venda_documentos.categoria` usa as mesmas chaves). O checklist do /vender e do /word sai daqui.

| Momento | Categoria | Quando é pedido | O que prova |
|---|---|---|---|
| Reserva | **Recibo de Sinal** | reservado (recomendado com entrada) | sinal pago e prazo; arras — Código Civil, arts. 417–420 |
| Venda | **Recibo de Venda** | vendido / entregue (**obrigatório**) | comprador, veículo, valor e condições de pagamento |
| Venda | **Contrato de Compra e Venda** | vendido / entregue (recomendado) | estado do veículo, garantia, transferência, multas e débitos |
| Venda | **Termo da Troca** | há veículo na troca (**obrigatório**) | veículo recebido, valor e declaração de que está livre de ônus |
| Venda | **Procuração para Transferência** | transferência pela loja (recomendado) | poderes para a loja/despachante transferir ao comprador |
| Entrega | **Termo de Entrega** | entregue (**obrigatório**); vendido (recomendado) | data/hora e KM da entrega — dali em diante multas e despesas são do comprador |
| Entrega | **Termo de Garantia** | entregue (recomendado) | garantia legal de 90 dias contada da entrega — CDC, art. 26, II |

Fora do Word, como **arquivo** na pasta do veículo (tipos de `document-slots.ts`): nota fiscal de
saída, identidade do comprador, comprovante de endereço e as vias assinadas do recibo e do termo
de entrega. A ATPV-e é assinada no app do DETRAN/CDT; a comunicação de venda é obrigação do
vendedor (CTB, art. 134) e o comprador tem 30 dias para transferir (CTB, art. 123).

**Um template por categoria.** As cláusulas prontas (`clausulas.ts`) montam o texto pela venda:
`${PAGAMENTO}` (à vista, entrada, troca, financiamento, cartão ou consórcio, com valores por
extenso), `${TRANSFERENCIA.CLAUSULA}`, `${TROCA}`, `${GARANTIA}`, `${COMPRADOR.QUALIFICACAO}`,
`${VEICULO.DESCRICAO}`, `${VALOR_FINAL}`. As **seções condicionais** (botão "Condição" do editor;
`condicoes.ts`) mostram um trecho só quando a venda casa (tem entrada, financiamento, IPVA pago,
tem troca…). Sem template próprio, a categoria usa o modelo do sistema (`modelos.ts`);
"Personalizar" copia o modelo para um template editável. Os textos são um ponto de partida:
revise com o jurídico da loja.

**IPVA:** a cláusula `${IPVA}` diz "IPVA <ano> PAGO" só quando `carros.ano_ipva_pago` registra o
ano da venda (o verídico). No fluxo, o vendedor vê essa referência e pode confirmar o pagamento —
o cadastro do carro é atualizado (só sobe o ano). Em aberto, quem paga vai em `vendas.debitos`,
que sai no documento como está escrito. Não há campo de IPVA na venda (decisão do Kaic, 2026-11-09).

**Débitos com valor:** `vendas.debitos` (o que é e quem paga) + `vendas.debitos_valor` (total em
R$) para o veículo vendido; o mesmo par em `venda_entradas` para o da troca. `${DEBITOS}` sai como
"texto — R$ valor (por extenso)"; `${DEBITOS.VALOR}` e `${TROCA.DEBITOS}`/`${TROCA.DEBITOS.VALOR}`
existem à parte. Só registro: não mudam o pagamento (decisão do Kaic, 2026-11-10).

**Comprador:** nome, CPF/CNPJ válido, telefone, CEP, endereço e cidade-UF são obrigatórios no
fluxo (RG também, para pessoa física); só o e-mail é opcional (decisão do Kaic, 2026-11-10).

**Ciclo no /vender:** Disponível → Reservado (`estado_venda = aberta`, explícito em "Salvar como
reserva") → Vendido (`concluida`, estágio `aberto`) → Entregue (estágio `fechado` + `data_entrega`)
→ Finalizado (cron, 90 dias). Abrir o veículo NÃO reserva mais.

## Histórico

Reestruturado em 2026-11-05 (`20261105120000_reestruturacao_documental_expand.sql`). Antes havia 6
estados de transferência, recibo de compra, tipo de processo, propósito, chave reserva e perícia
como estados soltos em `documentos`, e `responsavel_virado` misturava nomes e estados. As colunas
antigas saem na etapa de contract (migration separada, depois do deploy).

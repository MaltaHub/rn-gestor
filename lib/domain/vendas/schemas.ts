import { z } from "zod";

/**
 * Runtime schemas para `app/api/v1/vendas/**` (Vendas 2.0).
 *
 * Design:
 * - Extras sao removidos (`.strip()` default) — clientes podem enviar metadados
 *   de UI que nao queremos rejeitar.
 * - Strings sao trimmed na borda; opcionais aceitam null para limpar o campo.
 * - Numeros nao-negativos (valor, parcela, etc.) sao validados aqui; o banco
 *   tem CHECK constraints como defesa em profundidade.
 * - `data_venda`/`financ_primeira_em`/`seguro_validade` aceitam o formato ISO
 *   YYYY-MM-DD que o Supabase devolve em colunas `date`.
 * - Entradas multiplas vao em `entradas[]` (tabela venda_entradas). O campo
 *   `valor_entrada` segue aceito na criacao por compat (quick-dialog do grid)
 *   e vira uma entrada tipo 'outro' no service; na tabela ele e denormalizado
 *   (soma das entradas, mantido por trigger) e por isso nao e atualizavel.
 */

const FORMA_PAGAMENTO_VALUES = ["financiamento", "a_vista_pix", "cartao_credito", "consorcio"] as const;
const ESTADO_VENDA_VALUES = ["concluida", "cancelada", "obsoleta"] as const;
const ESTAGIO_VALUES = ["aberto", "fechado", "na_garantia", "finalizado"] as const;
const ENTRADA_TIPO_VALUES = ["pix", "cartao_credito", "carro_troca", "outro"] as const;
const TIPO_TRANSFERENCIA_VALUES = ["loja", "financiamento", "cliente"] as const;

export const FORMA_PAGAMENTO_OPTIONS = FORMA_PAGAMENTO_VALUES;
export const VENDA_ESTADO_OPTIONS = ESTADO_VENDA_VALUES;
export const ESTAGIO_OPTIONS = ESTAGIO_VALUES;
export type VendaEstagio = (typeof ESTAGIO_VALUES)[number];
export const ENTRADA_TIPO_OPTIONS = ENTRADA_TIPO_VALUES;
export const TIPO_TRANSFERENCIA_OPTIONS = TIPO_TRANSFERENCIA_VALUES;

export type FormaPagamento = (typeof FORMA_PAGAMENTO_VALUES)[number];
export type EntradaTipo = (typeof ENTRADA_TIPO_VALUES)[number];
export type TipoTransferencia = (typeof TIPO_TRANSFERENCIA_VALUES)[number];

const optionalNullableString = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      return value.length === 0 ? null : value;
    });

const nonNegativeNumber = z.number().finite().nonnegative();
const optionalNonNegativeNumber = z
  .union([z.number().finite().nonnegative(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    return value;
  });

const optionalPositiveInt = z.union([z.number().int().positive(), z.null()]).optional();

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data esperada no formato YYYY-MM-DD.");
const optionalIsoDate = z
  .union([isoDate, z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return value;
  });

const uuid = z.string().uuid();

/**
 * Sub-form do carro recebido na troca: cadastra um carro real na loja.
 * Placa obrigatoria; o enrichment por consulta de placa (createCarro)
 * completa os demais campos quando possivel.
 */
export const trocaCarroNovoSchema = z.object({
  placa: z.string().trim().min(7).max(8),
  nome: optionalNullableString(160),
  cor: optionalNullableString(60),
  ano_fab: z.union([z.number().int().min(1900).max(2200), z.null()]).optional(),
  ano_mod: z.union([z.number().int().min(1900).max(2200), z.null()]).optional(),
  hodometro: z.union([z.number().int().nonnegative(), z.null()]).optional(),
  chassi: optionalNullableString(40),
  renavam: optionalNullableString(20)
});

export type TrocaCarroNovoInput = z.infer<typeof trocaCarroNovoSchema>;

export const vendaEntradaSchema = z
  .object({
    tipo: z.enum(ENTRADA_TIPO_VALUES),
    valor: nonNegativeNumber,
    cartao_parcelas_qtde: optionalPositiveInt,
    cartao_parcela_valor: optionalNonNegativeNumber,
    // Novo carro a cadastrar (fluxo de criacao) OU referencia a um carro de
    // troca ja cadastrado (fluxo de edicao da venda).
    carro_troca: trocaCarroNovoSchema.nullable().optional(),
    carro_troca_id: z.union([uuid, z.null()]).optional(),
    descricao: optionalNullableString(400)
  })
  .superRefine((entrada, ctx) => {
    if (entrada.tipo === "cartao_credito" && !entrada.cartao_parcelas_qtde) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cartao_parcelas_qtde"],
        message: "Entrada no cartao exige a quantidade de parcelas."
      });
    }
    if (entrada.tipo === "carro_troca" && !entrada.carro_troca && !entrada.carro_troca_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["carro_troca"],
        message: "Entrada com carro na troca exige os dados do veiculo."
      });
    }
    if (entrada.tipo !== "carro_troca" && (entrada.carro_troca || entrada.carro_troca_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["carro_troca"],
        message: "Dados de veiculo so sao aceitos em entradas do tipo carro_troca."
      });
    }
  });

export type VendaEntradaInput = z.infer<typeof vendaEntradaSchema>;

const baseFields = {
  // Relacionamentos
  carro_id: uuid,
  vendedor_auth_user_id: uuid,

  // Dados basicos (so vendedor + forma_pagamento sao obrigatorios; preco e
  // comprador podem ser preenchidos depois)
  data_venda: isoDate.optional(),
  data_entrega: optionalIsoDate,
  valor_total: optionalNonNegativeNumber,
  desconto: optionalNonNegativeNumber,
  forma_pagamento: z.enum(FORMA_PAGAMENTO_VALUES),
  estado_venda: z.enum(ESTADO_VENDA_VALUES).optional(),
  estagio: z.enum(ESTAGIO_VALUES).optional(),
  // canal_cliente e FK lookup_canais_cliente; aceita qualquer string nao vazia
  // (validacao do codigo real e feita pelo banco via FK).
  canal_cliente: optionalNullableString(60),
  observacao: optionalNullableString(4000),
  // Debitos do veiculo (IPVA/multas) — texto livre, destacado em vermelho na UI.
  debitos: optionalNullableString(2000),

  // Comprador (todos opcionais agora)
  comprador_nome: optionalNullableString(160),
  comprador_documento: optionalNullableString(40),
  comprador_rg: optionalNullableString(40),
  comprador_telefone: optionalNullableString(40),
  comprador_email: optionalNullableString(160),
  comprador_endereco: optionalNullableString(400),
  comprador_cep: optionalNullableString(20),
  comprador_cidade_estado: optionalNullableString(120),

  // Financiamento (tambem usado para consorcio: banco = administradora)
  financ_banco: optionalNullableString(120),
  financ_valor: optionalNonNegativeNumber,
  financ_parcelas_qtde: optionalPositiveInt,
  financ_parcela_valor: optionalNonNegativeNumber,
  financ_taxa_mensal: optionalNonNegativeNumber,
  financ_primeira_em: optionalIsoDate,

  // Cartao de credito como pagamento principal
  cartao_parcelas_qtde: optionalPositiveInt,
  cartao_parcela_valor: optionalNonNegativeNumber,

  // Transferencia
  tipo_transferencia: z.union([z.enum(TIPO_TRANSFERENCIA_VALUES), z.null()]).optional(),
  valor_transferencia: optionalNonNegativeNumber,

  // Seguro
  seguro_seguradora: optionalNullableString(160),
  seguro_apolice: optionalNullableString(80),
  seguro_valor: optionalNonNegativeNumber,
  seguro_validade: optionalIsoDate
} as const;

export const vendaCreateSchema = z.object({
  ...baseFields,
  entradas: z.array(vendaEntradaSchema).max(10).optional(),
  // DEPRECATED: compat com o quick-dialog do grid; vira entrada tipo 'outro'.
  valor_entrada: optionalNonNegativeNumber
});
export type VendaCreateInput = z.infer<typeof vendaCreateSchema>;

/**
 * Update: tudo opcional, mas pelo menos um campo deve estar presente.
 * carro_id e vendedor_auth_user_id sao reatribuiveis (re-assign) mas raro.
 * `valor_entrada` e `entradas` ficam fora: entradas sao gerenciadas pelo
 * sheet venda_entradas e o total e denormalizado por trigger.
 */
export const vendaUpdateSchema = z
  .object({
    carro_id: uuid.optional(),
    vendedor_auth_user_id: uuid.optional(),
    data_venda: isoDate.optional(),
    data_entrega: optionalIsoDate,
    valor_total: nonNegativeNumber.optional(),
    desconto: optionalNonNegativeNumber,
    forma_pagamento: z.enum(FORMA_PAGAMENTO_VALUES).optional(),
    estado_venda: z.enum(ESTADO_VENDA_VALUES).optional(),
    estagio: z.enum(ESTAGIO_VALUES).optional(),
    canal_cliente: optionalNullableString(60),
    observacao: optionalNullableString(4000),
    debitos: optionalNullableString(2000),
    comprador_nome: optionalNullableString(160),
    comprador_documento: optionalNullableString(40),
    comprador_rg: optionalNullableString(40),
    comprador_telefone: optionalNullableString(40),
    comprador_email: optionalNullableString(160),
    comprador_endereco: optionalNullableString(400),
    comprador_cep: optionalNullableString(20),
    comprador_cidade_estado: optionalNullableString(120),
    financ_banco: optionalNullableString(120),
    financ_valor: optionalNonNegativeNumber,
    financ_parcelas_qtde: optionalPositiveInt,
    financ_parcela_valor: optionalNonNegativeNumber,
    financ_taxa_mensal: optionalNonNegativeNumber,
    financ_primeira_em: optionalIsoDate,
    cartao_parcelas_qtde: optionalPositiveInt,
    cartao_parcela_valor: optionalNonNegativeNumber,
    tipo_transferencia: z.union([z.enum(TIPO_TRANSFERENCIA_VALUES), z.null()]).optional(),
    valor_transferencia: optionalNonNegativeNumber,
    seguro_seguradora: optionalNullableString(160),
    seguro_apolice: optionalNullableString(80),
    seguro_valor: optionalNonNegativeNumber,
    seguro_validade: optionalIsoDate,
    // Substitui TODAS as entradas da venda (wizard em modo edicao). O trigger
    // do banco re-deriva vendas.valor_entrada.
    entradas: z.array(vendaEntradaSchema).max(10).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });

export type VendaUpdateInput = z.infer<typeof vendaUpdateSchema>;

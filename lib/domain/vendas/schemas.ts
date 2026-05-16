import { z } from "zod";

/**
 * Runtime schemas para `app/api/v1/vendas/**`.
 *
 * Design:
 * - Extras sao removidos (`.strip()` default) — clientes podem enviar metadados
 *   de UI que nao queremos rejeitar.
 * - Strings sao trimmed na borda; opcionais aceitam null para limpar o campo.
 * - Numeros nao-negativos (valor, parcela, etc.) sao validados aqui; o banco
 *   tem CHECK constraints como defesa em profundidade.
 * - `data_venda`/`financ_primeira_em`/`seguro_validade` aceitam o formato ISO
 *   YYYY-MM-DD que o Supabase devolve em colunas `date`.
 */

const FORMA_PAGAMENTO_VALUES = ["a_vista", "financiado", "consorcio", "parcelado", "misto"] as const;
const ESTADO_VENDA_VALUES = ["concluida", "cancelada", "obsoleta"] as const;

export const FORMA_PAGAMENTO_OPTIONS = FORMA_PAGAMENTO_VALUES;
export const VENDA_ESTADO_OPTIONS = ESTADO_VENDA_VALUES;

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

const baseFields = {
  // Relacionamentos
  carro_id: uuid,
  vendedor_auth_user_id: uuid,

  // Dados basicos (so vendedor + forma_pagamento sao obrigatorios; preco e
  // comprador podem ser preenchidos depois)
  data_venda: isoDate.optional(),
  valor_total: optionalNonNegativeNumber,
  valor_entrada: optionalNonNegativeNumber,
  forma_pagamento: z.enum(FORMA_PAGAMENTO_VALUES),
  estado_venda: z.enum(ESTADO_VENDA_VALUES).optional(),
  observacao: optionalNullableString(4000),

  // Comprador (todos opcionais agora)
  comprador_nome: optionalNullableString(160),
  comprador_documento: optionalNullableString(40),
  comprador_telefone: optionalNullableString(40),
  comprador_email: optionalNullableString(160),
  comprador_endereco: optionalNullableString(400),

  // Financiamento
  financ_banco: optionalNullableString(120),
  financ_parcelas_qtde: z.union([z.number().int().positive(), z.null()]).optional(),
  financ_parcela_valor: optionalNonNegativeNumber,
  financ_taxa_mensal: optionalNonNegativeNumber,
  financ_primeira_em: optionalIsoDate,

  // Seguro
  seguro_seguradora: optionalNullableString(160),
  seguro_apolice: optionalNullableString(80),
  seguro_valor: optionalNonNegativeNumber,
  seguro_validade: optionalIsoDate,

  // Troca
  troca_marca: optionalNullableString(80),
  troca_modelo: optionalNullableString(160),
  troca_ano: z.union([z.number().int().min(1900).max(2200), z.null()]).optional(),
  troca_placa: optionalNullableString(16),
  troca_valor: optionalNonNegativeNumber
} as const;

export const vendaCreateSchema = z.object(baseFields);
export type VendaCreateInput = z.infer<typeof vendaCreateSchema>;

/**
 * Update: tudo opcional, mas pelo menos um campo deve estar presente.
 * carro_id e vendedor_auth_user_id sao reatribuiveis (re-assign) mas raro.
 */
export const vendaUpdateSchema = z
  .object({
    carro_id: uuid.optional(),
    vendedor_auth_user_id: uuid.optional(),
    data_venda: isoDate.optional(),
    valor_total: nonNegativeNumber.optional(),
    valor_entrada: optionalNonNegativeNumber,
    forma_pagamento: z.enum(FORMA_PAGAMENTO_VALUES).optional(),
    estado_venda: z.enum(ESTADO_VENDA_VALUES).optional(),
    observacao: optionalNullableString(4000),
    comprador_nome: optionalNullableString(160),
    comprador_documento: optionalNullableString(40),
    comprador_telefone: optionalNullableString(40),
    comprador_email: optionalNullableString(160),
    comprador_endereco: optionalNullableString(400),
    financ_banco: optionalNullableString(120),
    financ_parcelas_qtde: z.union([z.number().int().positive(), z.null()]).optional(),
    financ_parcela_valor: optionalNonNegativeNumber,
    financ_taxa_mensal: optionalNonNegativeNumber,
    financ_primeira_em: optionalIsoDate,
    seguro_seguradora: optionalNullableString(160),
    seguro_apolice: optionalNullableString(80),
    seguro_valor: optionalNonNegativeNumber,
    seguro_validade: optionalIsoDate,
    troca_marca: optionalNullableString(80),
    troca_modelo: optionalNullableString(160),
    troca_ano: z.union([z.number().int().min(1900).max(2200), z.null()]).optional(),
    troca_placa: optionalNullableString(16),
    troca_valor: optionalNonNegativeNumber
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });

export type VendaUpdateInput = z.infer<typeof vendaUpdateSchema>;

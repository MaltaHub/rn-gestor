import { z } from "zod";

/**
 * Schemas para `app/api/v1/print-templates/**`.
 *
 * O payload `config` carrega o estado completo do composer (titulo, escopo,
 * colunas, ordenacao, secoes, filtros, highlights). `anchor_filter` e um
 * pre-filtro independente que estreita o dataset ANTES do print job.
 *
 * Aceitamos jsonb permissivo (z.record(z.unknown())) para nao acoplar a API ao
 * shape interno do composer — a validacao estrutural mora no client.
 */

const trimmedString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max);

const jsonbObject = z.record(z.string(), z.unknown());

export const printTemplateCreateSchema = z
  .object({
    sheet_key: trimmedString(64),
    title: trimmedString(120),
    config: jsonbObject,
    anchor_filter: z.union([jsonbObject, z.null()]).optional()
  })
  .strict();

export const printTemplateUpdateSchema = z
  .object({
    title: trimmedString(120).optional(),
    config: jsonbObject.optional(),
    anchor_filter: z.union([jsonbObject, z.null()]).optional()
  })
  .strict()
  .refine(
    (data) => data.title !== undefined || data.config !== undefined || data.anchor_filter !== undefined,
    { message: "Informe pelo menos um campo para atualizar." }
  );

export type PrintTemplateCreateInput = z.infer<typeof printTemplateCreateSchema>;
export type PrintTemplateUpdateInput = z.infer<typeof printTemplateUpdateSchema>;

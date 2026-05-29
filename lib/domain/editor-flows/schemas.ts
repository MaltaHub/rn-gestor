import { z } from "zod";

/**
 * Schemas para `app/api/v1/editor-flows/**`.
 *
 * Padrao: jsonb permissivo (validacao estrutural mora no client). Titulo unico
 * org-wide (nao por user), pois flows sao compartilhados. `sheet_key` nullable
 * porque flow pode ser multi-aba.
 */

const trimmedString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max);

const jsonbObject = z.record(z.string(), z.unknown());

export const editorFlowCreateSchema = z
  .object({
    title: trimmedString(120),
    description: z.union([z.string().trim().max(500), z.null()]).optional(),
    sheet_key: z.union([trimmedString(64), z.null()]).optional(),
    graph: jsonbObject
  })
  .strict();

export const editorFlowUpdateSchema = z
  .object({
    title: trimmedString(120).optional(),
    description: z.union([z.string().trim().max(500), z.null()]).optional(),
    sheet_key: z.union([trimmedString(64), z.null()]).optional(),
    graph: jsonbObject.optional()
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.sheet_key !== undefined ||
      data.graph !== undefined,
    { message: "Informe pelo menos um campo para atualizar." }
  );

export type EditorFlowCreateInput = z.infer<typeof editorFlowCreateSchema>;
export type EditorFlowUpdateInput = z.infer<typeof editorFlowUpdateSchema>;

/**
 * Bridge V1 -> V3: monta um flow a partir de um template conhecido (bulk-select)
 * e devolve o flow criado. Util pra "Salvar como fluxo" no dialog de bulk-select.
 */
export const flowFromTemplateSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("bulk-select"),
      title: z.string().trim().min(1).max(120).optional(),
      sheet_key: trimmedString(64),
      match_column: z.string().trim().min(1).max(64).optional(),
      tokens: z.array(z.string().trim().min(1)).min(1)
    })
    .strict()
]);

export type FlowFromTemplateInput = z.infer<typeof flowFromTemplateSchema>;

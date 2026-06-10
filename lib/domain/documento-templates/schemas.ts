import { z } from "zod";

/**
 * Schemas runtime para `app/api/v1/documento-templates/**`.
 * Escrita restrita a GERENTE+ (gating na rota). `conteudo` = doc Tiptap (JSON).
 */

const conteudo = z.record(z.string(), z.unknown());
const titulo = z.string().trim().min(1, "Informe um titulo.").max(200);
const descricao = z.union([z.string().trim().max(1000), z.null()]).optional();

export const documentoTemplateCreateSchema = z.object({
  titulo,
  descricao,
  conteudo,
  is_active: z.boolean().optional()
});
export type DocumentoTemplateCreateInput = z.infer<typeof documentoTemplateCreateSchema>;

export const documentoTemplateUpdateSchema = z
  .object({
    titulo: titulo.optional(),
    descricao,
    conteudo: conteudo.optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });
export type DocumentoTemplateUpdateInput = z.infer<typeof documentoTemplateUpdateSchema>;

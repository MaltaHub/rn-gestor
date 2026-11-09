import { z } from "zod";
import { CATEGORIA_KEYS } from "@/lib/domain/venda-documentos/categorias";

/**
 * Schemas runtime para `app/api/v1/venda-documentos/**`.
 * `conteudo` e o doc Tiptap (JSON, objeto raiz { type: "doc", content: [...] }).
 */

const uuid = z.string().uuid();
const conteudo = z.record(z.string(), z.unknown());
const titulo = z.string().trim().min(1, "Informe um titulo.").max(200);
export const categoriaSchema = z.union([z.enum(CATEGORIA_KEYS), z.null()]);

export const vendaDocumentoCreateSchema = z.object({
  venda_id: uuid,
  titulo,
  conteudo,
  categoria: categoriaSchema.optional(),
  template_id: z.union([uuid, z.null()]).optional()
});
export type VendaDocumentoCreateInput = z.infer<typeof vendaDocumentoCreateSchema>;

export const vendaDocumentoUpdateSchema = z
  .object({
    titulo: titulo.optional(),
    conteudo: conteudo.optional(),
    categoria: categoriaSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });
export type VendaDocumentoUpdateInput = z.infer<typeof vendaDocumentoUpdateSchema>;

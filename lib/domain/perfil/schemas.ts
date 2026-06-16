import { z } from "zod";
import { isValidTelefone } from "@/lib/domain/vendas/validacao";

/**
 * Schema do auto-serviço de perfil (PATCH /api/v1/me/perfil).
 * O usuário só edita o PRÓPRIO foto/bio/telefone — cargo/status/email ficam de
 * fora (são administrativos). `null` limpa o campo. `.refine` exige ao menos um.
 */
export const mePerfilUpdateSchema = z
  .object({
    foto: z.union([z.string().url(), z.null()]).optional(),
    bio: z.union([z.string().max(600), z.null()]).optional(),
    telefone: z
      .union([
        z.string().refine((value) => !value.trim() || isValidTelefone(value), {
          message: "Telefone inválido."
        }),
        z.null()
      ])
      .optional()
  })
  .strict()
  .refine((value) => value.foto !== undefined || value.bio !== undefined || value.telefone !== undefined, {
    message: "Informe ao menos um campo para atualizar."
  });

export type MePerfilUpdateInput = z.infer<typeof mePerfilUpdateSchema>;

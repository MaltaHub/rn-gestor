import { z } from "zod";

/**
 * Schemas for `app/api/v1/admin/**` routes.
 *
 * Design choice: admin user PATCH is `.strict()` — any unknown field is a
 * client bug worth surfacing loudly, since fields here drive auth/role state.
 * `nome`/`cargo`/`status` accept any string and let the service layer reject
 * unknown lookup codes (the service already validates against the DB).
 * `obs` is nullable to support clearing the field.
 *
 * `.refine` enforces "at least one field" since the underlying update needs a
 * non-empty patch.
 */
export const adminUserUpdateSchema = z
  .object({
    nome: z.string().min(1).optional(),
    obs: z.union([z.string(), z.null()]).optional(),
    cargo: z.string().min(1).optional(),
    status: z.string().min(1).optional()
  })
  .strict()
  .refine(
    (value) =>
      value.nome !== undefined ||
      value.obs !== undefined ||
      value.cargo !== undefined ||
      value.status !== undefined,
    { message: "Informe ao menos um campo para atualizar." }
  );

export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;

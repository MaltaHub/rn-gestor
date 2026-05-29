import { z } from "zod";

/**
 * Schemas para `app/api/v1/editor-variables/**`.
 *
 * Variaveis globais per-user, cross-flow. Nome unico por usuario.
 * Namespace `system.*` reservado — SetVariable do runtime rejeita.
 */

const SYSTEM_NAMESPACE = "system.";

const variableName = z
  .string()
  .trim()
  .min(1, "nome obrigatorio")
  .max(120)
  .refine((name) => !name.toLowerCase().startsWith(SYSTEM_NAMESPACE), {
    message: "Nomes com prefixo 'system.' sao reservados pra variaveis de sistema (read-only)."
  });

const variableValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown())
]);

export const upsertVariableSchema = z
  .object({
    name: variableName,
    value: variableValue,
    type: z.string().trim().max(40).optional()
  })
  .strict();

export const batchUpsertSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            name: variableName,
            value: variableValue,
            type: z.string().trim().max(40).optional()
          })
          .strict()
      )
      .min(1)
      .max(200)
  })
  .strict();

export type UpsertVariableInput = z.infer<typeof upsertVariableSchema>;
export type BatchUpsertInput = z.infer<typeof batchUpsertSchema>;

export { SYSTEM_NAMESPACE };

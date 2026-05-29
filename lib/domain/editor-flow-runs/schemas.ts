import { z } from "zod";

const jsonbObject = z.record(z.string(), z.unknown());

export const FLOW_RUN_STATUSES = [
  "running",
  "paused_at_tag",
  "paused_awaiting_form",
  "completed",
  "failed",
  "cancelled"
] as const;

export type FlowRunStatus = (typeof FLOW_RUN_STATUSES)[number];

/**
 * POST /api/v1/editor-flow-runs — inicia uma run nova.
 * Server snapshota o graph do flow no momento, gera lock_token, e devolve a run.
 */
export const flowRunStartSchema = z
  .object({
    flow_id: z.string().uuid()
  })
  .strict();

/**
 * PATCH /api/v1/editor-flow-runs/[id] — atualiza estado da run.
 * Exige lock_token valido (lock vivo). Permite mudar status, current_node_id, context, error.
 */
export const flowRunPatchSchema = z
  .object({
    lock_token: z.string().uuid(),
    status: z.enum(FLOW_RUN_STATUSES).optional(),
    current_node_id: z.union([z.string(), z.null()]).optional(),
    context: jsonbObject.optional(),
    paused_reason: z.union([z.string().trim().max(200), z.null()]).optional(),
    error: z.union([z.string().trim().max(2000), z.null()]).optional()
  })
  .strict()
  .refine(
    (data) =>
      data.status !== undefined ||
      data.current_node_id !== undefined ||
      data.context !== undefined ||
      data.paused_reason !== undefined ||
      data.error !== undefined,
    { message: "Informe pelo menos um campo para atualizar." }
  );

/**
 * POST /api/v1/editor-flow-runs/[id]/heartbeat — renova locked_until.
 */
export const flowRunHeartbeatSchema = z
  .object({
    lock_token: z.string().uuid()
  })
  .strict();

export type FlowRunStartInput = z.infer<typeof flowRunStartSchema>;
export type FlowRunPatchInput = z.infer<typeof flowRunPatchSchema>;
export type FlowRunHeartbeatInput = z.infer<typeof flowRunHeartbeatSchema>;

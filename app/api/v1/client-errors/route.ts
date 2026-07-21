import { NextRequest } from "next/server";
import { z } from "zod";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";

/**
 * Sink de erros de cliente. Alimentado pelo GlobalErrorListener quando um
 * `unhandledrejection` ou `error` global escapa (ex.: as promises `void` do
 * grid). Autenticado de proposito: so quem ja esta no app reporta, o que limita
 * spam. O objetivo e trocar "falha invisivel" por "falha logada com contexto".
 *
 * Campos limitados no tamanho para nao virar vetor de log-flood.
 */
const clientErrorSchema = z.object({
  kind: z.enum(["unhandledrejection", "error"]),
  message: z.string().trim().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  source: z.string().max(1000).optional(),
  path: z.string().max(1000).optional(),
  user_agent: z.string().max(1000).optional()
});

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId }) => {
    const payload = await parseJsonBody(req, clientErrorSchema, "BAD_CLIENT_ERROR", "Payload de erro invalido.");

    console.error("[client-error]", {
      requestId,
      actorId: actor.userId,
      role: actor.role,
      kind: payload.kind,
      message: payload.message,
      path: payload.path,
      source: payload.source,
      userAgent: payload.user_agent,
      stack: payload.stack
    });

    return apiOk({ received: true }, { request_id: requestId });
  });
}

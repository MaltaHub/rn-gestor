import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorContext, SupportedRole } from "@/lib/api/auth";
import { getActorContext, requireRole } from "@/lib/api/auth";
import { ApiHttpError } from "@/lib/api/errors";
import { apiError } from "@/lib/api/response";
import { getRequestId } from "@/lib/api/request";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import type { Database } from "@/lib/supabase/database.types";

type ApiContext = {
  req: NextRequest;
  requestId: string;
  supabase: SupabaseClient<Database>;
};

type AuthenticatedApiContext = ApiContext & {
  actor: ActorContext;
};

type Handler<T> = (ctx: ApiContext) => Promise<T>;
type AuthenticatedHandler<T> = (ctx: AuthenticatedApiContext) => Promise<T>;

export async function executeApi<T>(req: NextRequest, handler: Handler<T>) {
  const requestId = getRequestId(req);

  try {
    const supabase = getSupabaseAdmin();
    return await handler({ req, requestId, supabase });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return apiError(requestId, error.status, error.code, error.message, error.details);
    }

    return apiError(requestId, 500, "INTERNAL_ERROR", "Erro interno nao tratado.");
  }
}

export async function executeAuthenticatedApi<T>(req: NextRequest, handler: AuthenticatedHandler<T>) {
  return executeApi(req, async (ctx) => {
    const actor = await getActorContext(req);
    return handler({ ...ctx, actor });
  });
}

export async function executeAuthorizedApi<T>(
  req: NextRequest,
  minRole: SupportedRole,
  handler: AuthenticatedHandler<T>
) {
  return executeAuthenticatedApi(req, async (ctx) => {
    requireRole(ctx.actor, minRole);
    return handler(ctx);
  });
}

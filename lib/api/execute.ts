import type { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { apiError } from "@/lib/api/response";
import { getRequestId } from "@/lib/api/request";

type Handler<T> = (ctx: { req: NextRequest; requestId: string }) => Promise<T>;

export async function executeApi<T>(req: NextRequest, handler: Handler<T>) {
  const requestId = getRequestId(req);

  try {
    return await handler({ req, requestId });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return apiError(requestId, error.status, error.code, error.message, error.details);
    }

    return apiError(requestId, 500, "INTERNAL_ERROR", "Erro interno nao tratado.");
  }
}

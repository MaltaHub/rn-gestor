import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { upsertVariableBatch } from "@/lib/domain/editor-user-variables/service";
import { batchUpsertSchema } from "@/lib/domain/editor-user-variables/schemas";

export async function PATCH(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const body = await req.json();
    const parsed = batchUpsertSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de lote invalido.", parsed.error);
    }
    const data = await upsertVariableBatch({ supabase, actor, payload: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}

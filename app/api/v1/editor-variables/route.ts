import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import {
  listVariablesForUser,
  upsertVariable
} from "@/lib/domain/editor-user-variables/service";
import { upsertVariableSchema } from "@/lib/domain/editor-user-variables/schemas";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const rows = await listVariablesForUser({ supabase, actor });
    return apiOk(rows, { request_id: requestId });
  });
}

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const body = await req.json();
    const parsed = upsertVariableSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de variavel invalido.", parsed.error);
    }
    const data = await upsertVariable({ supabase, actor, row: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}

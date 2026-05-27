import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { createEditorFlowFromTemplate } from "@/lib/domain/editor-flows/service";
import { flowFromTemplateSchema } from "@/lib/domain/editor-flows/schemas";

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const body = await req.json();
    const parsed = flowFromTemplateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de template invalido.", parsed.error);
    }

    const data = await createEditorFlowFromTemplate({ supabase, actor, payload: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}

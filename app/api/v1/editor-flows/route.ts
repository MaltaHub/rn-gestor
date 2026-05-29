import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { createEditorFlow, listEditorFlows } from "@/lib/domain/editor-flows/service";
import { editorFlowCreateSchema } from "@/lib/domain/editor-flows/schemas";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const sheetKey = req.nextUrl.searchParams.get("sheet");
    const rows = await listEditorFlows({ supabase, actor, sheetKey });
    return apiOk(rows, { request_id: requestId });
  });
}

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const body = await req.json();
    const parsed = editorFlowCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Payload de fluxo invalido.", parsed.error);
    }

    const data = await createEditorFlow({ supabase, actor, row: parsed.data });
    return apiOk(data, { request_id: requestId });
  });
}

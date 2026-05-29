import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { deleteVariable } from "@/lib/domain/editor-user-variables/service";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { name } = await params;
    await deleteVariable({ supabase, actor, name: decodeURIComponent(name) });
    return apiOk({ deleted: true, name }, { request_id: requestId });
  });
}

import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";
import { setCarroFotoCapa } from "@/lib/domain/carros/service";

// PATCH /api/v1/carros/:id/foto-capa { fileId: string | null } -> define/limpa a capa.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { fileId?: unknown } | null;
    const rawFileId = body?.fileId;
    if (rawFileId !== null && typeof rawFileId !== "string") {
      throw new ApiHttpError(400, "BAD_BODY", "Informe fileId (string) ou null.");
    }
    const fileId = typeof rawFileId === "string" && rawFileId.trim() ? rawFileId.trim() : null;

    const data = await setCarroFotoCapa({ supabase, actor, id, fileId });
    return apiOk(data, { request_id: requestId });
  });
}

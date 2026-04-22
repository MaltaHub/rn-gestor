import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { deleteModelo, updateModelo } from "@/lib/domain/modelos/service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    const body = (await req.json()) as { modelo?: string };
    const data = await updateModelo({ supabase, actor, id, row: body });

    return apiOk(data, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "GERENTE", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    await deleteModelo({ supabase, actor, id });

    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}

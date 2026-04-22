import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import type { CarroUpdate } from "@/lib/domain/db";
import { deleteCarro, readCarroById, updateCarro } from "@/lib/domain/carros/service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { id } = await params;
    const data = await readCarroById({ supabase, id });
    return apiOk(data, { request_id: requestId });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    const body = (await req.json()) as CarroUpdate & {
      atpv_e?: unknown;
      laudo?: unknown;
      priceChangeContext?: string;
    };

    const data = await updateCarro({
      supabase,
      actor,
      id,
      patch: body,
      priceChangeContext: body.priceChangeContext
    });

    return apiOk(data, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "GERENTE", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    await deleteCarro({ supabase, actor, id });

    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}

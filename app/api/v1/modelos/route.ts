import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { parsePagination } from "@/lib/api/request";
import { writeAuditLog } from "@/lib/api/audit";
import type { ModeloInsert } from "@/lib/domain/db";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { page, pageSize, from, to } = parsePagination(req);
    const q = req.nextUrl.searchParams.get("q");

    let query = supabase.from("modelos").select("*", { count: "exact" }).order("modelo", { ascending: true });

    if (q) {
      query = query.ilike("modelo", `%${q}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw new ApiHttpError(500, "MODELOS_LIST_FAILED", "Falha ao listar modelos.", error);

    return apiOk(data ?? [], {
      request_id: requestId,
      page,
      page_size: pageSize,
      total: count ?? 0
    });
  });
}

export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const body = (await req.json()) as Partial<ModeloInsert>;
    if (!body.modelo || !body.modelo.trim()) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Campo 'modelo' e obrigatorio.");
    }

    const payload: ModeloInsert = {
      modelo: body.modelo.trim()
    };

    const { data, error } = await supabase.from("modelos").insert(payload).select("*").single();
    if (error) throw new ApiHttpError(400, "MODELO_CREATE_FAILED", "Falha ao criar modelo.", error);

    await writeAuditLog({
      action: "create",
      table: "modelos",
      pk: data.id,
      actor,
      newData: data
    });

    return apiOk(data, { request_id: requestId });
  });
}

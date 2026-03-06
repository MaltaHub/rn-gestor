import { NextRequest } from "next/server";
import { executeApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { getActorContext, requireRole } from "@/lib/api/auth";
import { ApiHttpError } from "@/lib/api/errors";
import { parsePagination } from "@/lib/api/request";
import { writeAuditLog } from "@/lib/api/audit";
import type { AnuncioInsert } from "@/lib/domain/db";

export async function GET(req: NextRequest) {
  return executeApi(req, async ({ requestId }) => {
    const supabase = getSupabaseAdmin();
    const { page, pageSize, from, to } = parsePagination(req);
    const estado = req.nextUrl.searchParams.get("estado_anuncio");

    let query = supabase
      .from("anuncios")
      .select("id, estado_anuncio, target_id, valor_anuncio, created_at, carros(placa, nome)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (estado) {
      query = query.eq("estado_anuncio", estado);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw new ApiHttpError(500, "ANUNCIOS_LIST_FAILED", "Falha ao listar anuncios.", error);

    return apiOk(data ?? [], {
      request_id: requestId,
      page,
      page_size: pageSize,
      total: count ?? 0
    });
  });
}

export async function POST(req: NextRequest) {
  return executeApi(req, async ({ requestId }) => {
    const actor = getActorContext(req);
    requireRole(actor, "SECRETARIO");

    const body = (await req.json()) as Partial<AnuncioInsert>;
    if (!body.target_id || !body.estado_anuncio) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Campos obrigatorios: target_id, estado_anuncio.");
    }

    const supabase = getSupabaseAdmin();
    const payload: AnuncioInsert = {
      target_id: body.target_id,
      estado_anuncio: body.estado_anuncio,
      valor_anuncio: body.valor_anuncio ?? null
    };

    const { data, error } = await supabase.from("anuncios").insert(payload).select("*").single();
    if (error) throw new ApiHttpError(400, "ANUNCIO_CREATE_FAILED", "Falha ao criar anuncio.", error);

    await writeAuditLog({
      action: "create",
      table: "anuncios",
      pk: data.id,
      actor,
      newData: data
    });

    return apiOk(data, { request_id: requestId });
  });
}

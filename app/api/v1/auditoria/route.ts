import { NextRequest } from "next/server";
import { executeApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { getActorContext, requireRole } from "@/lib/api/auth";
import { ApiHttpError } from "@/lib/api/errors";
import { parsePagination } from "@/lib/api/request";

export async function GET(req: NextRequest) {
  return executeApi(req, async ({ requestId }) => {
    const actor = getActorContext(req);
    requireRole(actor, "GERENTE");

    const supabase = getSupabaseAdmin();
    const { page, pageSize, from, to } = parsePagination(req);

    const tabela = req.nextUrl.searchParams.get("tabela");
    const acao = req.nextUrl.searchParams.get("acao");

    let query = supabase.from("log_alteracoes").select("*", { count: "exact" }).order("data_hora", { ascending: false });

    if (tabela) query = query.eq("tabela", tabela);
    if (acao) query = query.eq("acao", acao);

    const { data, error, count } = await query.range(from, to);
    if (error) throw new ApiHttpError(500, "AUDIT_LIST_FAILED", "Falha ao listar auditoria.", error);

    return apiOk(data ?? [], {
      request_id: requestId,
      page,
      page_size: pageSize,
      total: count ?? 0
    });
  });
}

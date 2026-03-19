import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { parsePagination } from "@/lib/api/request";
import { toAuditJson, writeAuditLog } from "@/lib/api/audit";
import type { CarroInsert } from "@/lib/domain/db";
import { enrichCarroInsertPayload } from "@/lib/domain/carros-enrichment";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { page, pageSize, from, to } = parsePagination(req);
    const q = req.nextUrl.searchParams.get("q");
    const local = req.nextUrl.searchParams.get("local");
    const estadoVenda = req.nextUrl.searchParams.get("estado_venda");

    let query = supabase
      .from("carros")
      .select("id, placa, nome, local, estado_venda, em_estoque, modelo_id, data_entrada, created_at, modelos(modelo)", {
        count: "exact"
      })
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(`placa.ilike.%${q}%,nome.ilike.%${q}%`);
    }

    if (local) {
      query = query.eq("local", local);
    }

    if (estadoVenda) {
      query = query.eq("estado_venda", estadoVenda);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw new ApiHttpError(500, "CARROS_LIST_FAILED", "Falha ao listar carros.", error);

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
    const body = (await req.json()) as Partial<CarroInsert>;

    const { payload: enrichedPayload, consultaPlaca, consultaPlacaErro } = await enrichCarroInsertPayload({
      supabase,
      row: body as Record<string, unknown>
    });

    const payload: CarroInsert = {
      ...(enrichedPayload as Partial<CarroInsert>),
      em_estoque: body.em_estoque ?? true
    } as CarroInsert;

    const { data, error } = await supabase.from("carros").insert(payload).select("*").single();
    if (error) throw new ApiHttpError(400, "CARRO_CREATE_FAILED", "Falha ao criar carro.", error);

    await writeAuditLog({
      action: "create",
      table: "carros",
      pk: data.id,
      actor,
      newData: {
        ...data,
        consulta_placa: toAuditJson(consultaPlaca),
        consulta_placa_erro: consultaPlacaErro
      }
    });

    return apiOk(data, { request_id: requestId });
  });
}

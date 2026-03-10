import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { parsePagination } from "@/lib/api/request";
import { writeAuditLog } from "@/lib/api/audit";

type CreateAnuncioBody = {
  carro_id?: string;
  estado_anuncio?: string;
  valor_anuncio?: number | null;
};

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { page, pageSize, from, to } = parsePagination(req);
    const estado = req.nextUrl.searchParams.get("estado_anuncio");

    let query = supabase
      .from("anuncios")
      .select("id, estado_anuncio, carro_id, valor_anuncio, created_at, carros(placa, nome)", { count: "exact" })
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
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const body = (await req.json()) as CreateAnuncioBody;
    if (!body.carro_id || !body.estado_anuncio) {
      throw new ApiHttpError(400, "INVALID_PAYLOAD", "Campos obrigatorios: carro_id, estado_anuncio.");
    }

    const payload = {
      carro_id: body.carro_id,
      estado_anuncio: body.estado_anuncio,
      valor_anuncio: body.valor_anuncio ?? null
    } as Record<string, unknown>;

    const { data, error } = await supabase.from("anuncios").insert(payload as never).select("*").single();
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

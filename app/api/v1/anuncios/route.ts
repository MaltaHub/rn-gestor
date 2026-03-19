import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { parsePagination } from "@/lib/api/request";
import { writeAuditLog } from "@/lib/api/audit";

type CreateAnuncioBody = {
  anuncio_legado?: boolean;
  carro_id?: string;
  descricao?: string | null;
  estado_anuncio?: string;
  id_anuncio_legado?: string | null;
  valor_anuncio?: number | null;
};

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { page, pageSize, from, to } = parsePagination(req);
    const estado = req.nextUrl.searchParams.get("estado_anuncio");

    let query = supabase
      .from("anuncios")
      .select(
        "id, carro_id, estado_anuncio, valor_anuncio, anuncio_legado, id_anuncio_legado, descricao, created_at, carros(placa, nome, preco_original)",
        { count: "exact" }
      )
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
      anuncio_legado: body.anuncio_legado ?? false,
      carro_id: body.carro_id,
      descricao: body.descricao ?? null,
      estado_anuncio: body.estado_anuncio,
      id_anuncio_legado: body.id_anuncio_legado ?? null,
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

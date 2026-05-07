import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/request";
import { createAnuncio, listAnuncios } from "@/lib/domain/anuncios/service";

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { page, pageSize } = parsePagination(req);

    const result = await listAnuncios({
      supabase,
      page,
      pageSize,
      estadoAnuncio: req.nextUrl.searchParams.get("estado_anuncio")
    });

    return apiOk(result.rows, {
      request_id: requestId,
      page,
      page_size: pageSize,
      total: result.total
    });
  });
}

export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const body = (await req.json()) as {
      anuncio_legado?: boolean;
      carro_id?: string;
      descricao?: string | null;
      estado_anuncio?: string;
      id_anuncio_legado?: string | null;
      no_instagram?: boolean;
      valor_anuncio?: number | null;
    };

    const data = await createAnuncio({
      supabase,
      actor,
      row: body
    });

    return apiOk(data, { request_id: requestId });
  });
}

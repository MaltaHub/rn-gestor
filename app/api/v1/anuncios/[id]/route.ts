import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { deleteAnuncio, updateAnuncio } from "@/lib/domain/anuncios/service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const { id } = await params;

    const body = (await req.json()) as {
      anuncio_legado?: boolean;
      descricao?: string | null;
      estado_anuncio?: string;
      id_anuncio_legado?: string | null;
      no_instagram?: boolean;
      valor_anuncio?: number | null;
      priceChangeContext?: string;
    };

    const data = await updateAnuncio({
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

    await deleteAnuncio({ supabase, actor, id });

    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}

/**
 * app/api/v1/anuncios/[id]/insights/route.ts
 *
 * Endpoint de insights por anúncio.
 * Toda a lógica de cálculo é delegada ao serviço em lib/api/anuncios-insights.ts,
 * que por sua vez usa lib/domain/anuncios-insights.ts como fonte da verdade.
 */

import { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { fetchAnuncioInsightItems } from "@/lib/api/anuncios-insights";
import { apiOk } from "@/lib/api/response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return executeAuthenticatedApi(_req, async ({ requestId, supabase }) => {
    const { id } = await params;

    // Verifica existência do anúncio antes de buscar insights
    const { data: anuncioRows, error: readError } = await supabase
      .from("anuncios")
      .select("id")
      .eq("id", id)
      .limit(1);

    if (readError) {
      throw new ApiHttpError(400, "ANUNCIO_READ_FAILED", "Falha ao carregar anúncio.", readError);
    }

    const anuncio = Array.isArray(anuncioRows) ? anuncioRows[0] : null;
    if (!anuncio) {
      throw new ApiHttpError(404, "NOT_FOUND", "Anúncio não encontrado.");
    }

    // Toda a lógica de insight está centralizada no serviço
    const insights = await fetchAnuncioInsightItems(supabase, id);

    return apiOk({ insights }, { request_id: requestId });
  });
}

import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { ApiHttpError } from "@/lib/api/errors";
import { apiOk } from "@/lib/api/response";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(_req, async ({ requestId, supabase }) => {
    const { id } = await params;

    const { data: anuncioRows, error: readError } = await supabase
      .from("anuncios")
      .select("id, carro_id")
      .eq("id", id)
      .limit(1);
    const anuncio = Array.isArray(anuncioRows) ? anuncioRows[0] : null;

    if (readError) throw new ApiHttpError(400, "ANUNCIO_READ_FAILED", "Falha ao carregar anuncio.", readError);
    if (!anuncio) throw new ApiHttpError(404, "NOT_FOUND", "Anuncio nao encontrado.");

    // Le base de insights (unificado) para preco/referencia/delete
    const { data: insightRows, error: insightError } = await supabase
      .from("anuncios_operational_insights" as never)
      .select("carro_id, preco_carro_atual, has_pending_action, delete_recommended, insight_code, insight_message")
      .eq("anuncio_id", id)
      .limit(1);

    if (insightError) {
      throw new ApiHttpError(500, "ANUNCIO_INSIGHTS_FAILED", "Falha ao carregar insights do anuncio.", insightError);
    }
    const insightRow = Array.isArray(insightRows) ? (insightRows[0] as Record<string, unknown> | undefined) : undefined;

    // Verificar duplicidade de anuncios dentro do grupo
    let groupDuplicateCount = 0;
    const { data: repRows, error: repError } = await supabase
      .from("repetidos")
      .select("grupo_id")
      .eq("carro_id", anuncio.carro_id as never)
      .limit(1);
    if (repError) {
      throw new ApiHttpError(500, "ANUNCIO_INSIGHTS_FAILED", "Falha ao verificar grupo do veiculo.", repError);
    }
    const repRow = Array.isArray(repRows) ? repRows[0] : null;
    if (repRow?.grupo_id) {
      const { data: carRows, error: groupCarsError } = await supabase
        .from("repetidos")
        .select("carro_id")
        .eq("grupo_id", repRow.grupo_id as never);
      if (groupCarsError) {
        throw new ApiHttpError(500, "ANUNCIO_INSIGHTS_FAILED", "Falha ao listar veiculos do grupo.", groupCarsError);
      }
      const carroIds = (carRows ?? []).map((r) => r.carro_id).filter(Boolean);
      if (carroIds.length > 0) {
        const { count, error: adCountError } = await supabase
          .from("anuncios")
          .select("id", { count: "exact", head: true })
          .in("carro_id", carroIds as never);
        if (adCountError) {
          throw new ApiHttpError(500, "ANUNCIO_INSIGHTS_FAILED", "Falha ao contar anuncios no grupo.", adCountError);
        }
        groupDuplicateCount = count ?? 0;
      }
    }

    const items: Array<{ code: string; message: string }> = [];
    if (insightRow && (insightRow as Record<string, unknown>).insight_code && (insightRow as Record<string, unknown>).insight_message) {
      // Código unificado para update (preço/referência)
      const row = insightRow as unknown as { insight_code: unknown; insight_message: unknown };
      items.push({ code: String(row.insight_code), message: String(row.insight_message) });
    }
    if (insightRow && (insightRow as Record<string, unknown>).delete_recommended) {
      items.push({ code: "APAGAR_ANUNCIO_RECOMENDADO", message: "Recomendado apagar anuncio (veiculo vendido/fora de estoque)." });
    }
    if (groupDuplicateCount > 1) {
      items.push({
        code: "MULTIPLOS_ANUNCIOS_GRUPO",
        message: "Mais de um veiculo deste grupo esta anunciado; mantenha apenas o representativo."
      });
    }

    return apiOk({ insights: items }, { request_id: requestId });
  });
}

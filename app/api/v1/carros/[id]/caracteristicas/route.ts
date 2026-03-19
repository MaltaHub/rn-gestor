import { NextRequest } from "next/server";
import { executeAuthenticatedApi, executeAuthorizedApi } from "@/lib/api/execute";
import { requireRole } from "@/lib/api/auth";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { toAuditJson, writeAuditLog } from "@/lib/api/audit";

function sanitizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "VENDEDOR");

    const { id } = await params;

    const { data: carro, error: carroError } = await supabase.from("carros").select("id").eq("id", id).maybeSingle();
    if (carroError) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", carroError);
    if (!carro) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

    const [{ data: visuais, error: visuaisError }, { data: tecnicas, error: tecnicasError }] = await Promise.all([
      supabase
        .from("carro_caracteristicas_visuais")
        .select("caracteristica_id")
        .eq("carro_id", id)
        .order("caracteristica_id", { ascending: true }),
      supabase
        .from("carro_caracteristicas_tecnicas")
        .select("caracteristica_id")
        .eq("carro_id", id)
        .order("caracteristica_id", { ascending: true })
    ]);

    if (visuaisError) {
      throw new ApiHttpError(400, "CARRO_FEATURES_READ_FAILED", "Falha ao carregar caracteristicas visuais.", visuaisError);
    }

    if (tecnicasError) {
      throw new ApiHttpError(400, "CARRO_FEATURES_READ_FAILED", "Falha ao carregar caracteristicas tecnicas.", tecnicasError);
    }

    return apiOk(
      {
        caracteristicas_visuais_ids: (visuais ?? []).map((row) => row.caracteristica_id),
        caracteristicas_tecnicas_ids: (tecnicas ?? []).map((row) => row.caracteristica_id)
      },
      { request_id: requestId }
    );
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "SECRETARIO", async ({ actor, requestId, supabase }) => {
    const { id } = await params;
    const body = (await req.json()) as {
      caracteristicas_visuais_ids?: unknown;
      caracteristicas_tecnicas_ids?: unknown;
    };

    const caracteristicasVisuaisIds = sanitizeIds(body.caracteristicas_visuais_ids);
    const caracteristicasTecnicasIds = sanitizeIds(body.caracteristicas_tecnicas_ids);

    const { data: carro, error: carroError } = await supabase.from("carros").select("id").eq("id", id).maybeSingle();
    if (carroError) throw new ApiHttpError(400, "CARRO_READ_FAILED", "Falha ao carregar carro.", carroError);
    if (!carro) throw new ApiHttpError(404, "NOT_FOUND", "Carro nao encontrado.");

    const [{ data: oldVisuais, error: oldVisuaisError }, { data: oldTecnicas, error: oldTecnicasError }] = await Promise.all([
      supabase
        .from("carro_caracteristicas_visuais")
        .select("caracteristica_id")
        .eq("carro_id", id)
        .order("caracteristica_id", { ascending: true }),
      supabase
        .from("carro_caracteristicas_tecnicas")
        .select("caracteristica_id")
        .eq("carro_id", id)
        .order("caracteristica_id", { ascending: true })
    ]);

    if (oldVisuaisError) {
      throw new ApiHttpError(400, "CARRO_FEATURES_READ_FAILED", "Falha ao carregar caracteristicas visuais.", oldVisuaisError);
    }

    if (oldTecnicasError) {
      throw new ApiHttpError(400, "CARRO_FEATURES_READ_FAILED", "Falha ao carregar caracteristicas tecnicas.", oldTecnicasError);
    }

    const [{ error: deleteVisuaisError }, { error: deleteTecnicasError }] = await Promise.all([
      supabase.from("carro_caracteristicas_visuais").delete().eq("carro_id", id),
      supabase.from("carro_caracteristicas_tecnicas").delete().eq("carro_id", id)
    ]);

    if (deleteVisuaisError) {
      throw new ApiHttpError(
        400,
        "CARRO_FEATURES_SYNC_FAILED",
        "Falha ao limpar caracteristicas visuais do veiculo.",
        deleteVisuaisError
      );
    }

    if (deleteTecnicasError) {
      throw new ApiHttpError(
        400,
        "CARRO_FEATURES_SYNC_FAILED",
        "Falha ao limpar caracteristicas tecnicas do veiculo.",
        deleteTecnicasError
      );
    }

    if (caracteristicasVisuaisIds.length > 0) {
      const { error } = await supabase.from("carro_caracteristicas_visuais").insert(
        caracteristicasVisuaisIds.map((caracteristicaId) => ({
          carro_id: id,
          caracteristica_id: caracteristicaId
        }))
      );

      if (error) {
        throw new ApiHttpError(
          400,
          "CARRO_FEATURES_SYNC_FAILED",
          "Falha ao salvar caracteristicas visuais do veiculo.",
          error
        );
      }
    }

    if (caracteristicasTecnicasIds.length > 0) {
      const { error } = await supabase.from("carro_caracteristicas_tecnicas").insert(
        caracteristicasTecnicasIds.map((caracteristicaId) => ({
          carro_id: id,
          caracteristica_id: caracteristicaId
        }))
      );

      if (error) {
        throw new ApiHttpError(
          400,
          "CARRO_FEATURES_SYNC_FAILED",
          "Falha ao salvar caracteristicas tecnicas do veiculo.",
          error
        );
      }
    }

    const oldData = {
      caracteristicas_visuais_ids: (oldVisuais ?? []).map((row) => row.caracteristica_id),
      caracteristicas_tecnicas_ids: (oldTecnicas ?? []).map((row) => row.caracteristica_id)
    };

    const newData = {
      caracteristicas_visuais_ids: caracteristicasVisuaisIds,
      caracteristicas_tecnicas_ids: caracteristicasTecnicasIds
    };

    await writeAuditLog({
      action: "update",
      table: "carros",
      pk: id,
      actor,
      oldData: toAuditJson(oldData),
      newData: toAuditJson(newData),
      details: "Sincronizacao server-side das caracteristicas do veiculo"
    });

    return apiOk(newData, { request_id: requestId });
  });
}

import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { getGridTableConfig } from "@/lib/api/grid-config";
import { isGridRelationTable, parseGridRelationRowId } from "@/lib/api/grid-relation-row-id";
import { writeAuditLog } from "@/lib/api/audit";
import { deleteCarro } from "@/lib/domain/carros/service";
import { deleteAnuncio } from "@/lib/domain/anuncios/service";
import { deleteModelo } from "@/lib/domain/modelos/service";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    const { table, id } = await params;
    const config = getGridTableConfig(table);

    if (!config) {
      throw new ApiHttpError(404, "GRID_TABLE_NOT_FOUND", "Tabela de grid nao suportada.", { table });
    }

    if (config.readOnly) {
      throw new ApiHttpError(405, "GRID_TABLE_READ_ONLY", "Esta planilha e somente leitura.");
    }

    requireRole(actor, config.minDeleteRole);

    if (config.table === "carros") {
      await deleteCarro({ supabase, actor, id });
      return apiOk({ deleted: true, id }, { request_id: requestId });
    }
    if (config.table === "anuncios") {
      await deleteAnuncio({ supabase, actor, id });
      return apiOk({ deleted: true, id }, { request_id: requestId });
    }
    if (config.table === "modelos") {
      await deleteModelo({ supabase, actor, id });
      return apiOk({ deleted: true, id }, { request_id: requestId });
    }

    if (isGridRelationTable(config.table)) {
      const relationRowId = parseGridRelationRowId(id);
      if (!relationRowId) {
        throw new ApiHttpError(400, "INVALID_RELATION_ROW_ID", "Identificador composto invalido.");
      }

      const { data: oldData, error: readError } = await supabase
        .from(config.table)
        .select("*")
        .eq("carro_id", relationRowId.carroId)
        .eq("caracteristica_id", relationRowId.caracteristicaId)
        .maybeSingle();

      if (readError) {
        throw new ApiHttpError(400, "GRID_DELETE_READ_FAILED", "Falha ao carregar registro para remocao.", readError);
      }

      if (!oldData) {
        throw new ApiHttpError(404, "NOT_FOUND", "Registro nao encontrado.", {
          table: config.table,
          pk: id
        });
      }

      const { error } = await supabase
        .from(config.table)
        .delete()
        .eq("carro_id", relationRowId.carroId)
        .eq("caracteristica_id", relationRowId.caracteristicaId);

      if (error) {
        throw new ApiHttpError(400, "GRID_DELETE_FAILED", "Falha ao remover registro da planilha.", error);
      }

      await writeAuditLog({
        action: "delete",
        table: config.table,
        pk: id,
        actor,
        oldData
      });

      return apiOk({ deleted: true, id }, { request_id: requestId });
    }

    const { data: oldData, error: readError } = await supabase
      .from(config.table)
      .select("*")
      .eq(config.primaryKey as never, id as never)
      .maybeSingle();

    if (readError) {
      throw new ApiHttpError(400, "GRID_DELETE_READ_FAILED", "Falha ao carregar registro para remocao.", readError);
    }

    if (!oldData) {
      throw new ApiHttpError(404, "NOT_FOUND", "Registro nao encontrado.", {
        table: config.table,
        pk: id
      });
    }

    const { error } = await supabase.from(config.table).delete().eq(config.primaryKey as never, id as never);

    if (error) {
      throw new ApiHttpError(400, "GRID_DELETE_FAILED", "Falha ao remover registro da planilha.", error);
    }

    await writeAuditLog({
      action: "delete",
      table: config.table,
      pk: id,
      actor,
      oldData
    });

    return apiOk({ deleted: true, id }, { request_id: requestId });
  });
}

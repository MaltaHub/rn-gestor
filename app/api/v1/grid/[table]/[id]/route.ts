import { NextRequest } from "next/server";
import { executeApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { ApiHttpError } from "@/lib/api/errors";
import { getActorContext, requireRole } from "@/lib/api/auth";
import { getGridTableConfig } from "@/lib/api/grid-config";
import { writeAuditLog } from "@/lib/api/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  return executeApi(req, async ({ requestId }) => {
    const { table, id } = await params;
    const config = getGridTableConfig(table);

    if (!config) {
      throw new ApiHttpError(404, "GRID_TABLE_NOT_FOUND", "Tabela de grid nao suportada.", { table });
    }

    if (config.readOnly) {
      throw new ApiHttpError(405, "GRID_TABLE_READ_ONLY", "Esta planilha e somente leitura.");
    }

    const actor = getActorContext(req);
    requireRole(actor, config.minDeleteRole);

    const supabase = getSupabaseAdmin();

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

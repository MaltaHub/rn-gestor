import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { folderAutomationPauseSchema } from "@/lib/domain/files/schemas";
import { setManagedFolderAutomationPaused } from "@/lib/domain/file-automations/service";

/**
 * PATCH /files/folders/[folderId]/automation
 * Liga/desliga ("Automatizar") o reparse automatico de documentos da pasta.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const { folderId } = await params;
    const body = await parseJsonBody(req, folderAutomationPauseSchema);

    const result = await setManagedFolderAutomationPaused({
      supabase,
      folderId,
      paused: body.paused
    });

    await writeAuditLog({
      action: "update",
      table: "arquivo_automacao_folders",
      pk: folderId,
      actor,
      newData: result,
      details: body.paused
        ? "Automacao de documentos pausada para a pasta."
        : "Automacao de documentos reativada para a pasta."
    });

    return apiOk(result, { request_id: requestId });
  });
}

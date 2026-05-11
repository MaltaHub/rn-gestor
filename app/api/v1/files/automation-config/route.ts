import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { fileAutomationConfigPatchSchema } from "@/lib/domain/files/schemas";
import {
  FILE_AUTOMATION_REPOSITORY_KEYS,
  getFileAutomationSettings,
  updateFileAutomationSettings,
  type FileAutomationRepositoryKey
} from "@/lib/domain/file-automations/service";

function normalizeRepositories(
  value: Partial<Record<FileAutomationRepositoryKey, string | undefined>> | undefined
): Partial<Record<FileAutomationRepositoryKey, string>> {
  if (!value) return {};
  const repositories: Partial<Record<FileAutomationRepositoryKey, string>> = {};
  for (const key of FILE_AUTOMATION_REPOSITORY_KEYS) {
    const raw = value[key];
    if (raw === undefined) continue;
    repositories[key] = String(raw).trim();
  }
  return repositories;
}

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");
    const settings = await getFileAutomationSettings(supabase);
    return apiOk(settings, { request_id: requestId });
  });
}

export async function PATCH(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const body = await parseJsonBody(req, fileAutomationConfigPatchSchema);

    const oldSettings = await getFileAutomationSettings(supabase);
    const settings = await updateFileAutomationSettings({
      supabase,
      actor,
      displayField: body.displayField,
      repositories: normalizeRepositories(body.repositories)
    });

    await writeAuditLog({
      action: "update",
      table: "arquivo_automacao_config",
      pk: "file-automations",
      actor,
      oldData: oldSettings,
      newData: settings,
      details: "Configuracao das automacoes de arquivos atualizada."
    });

    return apiOk(settings, { request_id: requestId });
  });
}

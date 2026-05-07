import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import {
  FILE_AUTOMATION_REPOSITORY_KEYS,
  getFileAutomationSettings,
  isVehicleFolderDisplayField,
  updateFileAutomationSettings,
  type FileAutomationRepositoryKey
} from "@/lib/domain/file-automations/service";

type AutomationConfigPayload = {
  displayField?: string;
  repositories?: Partial<Record<FileAutomationRepositoryKey, string>>;
};

function parseRepositories(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const payload = value as Record<string, unknown>;
  const repositories: Partial<Record<FileAutomationRepositoryKey, string>> = {};

  for (const key of FILE_AUTOMATION_REPOSITORY_KEYS) {
    if (payload[key] === undefined) continue;
    repositories[key] = String(payload[key] ?? "").trim();
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

    const body = (await req.json().catch(() => null)) as AutomationConfigPayload | null;
    const displayField = String(body?.displayField ?? "").trim();

    if (!isVehicleFolderDisplayField(displayField)) {
      throw new ApiHttpError(400, "FILE_AUTOMATION_DISPLAY_FIELD_INVALID", "Campo de exibicao invalido.", {
        displayField
      });
    }

    const oldSettings = await getFileAutomationSettings(supabase);
    const settings = await updateFileAutomationSettings({
      supabase,
      actor,
      displayField,
      repositories: parseRepositories(body?.repositories)
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

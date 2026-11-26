import { NextRequest } from "next/server";
import { z } from "zod";
import { describeAudit } from "@/lib/api/audit-context";
import { ApiHttpError } from "@/lib/api/errors";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { checkBackupLink, getBackupLink, normalizeBackupLink, setBackupLink } from "@/lib/domain/backup/link";

const bodySchema = z
  .object({
    url: z.string().max(400),
    /** true = só testa o link informado, sem gravar. */
    apenasTestar: z.boolean().optional()
  })
  .strict();

/** Link atual. `?testar=1` também testa se ele responde. */
export async function GET(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ requestId, supabase }) => {
    const link = await getBackupLink(supabase, requestId);
    const check = req.nextUrl.searchParams.get("testar") === "1" && link.url ? await checkBackupLink(link.url) : null;
    return apiOk({ link, check }, { request_id: requestId });
  });
}

/** Troca o link. Só grava se o novo link responder como o Apps Script do backup. */
export async function PUT(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ requestId, supabase }) => {
    const body = await parseJsonBody(req, bodySchema);
    const url = normalizeBackupLink(body.url);
    if (!url) {
      throw new ApiHttpError(
        400,
        "BACKUP_LINK_INVALID",
        "Link inválido. Use o endereço que termina em /exec (Implantar → Gerenciar implantações)."
      );
    }

    const check = await checkBackupLink(url);
    if (body.apenasTestar) {
      return apiOk({ link: null, check }, { request_id: requestId });
    }
    if (!check.ok) {
      throw new ApiHttpError(400, "BACKUP_LINK_UNREACHABLE", check.message);
    }

    describeAudit("Link do Apps Script do backup alterado pelo administrador.");
    const link = await setBackupLink(supabase, requestId, url);
    return apiOk({ link, check }, { request_id: requestId });
  });
}

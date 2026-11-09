import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validation";
import { folderCreateSchema } from "@/lib/domain/files/schemas";
import { toExplorerFolder } from "@/lib/files/explorer-service";
import { assertFolderParentValid, assertFolderSlugAvailable } from "@/lib/files/service";
import { normalizeFolderName, toFolderSlug } from "@/lib/files/shared";

function resolveFolderName(raw: string) {
  const name = normalizeFolderName(raw);
  if (!name) {
    throw new ApiHttpError(400, "FILES_FOLDER_NAME_REQUIRED", "Informe o nome da pasta.");
  }
  const slug = toFolderSlug(name);
  if (!slug) {
    throw new ApiHttpError(400, "FILES_FOLDER_NAME_INVALID", "O nome da pasta nao gerou um identificador valido.");
  }
  return { name, slug };
}

// A listagem saiu daqui: o explorer le tudo de GET /files/index.
export async function POST(req: NextRequest) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const body = await parseJsonBody(req, folderCreateSchema);
    const { name, slug } = resolveFolderName(body.name);
    const parentFolder = await assertFolderParentValid(supabase, body.parentFolderId ?? null);

    await assertFolderSlugAvailable(supabase, slug, parentFolder?.id ?? null);

    const { data, error } = await supabase
      .from("arquivos_pastas")
      .insert({
        nome: name,
        nome_slug: slug,
        descricao: body.description ?? null,
        parent_folder_id: parentFolder?.id ?? null,
        created_by: actor.userId,
        updated_by: actor.userId
      })
      .select("*")
      .single();

    if (error) {
      console.error("[FILES_FOLDER_CREATE_FAILED]", { requestId, error });
      throw new ApiHttpError(400, "FILES_FOLDER_CREATE_FAILED", "Falha ao criar pasta.");
    }

    return apiOk({ folder: toExplorerFolder(data) }, { request_id: requestId });
  });
}

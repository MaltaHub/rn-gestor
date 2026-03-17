import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import { assertFolderParentValid, assertFolderSlugAvailable, listFolderSummaries } from "@/lib/files/service";
import { normalizeFolderName, normalizeOptionalDescription, toFolderSlug } from "@/lib/files/shared";

type FolderPayload = {
  name?: string;
  description?: string | null;
  parentFolderId?: string | null;
};

function parseFolderName(raw: string | null | undefined) {
  const name = normalizeFolderName(raw ?? "");

  if (!name) {
    throw new ApiHttpError(400, "FILES_FOLDER_NAME_REQUIRED", "Informe o nome da pasta.");
  }

  if (name.length > 120) {
    throw new ApiHttpError(400, "FILES_FOLDER_NAME_TOO_LONG", "O nome da pasta suporta ate 120 caracteres.");
  }

  const slug = toFolderSlug(name);
  if (!slug) {
    throw new ApiHttpError(400, "FILES_FOLDER_NAME_INVALID", "O nome da pasta nao gerou um identificador valido.");
  }

  return { name, slug };
}

export async function GET(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const folders = await listFolderSummaries(supabase);
    return apiOk({ folders }, { request_id: requestId });
  });
}

export async function POST(req: NextRequest) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const body = (await req.json()) as FolderPayload;
    const { name, slug } = parseFolderName(body.name);
    const description = normalizeOptionalDescription(body.description);
    const parentFolder = await assertFolderParentValid(supabase, body.parentFolderId);

    await assertFolderSlugAvailable(supabase, slug);

    const { data, error } = await supabase
      .from("arquivos_pastas")
      .insert({
        nome: name,
        nome_slug: slug,
        descricao: description,
        parent_folder_id: parentFolder?.id ?? null,
        created_by: actor.userId,
        updated_by: actor.userId
      })
      .select("*")
      .single();

    if (error) {
      throw new ApiHttpError(400, "FILES_FOLDER_CREATE_FAILED", "Falha ao criar pasta.", error);
    }

    await writeAuditLog({
      action: "create",
      table: "arquivos_pastas",
      pk: data.id,
      actor,
      newData: data,
      details: parentFolder
        ? `Pasta ${name} criada dentro de ${parentFolder.nome} no gerenciador de arquivos.`
        : `Pasta ${name} criada no gerenciador de arquivos.`
    });

    return apiOk(
      {
        folder: {
          id: data.id,
          name: data.nome,
          slug: data.nome_slug,
          description: data.descricao,
          parentFolderId: data.parent_folder_id,
          fileCount: 0,
          childFolderCount: 0,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        }
      },
      { request_id: requestId }
    );
  });
}

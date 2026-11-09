import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { describeAudit } from "@/lib/api/audit-context";
import {
  assertFolderParentValid,
  assertFolderSlugAvailable,
  deleteStoredObjects,
  getFolderRowOrThrow,
  listFolderSubtreeFileRows
} from "@/lib/files/service";
import { assertFoldersNotSystem, getExplorerFolder } from "@/lib/files/explorer-service";
import {
  assertFolderTreeDoesNotContainAutomationRepository,
  resolvePhotoCarIdsForFolders,
  resolvePhotoCarIdsInFolderSubtree,
  syncPhotoFlagsForCarIds
} from "@/lib/domain/file-automations/service";
import { parseJsonBody } from "@/lib/api/validation";
import { folderUpdateSchema } from "@/lib/domain/files/schemas";
import { normalizeFolderName, normalizeOptionalDescription, toFolderSlug } from "@/lib/files/shared";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ actor, requestId, supabase }) => {
    const { folderId } = await params;
    const current = await getFolderRowOrThrow(supabase, folderId);
    const body = await parseJsonBody(req, folderUpdateSchema);

    const nextNameRaw = body.name == null ? current.nome : normalizeFolderName(body.name);
    if (!nextNameRaw) {
      throw new ApiHttpError(400, "FILES_FOLDER_NAME_REQUIRED", "Informe o nome da pasta.");
    }

    const slug = toFolderSlug(nextNameRaw);
    if (!slug) {
      throw new ApiHttpError(400, "FILES_FOLDER_NAME_INVALID", "O nome da pasta nao gerou um identificador valido.");
    }

    const nextParentId = body.parentFolderId === undefined ? current.parent_folder_id : body.parentFolderId || null;
    if (nextNameRaw !== current.nome || nextParentId !== current.parent_folder_id) {
      await assertFoldersNotSystem(supabase, [folderId], "alterar");
    }
    await assertFolderParentValid(supabase, nextParentId, folderId);
    await assertFolderSlugAvailable(supabase, slug, nextParentId, folderId);
    const impactedPhotoCarIdsBefore = await resolvePhotoCarIdsForFolders(supabase, [folderId]);

    const { error } = await supabase
      .from("arquivos_pastas")
      .update({
        nome: nextNameRaw,
        nome_slug: slug,
        descricao: body.description === undefined ? current.descricao : normalizeOptionalDescription(body.description),
        parent_folder_id: nextParentId,
        updated_at: new Date().toISOString(),
        updated_by: actor.userId
      })
      .eq("id", folderId);

    if (error) {
      console.error("[FILES_FOLDER_UPDATE_FAILED]", { requestId, error });
      throw new ApiHttpError(400, "FILES_FOLDER_UPDATE_FAILED", "Falha ao atualizar pasta.");
    }

    const impactedPhotoCarIdsAfter = await resolvePhotoCarIdsForFolders(supabase, [folderId]);
    await syncPhotoFlagsForCarIds(supabase, [...impactedPhotoCarIdsBefore, ...impactedPhotoCarIdsAfter]);

    return apiOk({ folder: await getExplorerFolder(supabase, folderId) }, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ requestId, supabase }) => {
    const { folderId } = await params;
    const folder = await getFolderRowOrThrow(supabase, folderId);
    const { folderIds, files } = await listFolderSubtreeFileRows(supabase, folderId);
    await assertFolderTreeDoesNotContainAutomationRepository(supabase, folderId);
    await assertFoldersNotSystem(supabase, folderIds, "excluir");
    const impactedPhotoCarIds = Array.from(
      new Set([
        ...(await resolvePhotoCarIdsForFolders(supabase, [folderId])),
        ...(await resolvePhotoCarIdsInFolderSubtree(supabase, folderId))
      ])
    );

    describeAudit(`Pasta ${folder.nome} excluída com ${files.length} arquivo(s).`, { batch: true });
    const { error } = await supabase.from("arquivos_pastas").delete().eq("id", folderId);

    if (error) {
      console.error("[FILES_FOLDER_DELETE_FAILED]", { requestId, error });
      throw new ApiHttpError(400, "FILES_FOLDER_DELETE_FAILED", "Falha ao excluir pasta.");
    }

    await deleteStoredObjects(
      supabase,
      files.map((file) => file.storage_path)
    ).catch((storageError) => console.error("[FILES_STORAGE_DELETE_FAILED]", { requestId, storageError }));

    await syncPhotoFlagsForCarIds(supabase, impactedPhotoCarIds);

    return apiOk(
      { deleted: true, id: folderId, folderIds, fileIds: files.map((file) => file.id) },
      { request_id: requestId }
    );
  });
}

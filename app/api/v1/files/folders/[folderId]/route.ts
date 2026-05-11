import { NextRequest } from "next/server";
import { executeAuthenticatedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { writeAuditLog } from "@/lib/api/audit";
import {
  assertFolderParentValid,
  assertFolderSlugAvailable,
  deleteStoredObjects,
  getFolderDetail,
  getFolderRowOrThrow,
  listFolderSubtreeFileRows
} from "@/lib/files/service";
import {
  assertFolderTreeDoesNotContainAutomationRepository,
  resolvePhotoCarIdsForFolders,
  resolvePhotoCarIdsInFolderSubtree,
  syncPhotoFlagsForCarIds
} from "@/lib/domain/file-automations/service";
import { parseJsonBody } from "@/lib/api/validation";
import { folderUpdateSchema } from "@/lib/domain/files/schemas";
import { normalizeFolderName, normalizeOptionalDescription, toFolderSlug } from "@/lib/files/shared";

export async function GET(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  return executeAuthenticatedApi(req, async ({ requestId, supabase }) => {
    const { folderId } = await params;
    const detail = await getFolderDetail(supabase, folderId);
    return apiOk(detail, { request_id: requestId });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

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
    await assertFolderParentValid(supabase, nextParentId, folderId);
    await assertFolderSlugAvailable(supabase, slug, nextParentId, folderId);
    const impactedPhotoCarIdsBefore = await resolvePhotoCarIdsForFolders(supabase, [folderId]);

    const { data, error } = await supabase
      .from("arquivos_pastas")
      .update({
        nome: nextNameRaw,
        nome_slug: slug,
        descricao: body.description === undefined ? current.descricao : normalizeOptionalDescription(body.description),
        parent_folder_id: nextParentId,
        updated_at: new Date().toISOString(),
        updated_by: actor.userId
      })
      .eq("id", folderId)
      .select("*")
      .single();

    if (error) {
      throw new ApiHttpError(400, "FILES_FOLDER_UPDATE_FAILED", "Falha ao atualizar pasta.", error);
    }

    await writeAuditLog({
      action: "update",
      table: "arquivos_pastas",
      pk: data.id,
      actor,
      oldData: current,
      newData: data,
      details: `Pasta ${current.nome} renomeada para ${data.nome}.`
    });

    const impactedPhotoCarIdsAfter = await resolvePhotoCarIdsForFolders(supabase, [folderId]);
    await syncPhotoFlagsForCarIds(supabase, [...impactedPhotoCarIdsBefore, ...impactedPhotoCarIdsAfter]);

    const detail = await getFolderDetail(supabase, folderId);
    return apiOk(detail, { request_id: requestId });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  return executeAuthenticatedApi(req, async ({ actor, requestId, supabase }) => {
    requireRole(actor, "ADMINISTRADOR");

    const { folderId } = await params;
    const folder = await getFolderRowOrThrow(supabase, folderId);
    const files = await listFolderSubtreeFileRows(supabase, folderId);
    await assertFolderTreeDoesNotContainAutomationRepository(supabase, folderId);
    const impactedPhotoCarIds = Array.from(
      new Set([
        ...(await resolvePhotoCarIdsForFolders(supabase, [folderId])),
        ...(await resolvePhotoCarIdsInFolderSubtree(supabase, folderId))
      ])
    );

    const { error } = await supabase.from("arquivos_pastas").delete().eq("id", folderId);

    if (error) {
      throw new ApiHttpError(400, "FILES_FOLDER_DELETE_FAILED", "Falha ao excluir pasta.", error);
    }

    await deleteStoredObjects(
      supabase,
      files.map((file) => file.storage_path)
    ).catch(() => undefined);

    await writeAuditLog({
      action: "delete",
      table: "arquivos_pastas",
      pk: folderId,
      actor,
      oldData: {
        ...folder,
        total_arquivos: files.length
      },
      details: `Pasta ${folder.nome} removida com ${files.length} arquivo(s) na arvore completa.`
    });

    await syncPhotoFlagsForCarIds(supabase, impactedPhotoCarIds);

    return apiOk({ deleted: true, id: folderId }, { request_id: requestId });
  });
}

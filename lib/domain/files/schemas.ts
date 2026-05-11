import { z } from "zod";
import {
  FILE_AUTOMATION_REPOSITORY_KEYS,
  VEHICLE_FOLDER_DISPLAY_FIELDS
} from "@/lib/domain/file-automations/service";

/**
 * Runtime schemas for the `app/api/v1/files/**` routes.
 *
 * Design choices (apply unless a schema overrides):
 * - Extras are STRIPPED (Zod default `.strip()`), not rejected — clients
 *   occasionally send UI-only metadata (e.g. tracking flags) we don't want to
 *   reject. Strict shapes use `.strict()` explicitly when the route must
 *   refuse unknown keys (e.g. admin user PATCH).
 * - String fields are trimmed at the boundary so downstream code doesn't have
 *   to re-normalize.
 * - Bounds (`max(120)`, `max(240)`) mirror the existing manual checks so the
 *   error semantics are unchanged for callers — just centralized.
 */

const trimmedString = (max: number) => z.string().trim().min(1).max(max);
const optionalNullableString = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      return value.length === 0 ? null : value;
    });

const optionalParentFolderId = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return value.length === 0 ? null : value;
  });

const repositoriesShape = Object.fromEntries(
  FILE_AUTOMATION_REPOSITORY_KEYS.map((key) => [key, z.string().optional()] as const)
);

/** PATCH /files/automation-config */
export const fileAutomationConfigPatchSchema = z.object({
  displayField: z.enum(VEHICLE_FOLDER_DISPLAY_FIELDS),
  repositories: z.object(repositoriesShape).optional()
});
export type FileAutomationConfigPatchInput = z.infer<typeof fileAutomationConfigPatchSchema>;

/** POST /files/folders */
export const folderCreateSchema = z.object({
  name: trimmedString(120),
  description: optionalNullableString(2000),
  parentFolderId: optionalParentFolderId
});
export type FolderCreateInput = z.infer<typeof folderCreateSchema>;

/** PATCH /files/folders/[folderId] */
export const folderUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: optionalNullableString(2000),
    parentFolderId: optionalParentFolderId
  })
  .refine(
    (value) => value.name !== undefined || value.description !== undefined || value.parentFolderId !== undefined,
    { message: "Informe ao menos um campo para atualizar." }
  );
export type FolderUpdateInput = z.infer<typeof folderUpdateSchema>;

/** PATCH /files/folders/[folderId]/files/reorder */
export const fileReorderSchema = z.object({
  fileIds: z.array(z.string().trim().min(1)).min(1)
});
export type FileReorderInput = z.infer<typeof fileReorderSchema>;

/** PATCH /files/files/[fileId] */
export const fileUpdateSchema = z
  .object({
    fileName: z.string().trim().min(1).max(240).optional(),
    folderId: z
      .union([z.string().trim().min(1), z.null()])
      .optional()
  })
  .refine((value) => value.fileName !== undefined || value.folderId !== undefined, {
    message: "Informe ao menos um campo para atualizar."
  });
export type FileUpdateInput = z.infer<typeof fileUpdateSchema>;

/** POST /files/uploads/prepare */
const prepareUploadFileSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.union([z.string(), z.null()]).optional(),
  sizeBytes: z.number().int().positive()
});

export const prepareUploadsSchema = z.object({
  folderId: z.string().trim().min(1),
  files: z.array(prepareUploadFileSchema).min(1)
});
export type PrepareUploadsInput = z.infer<typeof prepareUploadsSchema>;

/** POST /files/uploads/finalize */
const finalizeEntrySchema = z.object({
  fileId: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  storagePath: z.string().trim().min(1)
});

export const finalizeUploadsSchema = z.object({
  folderId: z.string().trim().min(1),
  entries: z.array(finalizeEntrySchema).min(1)
});
export type FinalizeUploadsInput = z.infer<typeof finalizeUploadsSchema>;

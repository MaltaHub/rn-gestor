import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import { findVehicleManagedFolderId } from "@/lib/domain/file-automations/service";
import { listSignedFolderFiles, type FileItem } from "@/lib/files/service";
import type { Database } from "@/lib/supabase/database.types";

type DomainSupabase = SupabaseClient<Database>;

export type VehiclePhoto = {
  id: string;
  fileName: string;
  previewUrl: string | null;
  downloadUrl: string | null;
  sortOrder: number;
};

export type VehiclePhotosResult = {
  cover: VehiclePhoto | null;
  photos: VehiclePhoto[];
};

/**
 * Fotos do veículo (da pasta `fotos_pasta_id`) já com URL de preview assinada,
 * ordenadas. `cover` é a `foto_capa_id` quando presente, senão a primeira.
 */
export async function listVehiclePhotos(supabase: DomainSupabase, carroId: string): Promise<VehiclePhotosResult> {
  const { data: carro, error } = await supabase
    .from("carros")
    .select("id, foto_capa_id, fotos_pasta_id")
    .eq("id", carroId)
    .maybeSingle();

  if (error) throw new ApiHttpError(500, "CARRO_READ_FAILED", "Falha ao carregar veiculo.", error);
  if (!carro) throw new ApiHttpError(404, "NOT_FOUND", "Veiculo nao encontrado.");
  if (!carro.fotos_pasta_id) return { cover: null, photos: [] };

  const files = await listSignedFolderFiles(supabase, carro.fotos_pasta_id);
  const photos: VehiclePhoto[] = files
    .filter((file) => file.mimeType.startsWith("image/") && !file.isMissing && Boolean(file.previewUrl))
    .map((file) => ({
      id: file.id,
      fileName: file.fileName,
      previewUrl: file.previewUrl,
      downloadUrl: file.downloadUrl,
      sortOrder: file.sortOrder
    }));

  const cover = photos.find((photo) => photo.id === carro.foto_capa_id) ?? photos[0] ?? null;
  return { cover, photos };
}

export type VehicleDocumentsResult = {
  /** Placa usada pelo cliente para casar arquivos com os tipos do catálogo. */
  placa: string;
  files: FileItem[];
};

/**
 * Arquivos da pasta de documentos do veículo (somente leitura — preview/download
 * assinados). O agrupamento por tipo (DOCUMENT_TYPES) é feito no cliente.
 */
export async function listVehicleDocuments(supabase: DomainSupabase, carroId: string): Promise<VehicleDocumentsResult> {
  const { data: carro, error } = await supabase
    .from("carros")
    .select("id, placa")
    .eq("id", carroId)
    .maybeSingle();

  if (error) throw new ApiHttpError(500, "CARRO_READ_FAILED", "Falha ao carregar veiculo.", error);
  if (!carro) throw new ApiHttpError(404, "NOT_FOUND", "Veiculo nao encontrado.");

  const folderId = await findVehicleManagedFolderId(supabase, "vehicle_documents", carroId);
  const files = folderId ? await listSignedFolderFiles(supabase, folderId) : [];

  return { placa: carro.placa, files };
}
